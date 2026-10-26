import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Copy, CopyCheck, ExternalLink, MessageSquare, MoreHorizontal, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { postsByOf, useAllAccounts, useMe, useTeam, usePeopleMap, usePlatforms, useRefresh, useTopics, type PostableAccount } from "@/lib/data";
import { fmtDateTime } from "@/lib/dates";
import { attempt, errorMessage } from "@/lib/errors";
import type { MediaLink, PostDetail, PostVersion, Topic } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AccountPicker } from "@/components/account-picker";
import { Confirm } from "@/components/confirm";
import { DateTimePicker } from "@/components/date-picker";
import { PersonAvatar, PersonSelect } from "@/components/people";
import { PlatformIcon } from "@/components/platform";
import { StatusBadge, StatusDot, StatusSelect, VersionStatus } from "@/components/status";
import { MAX_MEDIA_LINKS, type Status } from "../../../shared/rules";

export function PostPage() {
  const { id } = useParams();
  return id ? <EditPost key={id} id={Number(id)} /> : <NewPostLoader />;
}

const NO_TOPIC = "__none";
const templateOf = (topics: Topic[], id: number | null) => topics.find((t) => t.id === id)?.template ?? "";

// ---------------------------------------------------------------------------------------
// The form (same for new and existing posts)
// ---------------------------------------------------------------------------------------

/**
 * One version: what goes out on one account. `status` is only edited here before the version is
 * saved; after that it changes straight away through VersionStatus.
 */
type Draft = {
  account_id: number; body: string; media: MediaLink[];
  writer_id: number | null; creative_id: number | null; poster_id: number | null;
  scheduled_at: number | null; posted_url: string; status: Status;
};

type Values = { title: string; notes: string; scheduled_at: number | null; topic_id: number | null; versions: Draft[] };

/** Changes every version: the same fields for all, or fields worked out from each version. */
type ApplyToAll = (change: Partial<Draft> | ((d: Draft) => Partial<Draft>)) => void;

/** Is this address among the links? Blank rows don't count. */
const hasLink = (media: MediaLink[], url: string) => media.some((m) => m.url.trim() === url.trim());

// Saved versions' statuses aren't part of the form, so they never make it "unsaved".
const same = (a: Values, b: Values) => {
  const strip = (v: Values) => JSON.stringify({ ...v, versions: v.versions.map(({ status: _, ...d }) => d) });
  return strip(a) === strip(b);
};

/** Has someone worked on this version, so removing its account would lose something? */
const worked = (d: Draft, template: string) => (!!d.body.trim() && d.body !== template) || d.media.length > 0 || !!d.posted_url.trim();

function PostForm({
  initial, isNew, saving, onSave, header, live, writer,
}: {
  initial: Values; isNew: boolean; saving: boolean; onSave: (v: Values) => void; header?: React.ReactNode;
  /** the saved post, for its versions' statuses (they save straight away, outside the form) */
  live?: PostDetail;
  /** who writes new versions by default */
  writer: number | null;
}) {
  const team = useTeam();
  const accounts = useAllAccounts();
  const topics = useTopics().data ?? [];
  const [v, setV] = useState(initial);
  // The open version is in the address (?v=<account id>), so saving or reloading stays on it.
  const [sp, setSp] = useSearchParams();
  const active = Number(sp.get("v")) || null;
  const setActive = (id: number) => setSp((p) => (p.set("v", String(id)), p), { replace: true });
  const [removing, setRemoving] = useState<{ ids: number[]; lost: Draft[] } | null>(null);
  const set = (patch: Partial<Values>) => setV((x) => ({ ...x, ...patch }));
  const dirty = !same(v, initial);
  const template = templateOf(topics, v.topic_id);

  // Accounts keep their version while picked; a newly picked one starts from the topic's text.
  const applyAccounts = (ids: number[]) => {
    setV((x) => ({
      ...x,
      versions: ids.map((id) => x.versions.find((d) => d.account_id === id) ?? {
        account_id: id, body: templateOf(topics, x.topic_id), media: [], writer_id: writer, creative_id: null,
        poster_id: postsByOf(accounts, id, team), scheduled_at: null, posted_url: "", status: "not_ready",
      }),
    }));
    const added = ids.find((id) => !v.versions.some((d) => d.account_id === id));
    if (added) setActive(added);
  };
  const setAccounts = (ids: number[]) => {
    const lost = v.versions.filter((d) => !ids.includes(d.account_id) && worked(d, template));
    if (lost.length) setRemoving({ ids, lost });
    else applyAccounts(ids);
  };
  const setDraft = (id: number, patch: Partial<Draft>) =>
    setV((x) => ({ ...x, versions: x.versions.map((d) => (d.account_id === id ? { ...d, ...patch } : d)) }));

  // Switching topic swaps in the new topic's text on versions nobody has written on yet.
  const setTopic = (id: number | null) =>
    setV((x) => {
      const old = templateOf(topics, x.topic_id);
      const next = templateOf(topics, id);
      return { ...x, topic_id: id, versions: x.versions.map((d) => (!d.body.trim() || d.body === old ? { ...d, body: next } : d)) };
    });

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty || isNew) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty, isNew]);

  const submit = () => {
    if (!v.title.trim()) return void toast.error("Give the post a title");
    onSave(v);
  };

  return (
    <div
      className="space-y-6"
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "s") {
          e.preventDefault();
          submit();
        }
      }}
    >
      {header}
      <Card>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel>Topic</FieldLabel>
              <Select value={v.topic_id ? String(v.topic_id) : NO_TOPIC} onValueChange={(t) => setTopic(t === NO_TOPIC ? null : Number(t))}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_TOPIC}><span className="text-muted-foreground">No topic</span></SelectItem>
                  {topics.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="title">Title</FieldLabel>
              <Input id="title" autoFocus={isNew} value={v.title} onChange={(e) => set({ title: e.target.value })} placeholder="What's this post about?" />
            </Field>
            <Field>
              <FieldLabel>Post to</FieldLabel>
              <AccountPicker selected={v.versions.map((d) => d.account_id)} onChange={setAccounts} />
            </Field>
            <Field className="sm:max-w-xs">
              <FieldLabel>When</FieldLabel>
              <DateTimePicker value={v.scheduled_at} onChange={(ms) => set({ scheduled_at: ms })} placeholder="No date yet" />
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Versions
        drafts={v.versions} active={active} setActive={setActive} onChange={setDraft} live={live} postTime={v.scheduled_at}
        applyToAll={(change) => setV((x) => ({ ...x, versions: x.versions.map((o) => ({ ...o, ...(typeof change === "function" ? change(o) : change) })) }))}
      />

      <Card>
        <CardContent>
          <Field>
            <FieldLabel htmlFor="notes">Notes for the team</FieldLabel>
            <Textarea id="notes" value={v.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Brief, hashtags, where the assets are…" />
          </Field>
        </CardContent>
      </Card>

      <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
        {!isNew && dirty && <span className="mr-auto text-sm text-amber-600 dark:text-amber-400">Unsaved changes</span>}
        <Button disabled={saving || (!isNew && !dirty)} onClick={submit}>{saving ? "Saving…" : isNew ? "Create post" : "Save changes"}</Button>
      </div>

      <AlertDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing?.lost.length === 1 ? "this version" : `${removing?.lost.length} versions`}?</AlertDialogTitle>
            <AlertDialogDescription>
              {removing?.lost.map((d) => accountName(accounts.find((a) => a.id === d.account_id))).join(", ")}{" "}
              {removing?.lost.length === 1 ? "has" : "have"} text or links that will be lost when you save.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => removing && applyAccounts(removing.ids)}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const accountName = (a?: PostableAccount) => (a ? `${a.platform_name} ${a.handle}` : "An account");

/**
 * The versions as a slider: a chip per account to jump to it, arrows (or a swipe) to step
 * through, and one version shown at a time.
 */
function Versions({ drafts, active, setActive, onChange, live, postTime, applyToAll }: {
  drafts: Draft[]; active: number | null; setActive: (id: number) => void; onChange: (id: number, patch: Partial<Draft>) => void;
  live?: PostDetail; postTime: number | null; applyToAll: ApplyToAll;
}) {
  const accounts = useAllAccounts();
  const touch = useRef<number | null>(null);
  if (!drafts.length)
    return (
      <Card>
        <CardContent className="py-2 text-sm text-muted-foreground">
          Pick accounts above. Each one gets its own version of the post, with its own text, media, people and time.
        </CardContent>
      </Card>
    );
  const i = Math.max(0, drafts.findIndex((d) => d.account_id === active));
  const go = (n: number) => setActive(drafts[(n + drafts.length) % drafts.length].account_id);
  const statusOf = (d: Draft) => live?.versions.find((x) => x.account_id === d.account_id)?.status ?? d.status;
  const d = drafts[i];
  return (
    <Card className="gap-4">
      <CardHeader className="flex flex-wrap items-center gap-2">
        <CardTitle className="mr-auto">Versions</CardTitle>
        {drafts.length > 1 && (
          <div className="flex items-center gap-1 text-sm tabular-nums text-muted-foreground">
            <Button variant="ghost" size="icon-sm" onClick={() => go(i - 1)} aria-label="Previous version"><ChevronLeft /></Button>
            {i + 1} / {drafts.length}
            <Button variant="ghost" size="icon-sm" onClick={() => go(i + 1)} aria-label="Next version"><ChevronRight /></Button>
          </div>
        )}
        <div role="tablist" aria-label="Versions" className="flex w-full flex-wrap gap-1.5">
          {drafts.map((x, n) => {
            const a = accounts.find((acc) => acc.id === x.account_id);
            return (
              <button key={x.account_id} type="button" role="tab" aria-selected={n === i} onClick={() => setActive(x.account_id)}
                className={cn("flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  n === i && "border-primary bg-primary/5 font-medium")}>
                {a && <PlatformIcon k={a.platform_key} name={a.platform_name} color={a.platform_color} className="size-3.5" />}
                <span className="max-w-32 truncate">{a?.handle ?? "Account"}</span>
                <StatusDot status={statusOf(x)} />
              </button>
            );
          })}
        </div>
      </CardHeader>
      <CardContent
        onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touch.current === null) return;
          const dx = e.changedTouches[0].clientX - touch.current;
          touch.current = null;
          if (Math.abs(dx) > 60 && drafts.length > 1 && !(e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement)) go(dx < 0 ? i + 1 : i - 1);
        }}
      >
        <VersionEditor key={d.account_id} draft={d} onChange={(patch) => onChange(d.account_id, patch)}
          live={live?.versions.find((x) => x.account_id === d.account_id)} postId={live?.id} postTime={postTime}
          others={drafts.length - 1} applyToAll={applyToAll} everyVersion={(test) => drafts.every(test)} />
      </CardContent>
    </Card>
  );
}

/** One version: status, text, media links, who does each job, when, and the live link. */
function VersionEditor({ draft: d, onChange, live, postId, postTime, others, applyToAll, everyVersion }: {
  draft: Draft; onChange: (patch: Partial<Draft>) => void; live?: PostVersion; postId?: number; postTime: number | null;
  others: number; applyToAll: ApplyToAll;
  /** is `test` true for every version, this one included? */
  everyVersion: (test: (o: Draft) => boolean) => boolean;
}) {
  const team = useTeam();
  const account = useAllAccounts().find((a) => a.id === d.account_id);
  const limit = usePlatforms().data?.find((p) => p.id === account?.platform_id)?.char_limit ?? null;
  const name = accountName(account);
  const len = [...d.body].length;
  const setLink = (n: number, patch: Partial<MediaLink>) => onChange({ media: d.media.map((m, k) => (k === n ? { ...m, ...patch } : m)) });
  const links = d.media.filter((m) => m.url.trim());
  return (
    <FieldGroup>
      <div className="flex flex-wrap items-center gap-2">
        {account && <PlatformIcon k={account.platform_key} name={account.platform_name} color={account.platform_color} />}
        <span className="font-medium">{account?.handle}</span>
        <span className="truncate text-sm text-muted-foreground">{account?.brand_name}</span>
        <span className="ml-auto">
          {live && postId
            ? <VersionStatus postId={postId} version={live} />
            : <StatusSelect value={d.status} onChange={(s) => onChange({ status: s })} label={`${name} status`} />}
        </span>
      </div>
      <Field>
        <div className="flex items-center justify-between gap-2">
          <FieldLabel htmlFor={`body-${d.account_id}`}>Content</FieldLabel>
          <span className="flex items-center gap-3">
            {others > 0 && (
              <Confirm title="Copy this text to all versions?" description={`The text of the other ${others === 1 ? "version" : `${others} versions`} is replaced. Media, people and times stay.`}
                action="Copy" onConfirm={() => applyToAll({ body: d.body })}>
                <Button type="button" variant="link" size="sm" className="h-auto px-0 text-xs"><CopyCheck /> Copy to all versions</Button>
              </Confirm>
            )}
            <span className={cn("text-xs tabular-nums text-muted-foreground", limit && len > limit && "font-medium text-destructive")}>
              {limit ? `${len} / ${limit}` : len}
            </span>
          </span>
        </div>
        <div className="relative">
          <Textarea id={`body-${d.account_id}`} className="min-h-40 pr-11" value={d.body} onChange={(e) => onChange({ body: e.target.value })} placeholder={`Write the ${account?.platform_name ?? ""} post…`} />
          <CopyText text={d.body} className="absolute top-1.5 right-1.5" />
        </div>
      </Field>
      <Field>
        {/* Adds this version's links to the others, next to any links of their own. */}
        <ApplyLabel label="Media" others={links.length ? others : 0} done={`Media links added to all ${others + 1} versions`}
          applied={everyVersion((o) => links.every((l) => hasLink(o.media, l.url)))}
          onApply={() => applyToAll((o) => ({ media: [...o.media, ...links.filter((l) => !hasLink(o.media, l.url))].slice(0, MAX_MEDIA_LINKS) }))} />
        {d.media.map((m, n) => (
          <div key={n} className="flex gap-2">
            <Input className="w-36 shrink-0 sm:w-44" placeholder="Label (optional)" aria-label={`Media ${n + 1} label`} value={m.label} onChange={(e) => setLink(n, { label: e.target.value })} />
            <Input type="url" inputMode="url" placeholder="https://drive.google.com/…" aria-label={`Media ${n + 1} link`} value={m.url} onChange={(e) => setLink(n, { url: e.target.value })} />
            {/^https?:\/\//.test(m.url) && (
              <Button asChild variant="ghost" size="icon" aria-label="Open link"><a href={m.url} target="_blank" rel="noopener noreferrer"><ExternalLink /></a></Button>
            )}
            <Button type="button" variant="ghost" size="icon" aria-label={`Remove media ${n + 1}`} onClick={() => onChange({ media: d.media.filter((_, k) => k !== n) })}><X /></Button>
          </div>
        ))}
        {d.media.length < MAX_MEDIA_LINKS && (
          <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => onChange({ media: [...d.media, { label: "", url: "" }] })}>
            <Plus /> Add media link
          </Button>
        )}
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field>
          <ApplyLabel label="Content by" others={others} done={`Content by set on all ${others + 1} versions`}
            applied={everyVersion((o) => o.writer_id === d.writer_id)} onApply={() => applyToAll({ writer_id: d.writer_id })} />
          <PersonSelect people={team} value={d.writer_id} onChange={(p) => onChange({ writer_id: p })} label="Content by" />
        </Field>
        <Field>
          <ApplyLabel label="Media by" others={others} done={`Media by set on all ${others + 1} versions`}
            applied={everyVersion((o) => o.creative_id === d.creative_id)} onApply={() => applyToAll({ creative_id: d.creative_id })} />
          <PersonSelect people={team} value={d.creative_id} onChange={(p) => onChange({ creative_id: p })} label="Media by" />
        </Field>
        <Field>
          <FieldLabel>Posted by</FieldLabel>
          <PersonSelect people={team} value={d.poster_id} onChange={(p) => onChange({ poster_id: p })} label="Posted by" />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel>When</FieldLabel>
          <DateTimePicker value={d.scheduled_at} onChange={(ms) => onChange({ scheduled_at: ms })}
            placeholder={postTime ? `Same as post (${fmtDateTime(postTime)})` : "Same as post"} />
        </Field>
        <Field>
          <FieldLabel htmlFor={`live-${d.account_id}`}>Live post link</FieldLabel>
          <Input id={`live-${d.account_id}`} type="url" inputMode="url" placeholder="Once it's posted" value={d.posted_url} onChange={(e) => onChange({ posted_url: e.target.value })} />
        </Field>
      </div>
    </FieldGroup>
  );
}

/** Copies the text, ready to paste into the platform. Shows a tick for a moment once it's copied. */
function CopyText({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Text copied");
    } catch {
      toast.error("Couldn't copy. Select the text and copy it instead.");
    }
  };
  const label = copied ? "Copied" : "Copy text";
  return (
    <Button type="button" variant="ghost" size="icon-sm" disabled={!text} onClick={copy} aria-label={label} title={label}
      className={cn("text-muted-foreground hover:text-foreground", className)}>
      {copied ? <Check className="text-emerald-600 dark:text-emerald-400" /> : <Copy />}
    </Button>
  );
}

/** A field's label with "Apply to all", which puts this version's value on every version. */
function ApplyLabel({ label, others, applied, onApply, done }: { label: string; others: number; applied: boolean; onApply: () => void; done: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <FieldLabel>{label}</FieldLabel>
      {others > 0 && (
        <Button type="button" variant="link" size="sm" className="h-auto px-0 text-xs" disabled={applied}
          title={applied ? "Every version already has this" : `Use this on all ${others + 1} versions`}
          onClick={() => (onApply(), toast.success(done))}>
          Apply to all
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// New post: ?topic=<id> starts from that topic's template
// ---------------------------------------------------------------------------------------

function NewPostLoader() {
  const [sp] = useSearchParams();
  const topics = useTopics();
  // New versions' starting text comes from the topic, so wait for topics.
  if (topics.isPending)
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  const topic = topics.data?.find((t) => t.id === Number(sp.get("topic")));
  return <NewPost key={topic?.id ?? "none"} topic={topic} />;
}

function NewPost({ topic }: { topic?: Topic }) {
  const me = useMe().data!;
  const nav = useNavigate();
  const refresh = useRefresh();
  const [saving, setSaving] = useState(false);
  const initial: Values = { title: "", notes: "", scheduled_at: null, topic_id: topic?.id ?? null, versions: [] };

  const save = async (v: Values) => {
    setSaving(true);
    const ok = await attempt(async () => {
      const { id } = await api<{ id: number }>("/posts", { method: "POST", json: v });
      refresh();
      nav(`/posts/${id}`, { replace: true });
    }, "Post created");
    if (!ok) setSaving(false);
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PostForm
        initial={initial}
        isNew
        saving={saving}
        onSave={save}
        writer={me.id}
        header={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft /></Button>
            <h1 className="font-heading text-2xl font-semibold tracking-tight">New post</h1>
          </div>
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// Existing post
// ---------------------------------------------------------------------------------------

function EditPost({ id }: { id: number }) {
  const nav = useNavigate();
  const refresh = useRefresh();
  const me = useMe().data;
  const q = useQuery({ queryKey: ["post", id], queryFn: () => api<PostDetail>(`/posts/${id}`) });
  const post = q.data;
  const [saving, setSaving] = useState(false);

  if (q.isError) return <p className="text-destructive">{errorMessage(q.error)}</p>;
  if (!post)
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );

  const initial: Values = {
    title: post.title, notes: post.notes ?? "", scheduled_at: post.scheduled_at, topic_id: post.topic_id,
    versions: post.versions.map((x) => ({
      account_id: x.account_id, body: x.body, media: x.media, writer_id: x.writer_id, creative_id: x.creative_id,
      poster_id: x.poster_id, scheduled_at: x.scheduled_at, posted_url: x.posted_url ?? "", status: x.status,
    })),
  };

  const save = async (v: Values) => {
    setSaving(true);
    try {
      await api(`/posts/${id}`, { method: "PUT", json: { ...v, version: post.version } });
      toast.success("Saved");
      refresh();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        toast.error(e.message, { action: { label: "Reload", onClick: () => q.refetch() }, duration: 15_000 });
      } else toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PostForm
        key={post.version}
        initial={initial}
        isNew={false}
        saving={saving}
        onSave={save}
        live={post}
        writer={post.created_by ?? me?.id ?? null}
        header={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft /></Button>
            <h1 className="min-w-0 flex-1 truncate font-heading text-2xl font-semibold tracking-tight">{post.title}</h1>
            <StatusBadge status={post.status} className="rounded-md border px-2.5 py-1.5 text-sm" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="outline" size="icon" aria-label="More"><MoreHorizontal /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => attempt(async () => nav(`/posts/${(await api<{ id: number }>(`/posts/${id}/duplicate`, { method: "POST" })).id}`), "Duplicated")}>
                  <Copy /> Duplicate
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DeleteItem id={id} onDone={() => (refresh(), nav(post.topic_id ? `/topics/${post.topic_id}` : "/day"))} />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />
      <Comments post={post} />
    </div>
  );
}

function DeleteItem({ id, onDone }: { id: number; onDone: () => void }) {
  return (
    <Confirm title="Delete this post?" description="It disappears from every view and is removed for good after 30 days."
      onConfirm={() => attempt(async () => (await api(`/posts/${id}`, { method: "DELETE" }), onDone()), "Post deleted")}>
      <DropdownMenuItem variant="destructive" onSelect={(e) => e.preventDefault()}><Trash2 /> Delete post</DropdownMenuItem>
    </Confirm>
  );
}

function Comments({ post }: { post: PostDetail }) {
  const refresh = useRefresh();
  const people = usePeopleMap();
  const [text, setText] = useState("");
  const send = async () => {
    if (!text.trim()) return;
    if (await attempt(async () => (await api(`/posts/${post.id}/comments`, { method: "POST", json: { body: text } }), refresh()))) setText("");
  };
  return (
    <Card className="mt-6">
      <CardHeader><CardTitle className="flex items-center gap-2"><MessageSquare className="size-4" /> Comments</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {post.comments.length === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>}
        {post.comments.map((c) => (
          <div key={c.id} className="flex gap-2.5">
            <PersonAvatar size="sm" person={(c.author_id && people.get(c.author_id)) || { name: c.author_name ?? "?", avatar_color: c.author_color ?? "#999" }} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2 text-xs">
                <span className="font-medium">{c.author_name}</span>
                <span className="text-muted-foreground">{fmtDateTime(c.created_at)}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm">{c.body}</p>
            </div>
          </div>
        ))}
        <Separator />
        <Textarea placeholder="Write a comment…" value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") send(); }} />
        <Button variant="outline" size="sm" disabled={!text.trim()} onClick={send}>Comment</Button>
      </CardContent>
    </Card>
  );
}
