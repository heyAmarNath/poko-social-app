import { useState } from "react";
import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { addDays, startOfDay } from "@/lib/dates";
import { useRefresh } from "@/lib/data";
import { attempt } from "@/lib/errors";
import type { TargetRow } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { FilterBar, useFilters } from "@/components/filters";
import { PageHeader } from "@/components/page-header";
import { StatusDot } from "@/components/status";
import { isOverdue, TargetCard } from "@/components/target-card";
import { canTransition, OPEN_STATUSES, STATUS_LABEL, STATUSES, type Status } from "../../../shared/rules";

const VIEWS = {
  upcoming: "Next 14 days",
  overdue: "Overdue",
  unassigned: "No manager",
  unscheduled: "No date",
  all: "All open",
} as const;
type View = keyof typeof VIEWS;

export function BoardPage() {
  const [sp, setSp] = useSearchParams();
  const view: View = (sp.get("view") as View) in VIEWS ? (sp.get("view") as View) : "upcoming";
  const [showDone, setShowDone] = useState(false);
  const [over, setOver] = useState<Status | null>(null);
  const f = useFilters();
  const refresh = useRefresh();
  const today = startOfDay(new Date()).getTime();
  const open = `status=${OPEN_STATUSES.join(",")}`;

  const query = {
    upcoming: `from=${today}&to=${addDays(new Date(today), 14).getTime()}`,
    overdue: `to=${Date.now()}&${open}`,
    unassigned: open,
    unscheduled: "unscheduled=1",
    all: open,
  }[view];
  const q = useQuery({ queryKey: ["targets", "board", view], queryFn: () => api<TargetRow[]>(`/targets?${query}`) });
  let rows = f.apply(q.data ?? []);
  if (view === "unassigned") rows = rows.filter((t) => !t.manager_id);
  if (view === "overdue") rows = rows.filter(isOverdue);

  const columns = STATUSES.filter((s) => showDone || (s !== "posted" && s !== "cancelled"));

  const drop = async (id: number, to: Status) => {
    setOver(null);
    const t = rows.find((r) => r.id === id);
    if (!t || t.status === to) return;
    const check = canTransition(t.status, to);
    if (!check.ok) return void toast.error(check.reason);
    await attempt(async () => {
      await api(`/targets/${id}/status`, { method: "POST", json: { status: to } });
      refresh();
    });
  };

  return (
    <div>
      <PageHeader title="Board" description="Drag a card to change its status." />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Tabs
          value={view}
          onValueChange={(v) => {
            const n = new URLSearchParams(sp);
            n.set("view", v);
            setSp(n, { replace: true });
          }}
        >
          <TabsList>
            {(Object.keys(VIEWS) as View[]).map((v) => <TabsTrigger key={v} value={v}>{VIEWS[v]}</TabsTrigger>)}
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2">
          <Switch id="done" checked={showDone} onCheckedChange={setShowDone} />
          <Label htmlFor="done">Posted & cancelled</Label>
        </div>
        <div className="flex flex-wrap gap-2 lg:ml-auto"><FilterBar f={f} /></div>
      </div>
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4 md:-mx-6 md:px-6">
        {columns.map((s) => {
          const list = rows.filter((t) => t.status === s);
          return (
            <div
              key={s}
              className={cn("flex w-72 shrink-0 flex-col rounded-xl bg-muted/50 p-2 transition-colors", over === s && "bg-muted ring-2 ring-ring/30")}
              onDragOver={(e) => (e.preventDefault(), setOver(s))}
              onDragLeave={() => setOver((o) => (o === s ? null : o))}
              onDrop={(e) => drop(Number(e.dataTransfer.getData("text/plain")), s)}
            >
              <div className="flex items-center gap-2 px-2 pb-2 pt-1 text-sm font-medium">
                <StatusDot status={s} />
                {STATUS_LABEL[s]}
                <span className="ml-auto text-xs font-normal text-muted-foreground">{list.length}</span>
              </div>
              <div className="min-h-24 space-y-2">
                {list.map((t) => (
                  <div key={t.id} draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", String(t.id))} className="cursor-grab active:cursor-grabbing">
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
