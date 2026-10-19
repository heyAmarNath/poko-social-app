import { useEffect, type ReactNode } from "react";
import { STATUS_LABEL, type Status } from "../../../shared/rules";
import type { Person } from "../lib/types";

export const STATUS_STYLE: Record<Status, string> = {
  not_ready: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  working: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  waiting_review: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  changes_requested: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
  scheduled: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  posted: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  cancelled: "bg-slate-100 text-slate-400 line-through dark:bg-slate-900 dark:text-slate-500",
};

export const StatusChip = ({ status }: { status: Status }) => (
  <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>
    {STATUS_LABEL[status]}
  </span>
);

export const PlatformDot = ({ color, name }: { color: string; name: string }) => (
  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
    <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
    {name}
  </span>
);

export function Avatar({ person, size = 24 }: { person?: Pick<Person, "name" | "avatar_color"> | null; size?: number }) {
  if (!person)
    return (
      <span
        title="Unassigned"
        className="inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-slate-400 text-slate-400"
        style={{ width: size, height: size, fontSize: size * 0.45 }}
      >
        ?
      </span>
    );
  const initials = person.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <span
      title={person.name}
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, background: person.avatar_color, fontSize: size * 0.4 }}
    >
      {initials}
    </span>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8" onMouseDown={onClose}>
      <div className={`card w-full ${wide ? "max-w-3xl" : "max-w-md"} p-5 shadow-xl`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button className="btn-ghost" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ErrorText({ error }: { error: unknown }) {
  if (!error) return null;
  return <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error instanceof Error ? error.message : String(error)}</p>;
}

export function PersonSelect({
  value, onChange, people, role, disabled, placeholder = "Unassigned",
}: {
  value: number | null; onChange: (v: number | null) => void; people: Person[]; role?: string; disabled?: boolean; placeholder?: string;
}) {
  const list = people.filter((p) => p.active && (!role || p.roles.includes(role as never) || p.id === value));
  return (
    <select className="input" value={value ?? ""} disabled={disabled} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
      <option value="">{placeholder}</option>
      {list.map((p) => (
        <option key={p.id} value={p.id}>{p.name}</option>
      ))}
    </select>
  );
}

export const Empty = ({ children }: { children: ReactNode }) => (
  <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">{children}</div>
);
