import { useState } from "react";
import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { addDays, startOfDay } from "../lib/dates";
import type { TargetRow } from "../lib/types";
import { isOverdue, TargetCard } from "../components/TargetCard";
import { FilterBar, useFilters } from "../components/Filters";
import { useMe, useRefresh } from "../lib/data";
import { canTransition, STATUS_LABEL, STATUSES, type Status } from "../../../shared/rules";
import { STATUS_STYLE } from "../components/ui";

const VIEWS = {
  upcoming: "Next 14 days",
  overdue: "Overdue",
  unassigned: "No manager",
  unscheduled: "No date yet",
  all: "Everything open",
} as const;
type View = keyof typeof VIEWS;

export function BoardView() {
  const [sp, setSp] = useSearchParams();
  const view = (sp.get("view") as View) in VIEWS ? (sp.get("view") as View) : "upcoming";
  const [showDone, setShowDone] = useState(false);
  const [error, setError] = useState("");
  const f = useFilters();
  const me = useMe().data!;
  const refresh = useRefresh();
  const today = startOfDay(new Date()).getTime();

  const query = {
    upcoming: `from=${today}&to=${addDays(new Date(today), 14).getTime()}`,
    overdue: `to=${Date.now()}&status=not_ready,working,waiting_review,changes_requested,scheduled`,
    unassigned: `status=not_ready,working,waiting_review,changes_requested,scheduled`,
    unscheduled: `unscheduled=1`,
    all: `status=not_ready,working,waiting_review,changes_requested,scheduled`,
  }[view];
  const q = useQuery({ queryKey: ["targets", "board", view], queryFn: () => api<TargetRow[]>(`/targets?${query}`) });
  let rows = f.apply(q.data ?? []);
  if (view === "unassigned") rows = rows.filter((t) => !t.manager_id);
  if (view === "overdue") rows = rows.filter(isOverdue);

  const columns = STATUSES.filter((s) => showDone || (s !== "posted" && s !== "cancelled"));

  const drop = async (id: number, to: Status) => {
    const t = rows.find((r) => r.id === id);
    if (!t || t.status === to) return;
    const check = canTransition(me, t.status, to, t.manager_id);
    if (!check.ok) return setError(check.reason);
    try {
      await api(`/targets/${id}/status`, { method: "POST", json: { status: to } });
      setError("");
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {(Object.keys(VIEWS) as View[]).map((v) => (
            <button
              key={v}
              className={`btn ${v === view ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "btn-outline"}`}
              onClick={() => {
                const n = new URLSearchParams(sp);
                n.set("view", v);
                setSp(n, { replace: true });
              }}
            >
              {VIEWS[v]}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Show posted & cancelled
        </label>
        <div className="ml-auto"><FilterBar f={f} /></div>
      </div>
      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      <div className="flex gap-3 overflow-x-auto pb-4">
        {columns.map((s) => {
          const list = rows.filter((t) => t.status === s);
          return (
            <div
              key={s}
              className="flex w-72 shrink-0 flex-col rounded-xl bg-slate-100 p-2 dark:bg-slate-900/50"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => drop(Number(e.dataTransfer.getData("text/plain")), s)}
            >
              <div className="mb-2 flex items-center justify-between px-1">
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[s]}`}>{STATUS_LABEL[s]}</span>
                <span className="text-xs text-slate-500">{list.length}</span>
              </div>
              <div className="min-h-24 space-y-2">
                {list.map((t) => (
                  <div key={t.id} draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", String(t.id))}>
                    <TargetCard t={t} compact showDate />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
