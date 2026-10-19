import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Copy, ExternalLink, History, MessageSquare, MoreHorizontal, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { accountName, useMembers, usePeopleMap, usePlatforms, usePostableAccounts, useRefresh } from "@/lib/data";
import { fmtDateTime, inZone, parseYmd } from "@/lib/dates";
import { attempt } from "@/lib/errors";
import type { Account, PostDetail, TargetRow } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { Confirm } from "@/components/confirm";
import { DateTimePicker } from "@/components/date-picker";
import { MediaPanel, type PendingMedia } from "@/components/media-panel";
import { PersonAvatar, PersonSelect } from "@/components/people";
import { PlatformDot, PlatformLabel } from "@/components/platform";
import { StatusBadge, StatusDot, StatusMenu } from "@/components/status";
import { overallStatus, STATUS_LABEL, STATUSES, type Status } from "../../../shared/rules";

const chars = (s: string) => [...s].length;

function CharCount({ text, limit }: { text: string; limit: number | null }) {
  const n = chars(text);
  return (
    <span className={cn("text-xs tabular-nums text-muted-foreground", limit && n > limit && "font-medium text-destructive")}>
      {limit ? `${n} / ${limit}` : n}
    </span>
  );
}

export function PostPage() {
  const { id } = useParams();
  return id ? <EditPost key={id} id={Number(id)} /> : <NewPost />;
}

// ---------------- account picker ----------------

/** Accounts grouped by account name, each with its platforms as toggles. */
function AccountPicker({ selected, onChange, exclude = [] }: { selected: number[]; onChange: (ids: number[]) => void; exclude?: number[] }) {
  const accounts = usePostableAccounts().filter((a) => !exclude.includes(a.id));
  const groups = new Map<string, Account[]>();
  for (const a of accounts) groups.set(accountName(a), [...(groups.get(accountName(a)) ?? []), a]);
  if (!groups.size)
    return <p className="text-sm text-muted-foreground">{exclude.length ? "Every account is already on this post." : "No accounts yet. Ask an admin to add them."}</p>;
  const toggle = (ids: number[], on: boolean) => onChange(on ? [...new Set([...selected, ...ids])] : selected.filter((x) => !ids.includes(x)));
  return (
    <div className="divide-y rounded-lg border">
      {[...groups].map(([name, list]) => {
        const ids = list.map((a) => a.id);
        const all = ids.every((i) => selected.includes(i));
        const some = !all && ids.some((i) => selected.includes(i));
        return (
          <div key={name} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3">
            <Label className="w-40 shrink-0 cursor-pointer">
              <Checkbox checked={all ? true : some ? "indeterminate" : false} onCheckedChange={(v) => toggle(ids, !!v)} />
              {name}
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {list.map((a) => {
                const on = selected.includes(a.id);
                return (
                  <Button key={a.id} type="button" size="sm" variant={on ? "secondary" : "outline"} onClick={() => toggle([a.id], !on)}
                    className={cn(on && "ring-1 ring-ring/40")} title={a.handle}>
                    <PlatformDot color={a.platform_color} />
                    {a.platform_name}
                    <span className="max-w-28 truncate text-muted-foreground">{a.handle}</span>
                  </Button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------- new ----------------

function NewPost() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const members = useMembers();
  const accounts = usePostableAccounts();
  const platforms = usePlatforms().data ?? [];
  const refresh = useRefresh();
  const defaultTime = useMemo(() => {
    const d = sp.get("date") ? parseYmd(sp.get("date")) : new Date(Date.now() + 86_400_000);
    d.setHours(10, 0, 0, 0);
    return d.getTime();
  }, [sp]);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [notes, setNotes] = useState("");
  const [when, setWhen] = useState<number | null>(defaultTime);
  const [selected, setSelected] = useState<number[]>([]);
  const [writer, setWriter] = useState<number | null | undefined>(undefined);
  const [creative, setCreative] = useState<number | null | undefined>(undefined);
  const [copyDue, setCopyDue] = useState<number | null>(null);
  const [mediaDue, setMediaDue] = useState<number | null>(null);
  const [pending, setPending] = useState<PendingMedia[]>([]);
  const [busy, setBusy] = useState(false);

  const limits = accounts.filter((a) => selected.includes(a.id)).map((a) => platforms.find((p) => p.id === a.platform_id)?.char_limit).filter((n): n is number => !!n);
  const minLimit = limits.length ? Math.min(...limits) : null;

  const submit = async () => {
    if (!title.trim()) return void toast.error("Give the post a title");
    setBusy(true);
    const ok = await attempt(async () => {
      const { id } = await api<{ id: number }>("/posts", {
        method: "POST",
        json: {
          title, body, notes,
          ...(writer !== undefined && { writer_id: writer }),
          ...(creative !== undefined && { creative_id: creative }),
          copy_due: copyDue, media_due: mediaDue,
          targets: selected.map((account_id) => ({ account_id, scheduled_at: when })),
        },
      });
      for (const m of pending) await m.commit(id);
      refresh();
      nav(`/posts/${id}`, { replace: true });
    }, "Post created");
    if (!ok) setBusy(false);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft /></Button>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">New post</h1>
      </div>

      <Card>
        <CardHeader><CardTitle>Content</CardTitle><CardDescription>You can tailor the text per platform after saving.</CardDescription></CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="title">Title</FieldLabel>
              <Input id="title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Product launch teaser" />
              <FieldDescription>Only your team sees this.</FieldDescription>
            </Field>
            <Field>
              <div className="flex items-center justify-between"><FieldLabel htmlFor="body">Post text</FieldLabel><CharCount text={body} limit={minLimit} /></div>
              <Textarea id="body" className="min-h-40" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write the post…" />
            </Field>
            <Field>
              <FieldLabel htmlFor="notes">Brief & notes</FieldLabel>
              <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Context, hashtags, references for the creative…" />
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Where & when</CardTitle><CardDescription>Each account can get its own time after saving.</CardDescription></CardHeader>
        <CardContent>
          <FieldGroup>
            <Field className="max-w-xs">
              <FieldLabel>Post time</FieldLabel>
              <DateTimePicker value={when} onChange={setWhen} />
            </Field>
            <Field>
              <FieldLabel>Post to</FieldLabel>
              <AccountPicker selected={selected} onChange={setSelected} />
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>People & deadlines</CardTitle><CardDescription>Left blank, these come from the account's assignments.</CardDescription></CardHeader>
        <CardContent>
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <Field><FieldLabel>Writer</FieldLabel><PersonSelect people={members} value={writer} onChange={setWriter} placeholder="From assignments / me" /></Field>
            <Field><FieldLabel>Creative (media)</FieldLabel><PersonSelect people={members} value={creative} onChange={setCreative} placeholder="From assignments" /></Field>
            <Field><FieldLabel>Copy due</FieldLabel><DateTimePicker value={copyDue} onChange={setCopyDue} placeholder="No deadline" /></Field>
            <Field><FieldLabel>Media due</FieldLabel><DateTimePicker value={mediaDue} onChange={setMediaDue} placeholder="No deadline" /></Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <MediaPanel pending={pending} setPending={setPending} />

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => nav(-1)}>Cancel</Button>
        <Button disabled={busy} onClick={submit}>{busy ? "Creating…" : "Create post"}</Button>
      </div>
    </div>
  );
}

// ---------------- edit ----------------

function EditPost({ id }: { id: number }) {
  const nav = useNavigate();
  const members = useMembers();
  const refresh = useRefresh();
  const q = useQuery({ queryKey: ["post", id], queryFn: () => api<PostDetail>(`/posts/${id}`) });
  const post = q.data;

  const [draft, setDraft] = useState<{ title: string; body: string; notes: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState<number[]>([]);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (post && !draft) setDraft({ title: post.title, body: post.body, notes: post.notes ?? "" });
  }, [post, draft]);

  const dirty = !!post && !!draft && (draft.title !== post.title || draft.body !== post.body || draft.notes !== (post.notes ?? ""));
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  if (q.isError) return <p className="text-destructive">{(q.error as Error).message}</p>;
  if (!post || !draft)
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );

  const patch = (json: Record<string, unknown>, msg?: string) =>
    attempt(async () => (await api(`/posts/${id}`, { method: "PATCH", json }), refresh()), msg);
  const save = async () => {
    setSaving(true);
    await patch(draft, "Saved");
    setSaving(false);
  };
  const bulk = (status: Status) =>
    attempt(async () => {
      const r = await api<{ moved: number; skipped: string[] }>(`/posts/${id}/status`, { method: "POST", json: { status } });
      refresh();
      if (r.skipped.length) toast.warning(`${r.moved} moved, ${r.skipped.length} skipped`, { description: [...new Set(r.skipped)].join("; ") });
      else toast.success(`All accounts moved to ${STATUS_LABEL[status]}`);
    });
  const addTargets = () =>
    attempt(async () => {
      const when = post.targets.find((t) => t.scheduled_at)?.scheduled_at ?? null;
      for (const account_id of adding) await api(`/posts/${id}/targets`, { method: "POST", json: { account_id, scheduled_at: when } });
      setAdding([]);
      refresh();
    }, "Accounts added");
  const limits = post.targets.filter((t) => !t.body_override && t.char_limit).map((t) => t.char_limit!);
  const minLimit = limits.length ? Math.min(...limits) : null;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft /></Button>
        <h1 className="min-w-0 truncate font-heading text-2xl font-semibold tracking-tight">{post.title}</h1>
        <StatusBadge status={overallStatus(post.targets.map((t) => t.status))} />
        <div className="ml-auto flex items-center gap-2">
          <Select value="" onValueChange={(v) => bulk(v as Status)}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Move all accounts to…" /></SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => <SelectItem key={s} value={s}><StatusDot status={s} />{STATUS_LABEL[s]}</SelectItem>)}
            </SelectContent>
          </Select>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="outline" size="icon" aria-label="More"><MoreHorizontal /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => attempt(async () => nav(`/posts/${(await api<{ id: number }>(`/posts/${id}/duplicate`, { method: "POST" })).id}`), "Duplicated")}>
                <Copy /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}><Trash2 /> Delete post</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this post?</AlertDialogTitle>
            <AlertDialogDescription>It disappears from every view. This can't be undone from the app.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className={buttonVariants({ variant: "destructive" })}
              onClick={() => attempt(async () => (await api(`/posts/${id}`, { method: "DELETE" }), refresh(), nav("/day")), "Post deleted")}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Content</CardTitle>
              <CardDescription>Updated {fmtDateTime(post.updated_at)}</CardDescription>
              <CardAction className="flex items-center gap-2">
                {dirty && <span className="text-xs text-amber-600 dark:text-amber-400">Unsaved</span>}
                <Button size="sm" disabled={!dirty || saving} onClick={save}>{saving ? "Saving…" : "Save"}</Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="title">Title</FieldLabel>
                  <Input id="title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
                </Field>
                <Field>
                  <div className="flex items-center justify-between"><FieldLabel htmlFor="body">Post text</FieldLabel><CharCount text={draft.body} limit={minLimit} /></div>
                  <Textarea id="body" className="min-h-48" value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                    onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); save(); } }} />
                  <FieldDescription>Used on every account unless it has custom text. Ctrl+S saves.</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="notes">Brief & notes</FieldLabel>
                  <Textarea id="notes" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>

          <section className="space-y-3">
            <h2 className="font-medium">Accounts <span className="text-muted-foreground">{post.targets.length}</span></h2>
            {post.targets.map((t) => <TargetEditor key={t.id} t={t} masterBody={draft.body} />)}
            <Card>
              <CardHeader><CardTitle className="text-sm">Add accounts</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <AccountPicker selected={adding} onChange={setAdding} exclude={post.targets.map((t) => t.account_id)} />
                {adding.length > 0 && <Button variant="outline" onClick={addTargets}>Add {adding.length} account{adding.length > 1 ? "s" : ""}</Button>}
              </CardContent>
            </Card>
          </section>

          <MediaPanel postId={id} attachments={post.attachments} />
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader><CardTitle>People & deadlines</CardTitle></CardHeader>
            <CardContent>
              <FieldGroup>
                <Field><FieldLabel>Writer</FieldLabel><PersonSelect people={members} value={post.writer_id} onChange={(v) => patch({ writer_id: v })} /></Field>
                <Field><FieldLabel>Creative (media)</FieldLabel><PersonSelect people={members} value={post.creative_id} onChange={(v) => patch({ creative_id: v })} /></Field>
                <Field><FieldLabel>Copy due</FieldLabel><DateTimePicker value={post.copy_due} onChange={(v) => patch({ copy_due: v })} placeholder="No deadline" /></Field>
                <Field><FieldLabel>Media due</FieldLabel><DateTimePicker value={post.media_due} onChange={(v) => patch({ media_due: v })} placeholder="No deadline" /></Field>
              </FieldGroup>
            </CardContent>
          </Card>
          <Comments post={post} />
          <HistoryCard post={post} />
        </aside>
      </div>
    </div>
  );
}

function TargetEditor({ t, masterBody }: { t: TargetRow; masterBody: string }) {
  const members = useMembers();
  const platforms = usePlatforms().data ?? [];
  const refresh = useRefresh();
  const platform = platforms.find((p) => p.id === t.platform_id);
  const [override, setOverride] = useState(t.body_override ?? "");
  const [custom, setCustom] = useState(t.body_override != null);
  const [url, setUrl] = useState(t.posted_url ?? "");
  const extra: Record<string, string> = JSON.parse(t.extra || "{}");

  const patch = (json: Record<string, unknown>) => attempt(async () => (await api(`/targets/${t.id}`, { method: "PATCH", json }), refresh()));
  const text = custom ? override : masterBody;
  const zone = t.scheduled_at ? inZone(t.scheduled_at, t.account_timezone) : null;
  const over = !custom && t.char_limit && chars(masterBody) > t.char_limit;

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle><PlatformLabel color={t.platform_color} name={t.platform_name} detail={t.handle} /></CardTitle>
        <CardAction className="flex items-center gap-1">
          <StatusMenu target={t} />
          <Confirm title={`Remove ${t.handle} from this post?`} action="Remove"
            onConfirm={() => attempt(async () => (await api(`/targets/${t.id}`, { method: "DELETE" }), refresh()), "Account removed")}>
            <Button variant="ghost" size="icon-sm" aria-label="Remove account"><X /></Button>
          </Confirm>
        </CardAction>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel>Post time</FieldLabel>
              <DateTimePicker value={t.scheduled_at} onChange={(v) => patch({ scheduled_at: v })} />
              {zone && <FieldDescription>{zone}</FieldDescription>}
            </Field>
            <Field>
              <FieldLabel>Posted by</FieldLabel>
              <PersonSelect people={members} value={t.manager_id} onChange={(v) => patch({ manager_id: v })} />
            </Field>
            {platform?.extra_fields.map((f) => (
              <Field key={f.key}>
                <FieldLabel>{f.label}</FieldLabel>
                <Input defaultValue={extra[f.key] ?? ""} onBlur={(e) => e.target.value !== (extra[f.key] ?? "") && patch({ extra: { ...extra, [f.key]: e.target.value } })} />
              </Field>
            ))}
          </div>
          <Field>
            <div className="flex items-center justify-between">
              <Label className="cursor-pointer font-normal">
                <Checkbox checked={custom} onCheckedChange={(v) => {
                  setCustom(!!v);
                  if (v) setOverride(override || masterBody);
                  else patch({ body_override: null });
                }} />
                Custom text for this account
              </Label>
              <CharCount text={text} limit={t.char_limit} />
            </div>
            {custom && (
              <Textarea className="min-h-28" value={override} onChange={(e) => setOverride(e.target.value)}
                onBlur={() => override !== (t.body_override ?? "") && patch({ body_override: override })} />
            )}
            {over && <FieldDescription className="text-destructive">The post text is over {t.platform_name}'s limit. Add custom text for this account.</FieldDescription>}
          </Field>
          {(t.status === "posted" || t.status === "scheduled") && (
            <Field>
              <FieldLabel>Live post link</FieldLabel>
              <div className="flex gap-2">
                <Input placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} onBlur={() => url !== (t.posted_url ?? "") && patch({ posted_url: url })} />
                {t.posted_url && <Button asChild variant="outline" size="icon" aria-label="Open live post"><a href={t.posted_url} target="_blank" rel="noreferrer"><ExternalLink /></a></Button>}
              </div>
              {t.posted_at && <FieldDescription>Marked posted {fmtDateTime(t.posted_at)}</FieldDescription>}
            </Field>
          )}
        </FieldGroup>
      </CardContent>
    </Card>
  );
}

function Comments({ post }: { post: PostDetail }) {
  const refresh = useRefresh();
  const me = usePeopleMap();
  const [text, setText] = useState("");
  const send = async () => {
    if (!text.trim()) return;
    if (await attempt(async () => (await api(`/posts/${post.id}/comments`, { method: "POST", json: { body: text } }), refresh()))) setText("");
  };
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><MessageSquare className="size-4" /> Comments</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {post.comments.length === 0 && <p className="text-sm text-muted-foreground">No comments yet. Leave review feedback here.</p>}
        {post.comments.map((c) => (
          <div key={c.id} className="group flex gap-2.5">
            <PersonAvatar size="sm" person={me.get(c.author_id) ?? { name: c.author_name ?? "?", avatar_color: c.author_color ?? "#999" }} />
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

function HistoryCard({ post }: { post: PostDetail }) {
  const people = usePeopleMap();
  const [open, setOpen] = useState(false);
  const items = open ? post.history : post.history.slice(0, 5);
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><History className="size-4" /> History</CardTitle></CardHeader>
      <CardContent>
        <ol className="relative space-y-4 border-l pl-4">
          {items.map((h) => (
            <li key={h.id} className="text-sm">
              <span className="absolute -left-1 mt-1.5 size-2 rounded-full bg-border" />
              <span className="font-medium">{h.actor_name ?? "System"}</span> <span className="text-muted-foreground">{describe(h.action, h.detail, people)}</span>
              <div className="text-xs text-muted-foreground">{fmtDateTime(h.created_at)}</div>
            </li>
          ))}
        </ol>
        {post.history.length > 5 && (
          <Button variant="link" size="sm" className="mt-2 px-0" onClick={() => setOpen(!open)}>{open ? "Show less" : `Show all ${post.history.length}`}</Button>
        )}
      </CardContent>
    </Card>
  );
}

function describe(action: string, detail: string | null, people: Map<number, { name: string }>) {
  const d = detail ? JSON.parse(detail) : {};
  const who = (id: number | null) => people.get(id ?? -1)?.name ?? "nobody";
  switch (action) {
    case "status": return `moved an account from ${STATUS_LABEL[d.from as Status] ?? d.from} to ${STATUS_LABEL[d.to as Status] ?? d.to}`;
    case "create": return d.duplicated_from ? "duplicated this post" : "created the post";
    case "attach": return `attached ${d.filename ?? d.link ?? "a file"}`;
    case "detach": return `removed ${d.filename}`;
    case "add_target": return "added an account";
    case "remove_target": return "removed an account";
    case "update_target":
      if (d.manager_id !== undefined) return `set the poster to ${who(d.manager_id)}`;
      if (d.scheduled_at !== undefined) return `rescheduled to ${d.scheduled_at ? fmtDateTime(d.scheduled_at) : "no time"}`;
      return "edited an account's text";
    case "update":
      if (d.writer_id !== undefined) return `set the writer to ${who(d.writer_id)}`;
      if (d.creative_id !== undefined) return `set the creative to ${who(d.creative_id)}`;
      if (d.copy_due !== undefined || d.media_due !== undefined) return "changed a deadline";
      return "edited the post";
    default: return action;
  }
}
