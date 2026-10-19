import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Copy, ExternalLink, MessageSquare, MoreHorizontal, PenLine, Repeat, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { accountName, useAccounts, useMembers, usePeopleMap, usePlatforms, usePostableAccounts, usePostTemplates, useRefresh } from "@/lib/data";
import { AccountPicker } from "@/components/account-picker";
import { fmtDateTime, fmtDay, inZone, parseYmd, ymd } from "@/lib/dates";
import { attempt } from "@/lib/errors";
import type { PostDetail, TargetRow, TemplateSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
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
import { PlatformLabel } from "@/components/platform";
import { StatusBadge, StatusDot, StatusMenu } from "@/components/status";
import { overallStatus, STATUS_LABEL, STATUSES, type Status } from "../../../shared/rules";
import { describeSchedule, zonedToEpoch } from "../../../shared/schedule";
import { PlatformIcon } from "@/components/platform";

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
  return id ? <EditPost key={id} id={Number(id)} /> : <NewPostFlow />;
}

// ---------------- choose: scratch or template ----------------

/** The day being planned: ?date=YYYY-MM-DD, or tomorrow. */
function planDate(sp: URLSearchParams) {
  return sp.get("date") ? parseYmd(sp.get("date")) : new Date(Date.now() + 86_400_000);
}

/**
 * "Plan a post" first asks whether to start blank or from a template.
 * The choice lives in the URL (?start=scratch or ?template=ID) so Back returns here.
 */
function NewPostFlow() {
  const [sp, setSp] = useSearchParams();
  const templates = usePostTemplates();
  const accountsLoading = useAccounts().isPending; // a template preselects accounts, so they must be loaded first
  const chosenId = Number(sp.get("template")) || null;
  const choose = (patch: Record<string, string | null>) => {
    const n = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) v === null ? n.delete(k) : n.set(k, v);
    setSp(n);
  };

  if (templates.isPending || accountsLoading)
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 sm:grid-cols-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-40 rounded-xl" />)}</div>
      </div>
    );
  const list = templates.data ?? [];
  const chosen = chosenId ? list.find((t) => t.id === chosenId) : undefined;

  if (chosen) return <NewPost key={chosen.id} template={chosen} onChangeTemplate={() => choose({ template: null })} />;
  // No templates yet (or explicitly chose a blank post): straight to the form.
  if (sp.get("start") === "scratch" || list.length === 0) return <NewPost key="scratch" onChangeTemplate={list.length ? () => choose({ start: null }) : undefined} />;
  return <StartChooser templates={list} day={planDate(sp)} hasDate={!!sp.get("date")} onScratch={() => choose({ start: "scratch" })} onTemplate={(id) => choose({ template: String(id), start: null })} />;
}

function StartChooser({
  templates, day, hasDate, onScratch, onTemplate,
}: { templates: TemplateSummary[]; day: Date; hasDate: boolean; onScratch: () => void; onTemplate: (id: number) => void }) {
  const nav = useNavigate();
  const accounts = usePostableAccounts();
  const people = usePeopleMap();
  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => nav(-1)} aria-label="Back"><ArrowLeft /></Button>
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Plan a post</h1>
          <p className="text-sm text-muted-foreground">{hasDate ? `For ${fmtDay(day)}. ` : ""}Start with a blank post or one of your team's templates.</p>
        </div>
      </div>

      <button
        type="button"
        onClick={onScratch}
        className="group mb-8 flex w-full items-center gap-4 rounded-xl border bg-card p-5 text-left transition hover:border-foreground/20 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"><PenLine className="size-5" /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">Write from scratch</span>
          <span className="block text-sm text-muted-foreground">A blank post. Pick the accounts, write the text and add media yourself.</span>
        </span>
        <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </button>

      <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground"><Repeat className="size-4" /> Or start from a template</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {templates.map((t) => {
          const accs = accounts.filter((a) => t.account_ids.includes(a.id));
          const names = [...new Set(accs.map(accountName))];
          const writer = t.writer_id ? people.get(t.writer_id) : null;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onTemplate(t.id)}
              className="group flex flex-col rounded-xl border bg-card p-4 text-left transition hover:border-foreground/20 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex items-start justify-between gap-2">
                <span className="font-medium">{t.title}</span>
                <span className="shrink-0 text-xs text-primary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">Use template →</span>
              </span>
              <span className="mt-0.5 text-xs text-muted-foreground">{describeSchedule(t.weekdays, t.time)}</span>
              <span className="mt-3 line-clamp-2 min-h-10 text-sm text-muted-foreground">{t.body || <em>No starting text</em>}</span>
              <span className="mt-4 flex items-center justify-between gap-2 border-t pt-3">
                <span className="flex min-w-0 items-center gap-1.5">
                  {accs.slice(0, 6).map((a) => <PlatformIcon key={a.id} k={a.platform_key} name={a.platform_name} color={a.platform_color} className="size-4" />)}
                  <span className="truncate text-xs text-muted-foreground">{names.join(", ") || "No accounts"}</span>
                </span>
                {writer && <PersonAvatar person={writer} size="sm" label="Writer" />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------- new ----------------

function NewPost({ template, onChangeTemplate }: { template?: TemplateSummary; onChangeTemplate?: () => void }) {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const members = useMembers();
  const accounts = usePostableAccounts();
  const platforms = usePlatforms().data ?? [];
  const refresh = useRefresh();
  // A template brings its own time of day (in its timezone) for the day being planned.
  const defaultTime = useMemo(() => {
    const d = planDate(sp);
    if (template) return zonedToEpoch(ymd(d), template.time, template.timezone);
    d.setHours(10, 0, 0, 0);
    return d.getTime();
  }, [sp, template]);

  const [title, setTitle] = useState(template?.title ?? "");
  const [body, setBody] = useState(template?.body ?? "");
  const [notes, setNotes] = useState(template?.notes ?? "");
  const [when, setWhen] = useState<number | null>(defaultTime);
  const [selected, setSelected] = useState<number[]>(() => (template ? accounts.filter((a) => template.account_ids.includes(a.id)).map((a) => a.id) : []));
  const [writer, setWriter] = useState<number | null | undefined>(template?.writer_id ?? undefined);
  const [creative, setCreative] = useState<number | null | undefined>(template?.creative_id ?? undefined);
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
          template_id: template?.id ?? null,
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
        {!template && onChangeTemplate && <Button variant="ghost" size="sm" className="ml-auto" onClick={onChangeTemplate}><Repeat /> Use a template instead</Button>}
      </div>

      {template && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-muted/40 px-4 py-3 text-sm">
          <Repeat className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1">Starting from <span className="font-medium">{template.title}</span>. Everything below can be changed.</span>
          {onChangeTemplate && <Button variant="outline" size="sm" onClick={onChangeTemplate}>Choose another</Button>}
        </div>
      )}

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
        <CardHeader><CardTitle>People & deadlines</CardTitle><CardDescription>Whoever posts it defaults to the account's manager when it has just one.</CardDescription></CardHeader>
        <CardContent>
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <Field><FieldLabel>Writer</FieldLabel><PersonSelect people={members} value={writer} onChange={setWriter} placeholder="Me" /></Field>
            <Field><FieldLabel>Creative (media)</FieldLabel><PersonSelect people={members} value={creative} onChange={setCreative} placeholder="Unassigned" /></Field>
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
        {post.template_title && <Badge variant="secondary"><Repeat /> From template: {post.template_title}</Badge>}
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
        <CardTitle><PlatformLabel k={t.platform_key} color={t.platform_color} name={t.platform_name} detail={t.handle} /></CardTitle>
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
        {post.comments.length === 0 && <p className="text-sm text-muted-foreground">No comments yet. Leave notes for the team here.</p>}
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
