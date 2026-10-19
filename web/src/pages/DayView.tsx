import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { addDays, fmtDay, parseYmd, startOfDay, ymd } from "../lib/dates";
import type { TargetRow } from "../lib/types";
import { TargetCard } from "../components/TargetCard";
import { FilterBar, useFilters } from "../components/Filters";
import { Empty } from "../components/ui";
import { canEditCopy, overallStatus, STATUS_LABEL } from "../../../shared/rules";
import { useMe } from "../lib/data";

export function DayView() {
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const me = useMe().data!;
  const day = parseYmd(sp.get("date"));
  const [groupBy, setGroupBy] = useState<"time" | "account">("time");
  const f = useFilters();
  const from = day.getTime();
  const to = addDays(day, 1).getTime();
  const q = useQuery({ queryKey: ["targets", "day", from], queryFn: () => api<TargetRow[]>(`/targets?from=${from}&to=${to}`) });
  const rows = f.apply(q.data ?? []);
  const go = (d: Date) => {
    const n = new URLSearchParams(sp);
    n.set("date", ymd(d));
    setSp(n);
  };
  const isToday = ymd(day) === ymd(new Date());

  const groups = new Map<string, TargetRow[]>();
  for (const t of rows) {
    const k = groupBy === "account" ? `${t.platform_name} · ${t.handle}` : "";
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  const done = rows.filter((t) => t.status === "posted").length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button className="btn-outline" onClick={() => go(addDays(day, -1))} aria-label="Previous day">←</button>
        <input type="date" className="input w-auto" value={ymd(day)} onChange={(e) => e.target.value && go(parseYmd(e.target.value))} />
        <button className="btn-outline" onClick={() => go(addDays(day, 1))} aria-label="Next day">→</button>
        {!isToday && <button className="btn-ghost" onClick={() => go(startOfDay(new Date()))}>Today</button>}
        <div className="ml-auto flex flex-wrap gap-2">
          <FilterBar f={f} />
          <select className="input w-auto" value={groupBy} onChange={(e) => setGroupBy(e.target.value as "time" | "account")}>
            <option value="time">By time</option>
            <option value="account">By account</option>
          </select>
        </div>
      </div>
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">{isToday ? "Today" : fmtDay(day)}</h1>
        {rows.length > 0 && (
          <span className="text-sm text-slate-500">{done}/{rows.length} posted · overall: {STATUS_LABEL[overallStatus(rows.map((r) => r.status))]}</span>
        )}
      </div>
      {q.isPending ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : rows.length === 0 ? (
        <Empty>
          Nothing scheduled for this day.
          {canEditCopy(me) && (
            <div className="mt-3">
              <button className="btn-primary" onClick={() => nav(`/posts/new?date=${ymd(day)}`)}>+ Plan a post</button>
            </div>
          )}
        </Empty>
      ) : (
        <div className="space-y-6">
          {[...groups].map(([name, list]) => (
            <section key={name}>
              {name && <h2 className="mb-2 text-sm font-semibold text-slate-500">{name}</h2>}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((t) => <TargetCard key={t.id} t={t} />)}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
