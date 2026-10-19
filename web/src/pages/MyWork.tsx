import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useMe } from "../lib/data";
import { fmtDateTime } from "../lib/dates";
import type { TargetRow } from "../lib/types";
import { TargetCard } from "../components/TargetCard";
import { Empty } from "../components/ui";

export function MyWork() {
  const me = useMe().data!;
  const q = useQuery({ queryKey: ["targets", "mine"], queryFn: () => api<TargetRow[]>("/targets?mine=1") });
  const rows = q.data ?? [];
  const sections: { title: string; hint: string; rows: TargetRow[]; due?: (t: TargetRow) => number | null }[] = [
    {
      title: "Copy to write",
      hint: "You're the writer and it isn't in review yet",
      rows: rows.filter((t) => t.writer_id === me.id && ["not_ready", "working", "changes_requested"].includes(t.status)),
      due: (t) => t.copy_due,
    },
    {
      title: "Media to make",
      hint: "You're the creative and it isn't scheduled yet",
      rows: rows.filter((t) => t.creative_id === me.id && !["scheduled", "posted", "cancelled"].includes(t.status)),
      due: (t) => t.media_due,
    },
    {
      title: "To review",
      hint: "You manage the account and it's waiting for review",
      rows: rows.filter((t) => t.manager_id === me.id && t.status === "waiting_review"),
    },
    {
      title: "To publish",
      hint: "Scheduled on accounts you manage",
      rows: rows.filter((t) => t.manager_id === me.id && t.status === "scheduled"),
    },
  ];
  const shown = new Set(sections.flatMap((s) => s.rows.map((t) => t.id)));
  sections.push({
    title: "Waiting on others",
    hint: "Open items you're on, where the next step is someone else's",
    rows: rows.filter((t) => !shown.has(t.id)),
  });
  if (q.isPending) return <p className="text-sm text-slate-500">Loading…</p>;
  if (!rows.length) return <Empty>You're all caught up. 🎉</Empty>;
  return (
    <div className="space-y-8">
      {sections.filter((s) => s.rows.length).map((s) => (
        <section key={s.title}>
          <h2 className="text-lg font-semibold">{s.title} <span className="text-sm font-normal text-slate-500">({s.rows.length})</span></h2>
          <p className="mb-3 text-xs text-slate-500">{s.hint}</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {s.rows.map((t) => (
              <div key={t.id}>
                <TargetCard t={t} showDate />
                {s.due?.(t) && (
                  <p className={`mt-1 text-xs ${s.due(t)! < Date.now() ? "font-semibold text-red-600" : "text-slate-500"}`}>
                    Due {fmtDateTime(s.due(t)!)}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
