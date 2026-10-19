import { useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAccounts, useMe, usePeople, usePlatforms, useRules } from "../lib/data";
import type { Account, Person, Platform } from "../lib/types";
import { Avatar, Empty, ErrorText, Modal, PersonSelect, PlatformDot } from "../components/ui";
import { ROLES, type Role } from "../../../shared/rules";

const COLORS = ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#06b6d4", "#8b5cf6", "#ef4444", "#84cc16", "#0ea5e9", "#f97316"];

function useInvalidate() {
  const qc = useQueryClient();
  return (...keys: string[]) => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
}

export function Admin() {
  const tabs = [["assignments", "Assignments"], ["accounts", "Accounts"], ["people", "People"], ["platforms", "Platforms"], ["backup", "Backup"]];
  return (
    <div>
      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800">
        {tabs.map(([to, label]) => (
          <NavLink key={to} to={`/admin/${to}`} className={({ isActive }) => `-mb-px border-b-2 px-3 py-2 text-sm font-medium ${isActive ? "border-indigo-500 text-indigo-600 dark:text-indigo-400" : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"}`}>
            {label}
          </NavLink>
        ))}
      </div>
      <Routes>
        <Route index element={<Navigate to="assignments" replace />} />
        <Route path="assignments" element={<Assignments />} />
        <Route path="accounts" element={<Accounts />} />
        <Route path="people" element={<People />} />
        <Route path="platforms" element={<Platforms />} />
        <Route path="backup" element={<Backup />} />
      </Routes>
    </div>
  );
}

// ---------- assignments ----------

function Assignments() {
  const accounts = useAccounts().data ?? [];
  const people = usePeople().data ?? [];
  const rules = useRules().data ?? [];
  const inv = useInvalidate();
  const [err, setErr] = useState<unknown>(null);
  const get = (accountId: number, role: string) => rules.find((r) => r.account_id === accountId && r.role === role)?.profile_id ?? null;
  const set = async (account_id: number, role: string, profile_id: number | null) => {
    setErr(null);
    try {
      await api("/admin/rules", { method: "PUT", json: { account_id, role, profile_id } });
      inv("rules");
    } catch (e) {
      setErr(e);
    }
  };
  if (!accounts.length) return <Empty>Add accounts first, then assign who handles each one.</Empty>;

  const load = people.filter((p) => p.active).map((p) => ({ p, n: rules.filter((r) => r.profile_id === p.id) }));
  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500">Who handles each account. New posts on an account pick these people up automatically; they can still be changed per post.</p>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-xs uppercase text-slate-500">
            <tr><th className="p-3">Account</th><th className="p-3">Manager (posts it)</th><th className="p-3">Creative (media)</th><th className="p-3">Writer</th></tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="p-3"><PlatformDot color={a.platform_color} name={a.platform_name} /><div className="font-medium">{a.handle}</div></td>
                {(["manager", "creative", "writer"] as const).map((role) => (
                  <td key={role} className="p-3"><PersonSelect people={people} role={role} value={get(a.id, role)} onChange={(v) => set(a.id, role, v)} /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ErrorText error={err} />
      <div>
        <h2 className="mb-2 font-semibold">By person</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {load.map(({ p, n }) => (
            <div key={p.id} className="card p-3">
              <div className="flex items-center gap-2"><Avatar person={p} /><span className="font-medium">{p.name}</span></div>
              {n.length === 0 ? <p className="mt-2 text-xs text-slate-500">No accounts</p> : (
                <ul className="mt-2 space-y-0.5 text-xs">
                  {n.map((r) => { const a = accounts.find((x) => x.id === r.account_id); return a && <li key={r.id}>{r.role}: {a.platform_name} · {a.handle}</li>; })}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- accounts ----------

function Accounts() {
  const accounts = useAccounts().data ?? [];
  const platforms = usePlatforms().data ?? [];
  const [editing, setEditing] = useState<Partial<Account> | null>(null);
  const inv = useInvalidate();
  return (
    <div className="space-y-4">
      <button className="btn-primary" onClick={() => setEditing({ platform_id: platforms[0]?.id, active: 1 })}>+ Add account</button>
      {accounts.length === 0 ? <Empty>No accounts yet.</Empty> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((a) => (
            <button key={a.id} className={`card p-3 text-left hover:border-indigo-400 ${a.active ? "" : "opacity-50"}`} onClick={() => setEditing(a)}>
              <PlatformDot color={a.platform_color} name={a.platform_name} />
              <div className="mt-1 font-medium">{a.handle}</div>
              {a.display_name && <div className="text-sm text-slate-500">{a.display_name}</div>}
              {!a.active && <div className="text-xs text-amber-600">Paused</div>}
            </button>
          ))}
        </div>
      )}
      {editing && <AccountForm initial={editing} platforms={platforms} onClose={() => setEditing(null)} onSaved={() => (inv("accounts", "rules"), setEditing(null))} />}
    </div>
  );
}

function AccountForm({ initial, platforms, onClose, onSaved }: { initial: Partial<Account>; platforms: Platform[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState(initial);
  const [err, setErr] = useState<unknown>(null);
  const field = (k: keyof Account, label: string, ph = "") => (
    <div>
      <label className="label">{label}</label>
      <input className="input" placeholder={ph} value={(f[k] as string) ?? ""} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </div>
  );
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const json = { platform_id: f.platform_id, handle: f.handle, display_name: f.display_name, url: f.url, timezone: f.timezone, notes: f.notes, active: !!f.active };
      if (f.id) await api(`/admin/accounts/${f.id}`, { method: "PATCH", json });
      else await api("/admin/accounts", { method: "POST", json });
      onSaved();
    } catch (e) {
      setErr(e);
    }
  };
  return (
    <Modal open onClose={onClose} title={f.id ? "Edit account" : "Add account"}>
      <form onSubmit={save} className="space-y-3">
        <div>
          <label className="label">Platform</label>
          <select className="input" value={f.platform_id} onChange={(e) => setF({ ...f, platform_id: Number(e.target.value) })}>
            {platforms.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        {field("handle", "Handle / name", "@brand or Page name")}
        {field("display_name", "Display name")}
        {field("url", "Profile URL", "https://")}
        {field("timezone", "Audience timezone", "e.g. America/New_York")}
        <div>
          <label className="label">Notes</label>
          <textarea className="input" value={f.notes ?? ""} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Tone of voice, posting rules… never passwords" />
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.active} onChange={(e) => setF({ ...f, active: e.target.checked ? 1 : 0 })} /> Active</label>
        <ErrorText error={err} />
        <div className="flex gap-2">
          <button className="btn-primary">Save</button>
          {f.id && (
            <button type="button" className="btn-danger ml-auto" onClick={async () => {
              if (!confirm(`Delete ${f.handle}? Past posts keep their history.`)) return;
              await api(`/admin/accounts/${f.id}`, { method: "DELETE" });
              onSaved();
            }}>Delete</button>
          )}
        </div>
      </form>
    </Modal>
  );
}

// ---------- people ----------

function People() {
  const people = usePeople().data ?? [];
  const me = useMe().data!;
  const [editing, setEditing] = useState<Partial<Person> | null>(null);
  const inv = useInvalidate();
  return (
    <div className="space-y-4">
      <button className="btn-primary" onClick={() => setEditing({ roles: ["writer"], avatar_color: COLORS[people.length % COLORS.length], active: 1 })}>+ Add person</button>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {people.map((p) => (
          <button key={p.id} className={`card flex items-center gap-3 p-3 text-left hover:border-indigo-400 ${p.active ? "" : "opacity-50"}`} onClick={() => setEditing(p)}>
            <Avatar person={p} size={40} />
            <div className="min-w-0">
              <div className="font-medium">{p.name}{p.id === me.id && <span className="text-xs text-slate-500"> (you)</span>}</div>
              <div className="text-xs text-slate-500">{p.roles.join(", ") || "no roles"}</div>
              {p.locked_until && p.locked_until > Date.now() && <div className="text-xs text-red-600">Locked out</div>}
            </div>
          </button>
        ))}
      </div>
      {editing && <PersonForm initial={editing} onClose={() => setEditing(null)} onSaved={() => (inv("profiles", "me"), setEditing(null))} />}
    </div>
  );
}

function PersonForm({ initial, onClose, onSaved }: { initial: Partial<Person>; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState(initial);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState<unknown>(null);
  const toggle = (r: Role) => setF({ ...f, roles: f.roles?.includes(r) ? f.roles.filter((x) => x !== r) : [...(f.roles ?? []), r] });
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const json: Record<string, unknown> = { name: f.name, avatar_color: f.avatar_color, roles: f.roles, email: f.email, active: !!f.active };
      if (pin) json.pin = pin;
      if (f.id) await api(`/admin/profiles/${f.id}`, { method: "PATCH", json });
      else await api("/admin/profiles", { method: "POST", json: { ...json, pin } });
      onSaved();
    } catch (e) {
      setErr(e);
    }
  };
  return (
    <Modal open onClose={onClose} title={f.id ? "Edit person" : "Add person"}>
      <form onSubmit={save} className="space-y-3">
        <div><label className="label">Name</label><input className="input" value={f.name ?? ""} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div>
          <label className="label">Colour</label>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button type="button" key={c} onClick={() => setF({ ...f, avatar_color: c })} className={`h-7 w-7 rounded-full ${f.avatar_color === c ? "ring-2 ring-offset-2 ring-slate-900 dark:ring-white dark:ring-offset-slate-900" : ""}`} style={{ background: c }} aria-label={c} />
            ))}
          </div>
        </div>
        <div>
          <label className="label">Roles</label>
          <div className="flex flex-wrap gap-3">
            {ROLES.map((r) => <label key={r} className="flex items-center gap-1.5 text-sm capitalize"><input type="checkbox" checked={!!f.roles?.includes(r)} onChange={() => toggle(r)} /> {r}</label>)}
          </div>
          <p className="mt-1 text-xs text-slate-500">Writer: copy. Creative: media. Manager: review, schedule, mark posted. Admin: this screen.</p>
        </div>
        <div>
          <label className="label">{f.id ? "Reset PIN (leave blank to keep)" : "4-digit PIN"}</label>
          <input className="input" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
        </div>
        <div><label className="label">Email (optional)</label><input className="input" type="email" value={f.email ?? ""} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        {f.id && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.active} onChange={(e) => setF({ ...f, active: e.target.checked ? 1 : 0 })} /> Active (shows on the profile screen)</label>}
        <ErrorText error={err} />
        <button className="btn-primary">Save</button>
      </form>
    </Modal>
  );
}

// ---------- platforms ----------

function Platforms() {
  const platforms = usePlatforms().data ?? [];
  const [editing, setEditing] = useState<Partial<Platform> | null>(null);
  const inv = useInvalidate();
  return (
    <div className="space-y-4">
      <button className="btn-primary" onClick={() => setEditing({ color: "#64748b", extra_fields: [], active: 1 })}>+ Add platform</button>
      <div className="card divide-y divide-slate-100 dark:divide-slate-800">
        {platforms.map((p) => (
          <button key={p.id} onClick={() => setEditing(p)} className={`flex w-full items-center gap-3 p-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 ${p.active ? "" : "opacity-50"}`}>
            <PlatformDot color={p.color} name={p.name} />
            <span className="text-xs text-slate-500">{p.char_limit ? `${p.char_limit} chars` : "no limit"}</span>
            {p.extra_fields.length > 0 && <span className="text-xs text-slate-500">+ {p.extra_fields.map((x) => x.label).join(", ")}</span>}
          </button>
        ))}
      </div>
      {editing && <PlatformForm initial={editing} onClose={() => setEditing(null)} onSaved={() => (inv("platforms", "accounts"), setEditing(null))} />}
    </div>
  );
}

function PlatformForm({ initial, onClose, onSaved }: { initial: Partial<Platform>; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState(initial);
  const [extras, setExtras] = useState((initial.extra_fields ?? []).map((x) => x.label).join(", "));
  const [err, setErr] = useState<unknown>(null);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const extra_fields = extras.split(",").map((s) => s.trim()).filter(Boolean).map((label) => ({ key: label.toLowerCase().replace(/[^a-z0-9]+/g, "_"), label }));
    const json = { name: f.name, char_limit: f.char_limit || null, color: f.color, active: !!f.active, extra_fields };
    try {
      if (f.id) await api(`/admin/platforms/${f.id}`, { method: "PATCH", json });
      else await api("/admin/platforms", { method: "POST", json: { ...json, key: f.name } });
      onSaved();
    } catch (e) {
      setErr(e);
    }
  };
  return (
    <Modal open onClose={onClose} title={f.id ? "Edit platform" : "Add platform"}>
      <form onSubmit={save} className="space-y-3">
        <div><label className="label">Name</label><input className="input" value={f.name ?? ""} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div><label className="label">Character limit</label><input className="input" type="number" value={f.char_limit ?? ""} onChange={(e) => setF({ ...f, char_limit: e.target.value ? Number(e.target.value) : null })} /></div>
        <div><label className="label">Colour</label><input type="color" className="h-9 w-16" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} /></div>
        <div>
          <label className="label">Extra fields per post</label>
          <input className="input" value={extras} onChange={(e) => setExtras(e.target.value)} placeholder="e.g. Subreddit, Post title" />
          <p className="mt-1 text-xs text-slate-500">Comma separated. Shown on each post for this platform.</p>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.active} onChange={(e) => setF({ ...f, active: e.target.checked ? 1 : 0 })} /> Active</label>
        <ErrorText error={err} />
        <button className="btn-primary">Save</button>
      </form>
    </Modal>
  );
}

// ---------- backup ----------

function Backup() {
  const [msg, setMsg] = useState("");
  return (
    <div className="card max-w-lg space-y-3 p-4">
      <p className="text-sm">A JSON snapshot of the whole database is saved to R2 every night at 02:00 UTC. The last 30 days are kept under <code>backups/</code> in the media bucket.</p>
      <button className="btn-outline" onClick={async () => setMsg(`Saved ${(await api<{ key: string }>("/admin/backup", { method: "POST" })).key}`)}>Back up now</button>
      {msg && <p className="text-sm text-emerald-600">{msg}</p>}
    </div>
  );
}
