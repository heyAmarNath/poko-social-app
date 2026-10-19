import { Link, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { addDays, fmtDay, parseYmd, startOfWeek, ymd } from "../lib/dates";
import type { TargetRow } from "../lib/types";
import { TargetCard } from "../components/TargetCard";
import { FilterBar, useFilters } from "../components/Filters";

export function WeekView() {
  const [sp, setSp] = useSearchParams();
  const start = startOfWeek(parseYmd(sp.get("date")));
  const f = useFilters();
  const from = start.getTime();
  const to = addDays(start, 7).getTime();
  const q = useQuery({ queryKey: ["targets", "week", from], queryFn: () => api<TargetRow[]>(`/targets?from=${from}&to=${to}`) });
  const rows = f.apply(q.data ?? []);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const go = (d: Date) => {
    const n = new URLSearchParams(sp);
    n.set("date", ymd(d));
    setSp(n);
  };
  const today = ymd(new Date());

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button className="btn-outline" onClick={() => go(addDays(start, -7))} aria-label="Previous week">←</button>
        <button className="btn-outline" onClick={() => go(addDays(start, 7))} aria-label="Next week">→</button>
        <button className="btn-ghost" onClick={() => go(new Date())}>This week</button>
        <h1 className="text-lg font-semibold">
          {fmtDay(start, { month: "short", day: "numeric" })} – {fmtDay(addDays(start, 6), { month: "short", day: "numeric", year: "numeric" })}
        </h1>
        <div className="ml-auto"><FilterBar f={f} /></div>
      </div>
      <div className="grid gap-3 md:grid-cols-7">
        {days.map((d) => {
          const list = rows.filter((t) => t.scheduled_at! >= d.getTime() && t.scheduled_at! < addDays(d, 1).getTime());
          return (
            <div key={d.getTime()} className={`min-h-32 rounded-xl p-2 ${ymd(d) === today ? "bg-indigo-50 dark:bg-indigo-950/40" : "bg-slate-100 dark:bg-slate-900/50"}`}>
              <Link to={`/day?date=${ymd(d)}`} className="mb-2 flex items-baseline justify-between px-1 text-sm font-semibold hover:underline">
                <span>{fmtDay(d, { weekday: "short", day: "numeric" })}</span>
                <span className="text-xs font-normal text-slate-500">{list.length || ""}</span>
              </Link>
              <div className="space-y-2">{list.map((t) => <TargetCard key={t.id} t={t} compact />)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
