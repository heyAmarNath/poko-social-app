import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAccounts, useMe, usePeople, usePeopleMap, usePlatforms, useRefresh } from "../lib/data";
import { fmtDateTime, fromLocalInput, inZone, parseYmd, toLocalInput } from "../lib/dates";
import type { Account, PostDetail, TargetRow } from "../lib/types";
import { Avatar, ErrorText, PersonSelect, PlatformDot } from "../components/ui";
import { StatusMenu } from "../components/TargetCard";
import { MediaPanel, type PendingMedia } from "../components/MediaPanel";
import { canAssign, canEditCopy, hasRole, overallStatus, STATUS_LABEL, STATUSES, type Status } from "../../../shared/rules";
import { StatusChip } from "../components/ui";

const chars = (s: string) => [...s].length;

function CharCount({ text, limit }: { text: string; limit: number | null }) {
  const n = chars(text);
  if (!limit) return <span className="text-xs text-slate-500">{n}</span>;
  return <span className={`text-xs tabular-nums ${n > limit ? "font-semibold text-red-600" : "text-slate-500"}`}>{n}/{limit}</span>;
}

export function PostPage() {
  const { id } = useParams();
  return id ? <EditPost id={Number(id)} /> : <NewPost />;
}

// ---------------- new ----------------

function NewPost() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const me = useMe().data!;
  const people = usePeople().data ?? [];
  const accounts = useAccounts().data ?? [];
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
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  if (!canEditCopy(me)) return <p>Your role can't create posts.</p>;
  const minLimit = Math.min(...accounts.filter((a) => selected.includes(a.id)).map((a) => platforms.find((p) => p.id === a.platform_id)?.char_limit).filter((n): n is number => !!n), Infinity);

  const submit = async () => {
    setErr(null);
    if (!title.trim()) return setErr(new Error("Give the post a title"));
    setBusy(true);
    try {
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
    } catch (e) {
      setErr(e);
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="text-2xl font-semibold">New post</h1>
      <div className="card space-y-4 p-4">
        <div>
          <label className="label">Title (internal)</label>
          <input className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Product launch teaser" />
        </div>
        <div>
          <div className="flex justify-between"><label className="label">Content</label><CharCount text={body} limit={Number.isFinite(minLimit) ? minLimit : null} /></div>
          <textarea className="input min-h-40 font-[inherit]" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write the post. You can tailor it per platform after saving." />
        </div>
        <div>
          <label className="label">Notes / brief</label>
          <textarea className="input min-h-16" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Context, links, hashtags to use…" />
        </div>
      </div>

      <div className="card space-y-3 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label">Post time (all accounts)</label>
            <input type="datetime-local" className="input w-auto" value={toLocalInput(when)} onChange={(e) => setWhen(fromLocalInput(e.target.value))} />
          </div>
          <p className="text-xs text-slate-500">You can set a different time per account after saving.</p>
        </div>
        <AccountPicker accounts={accounts} selected={selected} onChange={setSelected} />
      </div>

      <div className="card grid gap-3 p-4 sm:grid-cols-2">
        <div>
          <label className="label">Writer</label>
          <PersonSelect people={people} role="writer" value={writer === undefined ? (hasRole(me, "writer") ? me.id : null) : writer} onChange={setWriter} />
        </div>
        <div>
          <label className="label">Creative (media)</label>
          <PersonSelect people={people} role="creative" value={creative ?? null} onChange={setCreative} placeholder="From account rules / unassigned" />
        </div>
        <div>
          <label className="label">Copy due</label>
          <input type="datetime-local" className="input" value={toLocalInput(copyDue)} onChange={(e) => setCopyDue(fromLocalInput(e.target.value))} />
        </div>
        <div>
          <label className="label">Media due</label>
          <input type="datetime-local" className="input" value={toLocalInput(mediaDue)} onChange={(e) => setMediaDue(fromLocalInput(e.target.value))} />
        </div>
        <p className="text-xs text-slate-500 sm:col-span-2">Managers are filled in from the admin's account assignments.</p>
      </div>

      <MediaPanel pending={pending} setPending={setPending} />

      <ErrorText error={err} />
      <div className="flex gap-2">
        <button className="btn-primary" disabled={busy} onClick={submit}>{busy ? "Saving…" : "Create post"}</button>
        <button className="btn-ghost" onClick={() => nav(-1)}>Cancel</button>
      </div>
    </div>
  );
}

function AccountPicker({ accounts, selected, onChange, exclude = [] }: { accounts: Account[]; selected: number[]; onChange: (ids: number[]) => void; exclude?: number[] }) {
  const byPlatform = new Map<string, Account[]>();
  for (const a of accounts.filter((a) => a.active && !exclude.includes(a.id))) {
    byPlatform.set(a.platform_name, [...(byPlatform.get(a.platform_name) ?? []), a]);
  }
  if (!byPlatform.size)
    return (
      <p className="text-sm text-slate-500">
        {exclude.length ? "Every active account is already on this post." : "No accounts yet. An admin can add them under Admin → Accounts."}
      </p>
    );
  return (
    <div className="space-y-2">
      <label className="label">Post to</label>
      {[...byPlatform].map(([name, list]) => (
        <div key={name} className="flex flex-wrap items-center gap-2">
          <span className="w-24 shrink-0"><PlatformDot color={list[0].platform_color} name={name} /></span>
          {list.map((a) => {
            const on = selected.includes(a.id);
            return (
              <button
                type="button"
                key={a.id}
                onClick={() => onChange(on ? selected.filter((x) => x !== a.id) : [...selected, a.id])}
                className={`rounded-full border px-3 py-1 text-sm ${on ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300" : "border-slate-300 dark:border-slate-700"}`}
              >
                {on ? "✓ " : ""}{a.handle}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ---------------- edit ----------------

function EditPost({ id }: { id: number }) {
  const nav = useNavigate();
  const me = useMe().data!;
  const people = usePeople().data ?? [];
  const peopleMap = usePeopleMap();
  const accounts = useAccounts().data ?? [];
  const refresh = useRefresh();
  const q = useQuery({ queryKey: ["post", id], queryFn: () => api<PostDetail>(`/posts/${id}`) });
  const post = q.data;

  const [draft, setDraft] = useState<{ title: string; body: string; notes: string } | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState<number[]>([]);
  const editable = canEditCopy(me);
  const assign = canAssign(me);

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

  if (q.isError) return <p className="text-red-600">{(q.error as Error).message}</p>;
  if (!post || !draft) return <p className="text-sm text-slate-500">Loading…</p>;

  const patch = async (json: Record<string, unknown>) => {
    setErr(null);
    try {
      await api(`/posts/${id}`, { method: "PATCH", json });
      refresh();
    } catch (e) {
      setErr(e);
    }
  };
  const save = async () => {
    setSaving(true);
    await patch(draft);
    setSaving(false);
  };
  const bulk = async (status: Status) => {
    setErr(null);
    try {
      const r = await api<{ moved: number; skipped: string[] }>(`/posts/${id}/status`, { method: "POST", json: { status } });
      if (r.skipped.length) setErr(new Error(`${r.moved} moved, ${r.skipped.length} skipped: ${[...new Set(r.skipped)].join("; ")}`));
      refresh();
    } catch (e) {
      setErr(e);
    }
  };
  const addTargets = async () => {
    const when = post.targets.find((t) => t.scheduled_at)?.scheduled_at ?? null;
    try {
      for (const account_id of adding) await api(`/posts/${id}/targets`, { method: "POST", json: { account_id, scheduled_at: when } });
      setAdding([]);
      refresh();
    } catch (e) {
      setErr(e);
    }
  };
  const minLimit = Math.min(...post.targets.filter((t) => !t.body_override).map((t) => t.char_limit ?? Infinity));
  const overall = overallStatus(post.targets.map((t) => t.status));

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-ghost" onClick={() => nav(-1)}>← Back</button>
          <StatusChip status={overall} />
          <div className="ml-auto flex flex-wrap gap-2">
            <select className="input w-auto" value="" onChange={(e) => e.target.value && bulk(e.target.value as Status)}>
              <option value="">Set all accounts to…</option>
              {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
            {editable && (
              <button className="btn-outline" onClick={async () => {
                const r = await api<{ id: number }>(`/posts/${id}/duplicate`, { method: "POST" });
                nav(`/posts/${r.id}`);
              }}>Duplicate</button>
            )}
            {(hasRole(me, "admin", "manager") || post.created_by === me.id) && (
              <button className="btn-danger" onClick={async () => {
                if (!confirm("Delete this post?")) return;
                await api(`/posts/${id}`, { method: "DELETE" });
                refresh();
                nav("/day");
              }}>Delete</button>
            )}
          </div>
        </div>

        <div className="card space-y-4 p-4">
          <input className="input text-lg font-semibold" disabled={!editable} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          <div>
            <div className="flex justify-between">
              <label className="label">Main content</label>
              <CharCount text={draft.body} limit={Number.isFinite(minLimit) ? minLimit : null} />
            </div>
            <textarea className="input min-h-48" disabled={!editable} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); save(); } }} />
          </div>
          <div>
            <label className="label">Notes / brief</label>
            <textarea className="input min-h-16" disabled={!editable} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
          </div>
          {editable && (
            <div className="flex items-center gap-3">
              <button className="btn-primary" disabled={!dirty || saving} onClick={save}>{saving ? "Saving…" : "Save"}</button>
              {dirty && <span className="text-xs text-amber-600">Unsaved changes</span>}
              <span className="ml-auto text-xs text-slate-500">Updated {fmtDateTime(post.updated_at)}</span>
            </div>
          )}
        </div>

        <section className="space-y-3">
          <h2 className="font-semibold">Accounts ({post.targets.length})</h2>
          {post.targets.map((t) => <TargetEditor key={t.id} t={t} masterBody={draft.body} people={people} setErr={setErr} />)}
          {editable && (
            <div className="card space-y-3 p-4">
              <label className="label">Add more accounts</label>
              <AccountPicker accounts={accounts} selected={adding} onChange={setAdding} exclude={post.targets.map((t) => t.account_id)} />
              {adding.length > 0 && <button className="btn-outline" onClick={addTargets}>Add {adding.length} account{adding.length > 1 ? "s" : ""}</button>}
            </div>
          )}
        </section>

        <MediaPanel postId={id} attachments={post.attachments} />
        <ErrorText error={err} />
      </div>

      <aside className="space-y-5">
        <div className="card space-y-3 p-4">
          <h2 className="font-semibold">People & deadlines</h2>
          <div>
            <label className="label">Writer</label>
            <PersonSelect people={people} role="writer" disabled={!assign} value={post.writer_id} onChange={(v) => patch({ writer_id: v })} />
          </div>
          <div>
            <label className="label">Creative (media)</label>
            <PersonSelect people={people} role="creative" disabled={!assign} value={post.creative_id} onChange={(v) => patch({ creative_id: v })} />
          </div>
          <div>
            <label className="label">Copy due</label>
            <input key={post.copy_due} type="datetime-local" className="input" disabled={!editable} defaultValue={toLocalInput(post.copy_due)} onBlur={(e) => patch({ copy_due: fromLocalInput(e.target.value) })} />
          </div>
          <div>
            <label className="label">Media due</label>
            <input key={post.media_due} type="datetime-local" className="input" disabled={!editable} defaultValue={toLocalInput(post.media_due)} onBlur={(e) => patch({ media_due: fromLocalInput(e.target.value) })} />
          </div>
        </div>
        <Comments post={post} />
        <details className="card p-4">
          <summary className="cursor-pointer font-semibold">History</summary>
          <ul className="mt-3 space-y-2 text-xs">
            {post.history.map((h) => (
              <li key={h.id} className="text-slate-600 dark:text-slate-400">
                <span className="font-medium text-slate-800 dark:text-slate-200">{h.actor_name ?? "System"}</span> {describe(h.action, h.detail, peopleMap)}
                <div className="text-slate-400">{fmtDateTime(h.created_at)}</div>
              </li>
            ))}
          </ul>
        </details>
      </aside>
    </div>
  );
}

function describe(action: string, detail: string | null, people: Map<number, { name: string }>) {
  const d = detail ? JSON.parse(detail) : {};
  switch (action) {
    case "status": return `changed status ${STATUS_LABEL[d.from as Status] ?? d.from} → ${STATUS_LABEL[d.to as Status] ?? d.to}`;
    case "create": return d.duplicated_from ? "duplicated this post" : "created the post";
    case "attach": return `attached ${d.filename ?? d.link ?? "a file"}`;
    case "detach": return `removed ${d.filename}`;
    case "add_target": return "added an account";
    case "remove_target": return "removed an account";
    case "update_target":
      if (d.manager_id !== undefined) return `set manager to ${people.get(d.manager_id)?.name ?? "nobody"}`;
      if (d.scheduled_at !== undefined) return `rescheduled to ${d.scheduled_at ? fmtDateTime(d.scheduled_at) : "no time"}`;
      return "edited an account's copy";
    case "update":
      if (d.writer_id !== undefined) return `set writer to ${people.get(d.writer_id)?.name ?? "nobody"}`;
      if (d.creative_id !== undefined) return `set creative to ${people.get(d.creative_id)?.name ?? "nobody"}`;
      return "edited the post";
    default: return action;
  }
}

function TargetEditor({ t, masterBody, people, setErr }: { t: TargetRow; masterBody: string; people: ReturnType<typeof usePeople>["data"] & object; setErr: (e: unknown) => void }) {
  const me = useMe().data!;
  const platforms = usePlatforms().data ?? [];
  const refresh = useRefresh();
  const platform = platforms.find((p) => p.id === t.platform_id);
  const [override, setOverride] = useState(t.body_override ?? "");
  const [custom, setCustom] = useState(t.body_override != null);
  const extra: Record<string, string> = JSON.parse(t.extra || "{}");
  const editable = canEditCopy(me);
  const isManager = hasRole(me, "admin", "manager");

  const patch = async (json: Record<string, unknown>) => {
    try {
      await api(`/targets/${t.id}`, { method: "PATCH", json });
      refresh();
    } catch (e) {
      setErr(e);
    }
  };
  const text = custom ? override : masterBody;
  const zone = t.scheduled_at ? inZone(t.scheduled_at, t.account_timezone) : null;

  return (
    <div className="card space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <PlatformDot color={t.platform_color} name={`${t.platform_name} · ${t.handle}`} />
        <span className="ml-auto"><StatusMenu target={t} onError={(m) => setErr(new Error(m))} /></span>
        {editable && (
          <button className="btn-danger px-2 py-1 text-xs" onClick={() => confirm(`Remove ${t.handle} from this post?`) && api(`/targets/${t.id}`, { method: "DELETE" }).then(refresh, setErr)}>
            Remove
          </button>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Post time</label>
          <input key={t.scheduled_at} type="datetime-local" className="input" disabled={!editable} defaultValue={toLocalInput(t.scheduled_at)}
            onBlur={(e) => { const v = fromLocalInput(e.target.value); if (v !== t.scheduled_at) patch({ scheduled_at: v }); }} />
          {zone && <p className="mt-1 text-xs text-slate-500">{zone}</p>}
        </div>
        <div>
          <label className="label">Posted by (manager)</label>
          <PersonSelect people={people} role="manager" disabled={!canAssign(me)} value={t.manager_id} onChange={(v) => patch({ manager_id: v })} />
        </div>
        {platform?.extra_fields.map((f) => (
          <div key={f.key}>
            <label className="label">{f.label}</label>
            <input className="input" disabled={!editable} defaultValue={extra[f.key] ?? ""}
              onBlur={(e) => e.target.value !== (extra[f.key] ?? "") && patch({ extra: { ...extra, [f.key]: e.target.value } })} />
          </div>
        ))}
      </div>
      <div>
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" disabled={!editable} checked={custom} onChange={(e) => {
              setCustom(e.target.checked);
              if (e.target.checked) setOverride(override || masterBody);
              else patch({ body_override: null });
            }} />
            Custom text for this account
          </label>
          <CharCount text={text} limit={t.char_limit} />
        </div>
        {custom ? (
          <textarea className="input mt-2 min-h-28" disabled={!editable} value={override} onChange={(e) => setOverride(e.target.value)}
            onBlur={() => override !== (t.body_override ?? "") && patch({ body_override: override })} />
        ) : (
          t.char_limit && chars(masterBody) > t.char_limit && <p className="mt-1 text-xs text-red-600">Main content is over this platform's limit. Add custom text.</p>
        )}
      </div>
      {(t.status === "posted" || t.status === "scheduled") && (
        <div>
          <label className="label">Live post URL</label>
          {isManager ? (
            <input className="input" placeholder="https://…" defaultValue={t.posted_url ?? ""} onBlur={(e) => e.target.value !== (t.posted_url ?? "") && patch({ posted_url: e.target.value })} />
          ) : t.posted_url ? (
            <a className="text-sm text-indigo-600 underline" href={t.posted_url} target="_blank" rel="noreferrer">{t.posted_url}</a>
          ) : (
            <p className="text-sm text-slate-500">Not added yet</p>
          )}
          {t.posted_at && <p className="mt-1 text-xs text-slate-500">Marked posted {fmtDateTime(t.posted_at)}</p>}
        </div>
      )}
    </div>
  );
}

function Comments({ post }: { post: PostDetail }) {
  const me = useMe().data!;
  const refresh = useRefresh();
  const [text, setText] = useState("");
  const send = async () => {
    if (!text.trim()) return;
    await api(`/posts/${post.id}/comments`, { method: "POST", json: { body: text } });
    setText("");
    refresh();
  };
  return (
    <div className="card space-y-3 p-4">
      <h2 className="font-semibold">Comments</h2>
      {post.comments.length === 0 && <p className="text-sm text-slate-500">No comments yet. Reviewers can leave feedback here.</p>}
      {post.comments.map((c) => (
        <div key={c.id} className="flex gap-2">
          <Avatar person={{ name: c.author_name ?? "?", avatar_color: c.author_color ?? "#999" }} size={24} />
          <div className="min-w-0 flex-1">
            <div className="text-xs"><span className="font-medium">{c.author_name}</span> <span className="text-slate-400">{fmtDateTime(c.created_at)}</span></div>
            <p className="whitespace-pre-wrap text-sm">{c.body}</p>
            {(c.author_id === me.id || hasRole(me, "admin")) && (
              <button className="text-xs text-slate-400 hover:text-red-600" onClick={() => api(`/comments/${c.id}`, { method: "DELETE" }).then(refresh)}>Delete</button>
            )}
          </div>
        </div>
      ))}
      <textarea className="input min-h-16" placeholder="Write a comment…" value={text} onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") send(); }} />
      <button className="btn-outline" disabled={!text.trim()} onClick={send}>Comment</button>
    </div>
  );
}
