import { Link, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarPlus, ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { addDays, fmtDay, parseYmd, startOfDay, ymd } from "@/lib/dates";
import type { TargetRow } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { DatePicker } from "@/components/date-picker";
import { FilterBar, useFilters } from "@/components/filters";
import { PageHeader } from "@/components/page-header";
import { PlatformLabel } from "@/components/platform";
import { TargetCard } from "@/components/target-card";
import { StatusBadge } from "@/components/status";
import { overallStatus } from "../../../shared/rules";

export function DayPage() {
  const [sp, setSp] = useSearchParams();
  const day = parseYmd(sp.get("date"));
  const groupBy = sp.get("group") === "account" ? "account" : "time";
  const f = useFilters();
  const from = day.getTime();
  const to = addDays(day, 1).getTime();
  const q = useQuery({ queryKey: ["targets", "day", from], queryFn: () => api<TargetRow[]>(`/targets?from=${from}&to=${to}`) });
  const rows = f.apply(q.data ?? []);
  const setParam = (k: string, v: string) => {
    const n = new URLSearchParams(sp);
    n.set(k, v);
    setSp(n);
  };
  const go = (d: Date) => setParam("date", ymd(d));
  const isToday = ymd(day) === ymd(new Date());
  const posted = rows.filter((t) => t.status === "posted").length;

  const groups = new Map<string, TargetRow[]>();
  for (const t of rows) {
    const k = groupBy === "account" ? `${t.platform_id}:${t.handle}` : "all";
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={isToday ? "Today" : fmtDay(day)}
        description={
          rows.length ? (
            <span className="inline-flex items-center gap-2">
              {isToday && fmtDay(day)} {isToday && "·"} {posted} of {rows.length} posted
              <StatusBadge status={overallStatus(rows.map((r) => r.status))} />
            </span>
          ) : isToday ? fmtDay(day) : undefined
        }
        actions={
          <>
            <Button variant="outline" size="icon" onClick={() => go(addDays(day, -1))} aria-label="Previous day"><ChevronLeft /></Button>
            <DatePicker value={day} onChange={go} />
            <Button variant="outline" size="icon" onClick={() => go(addDays(day, 1))} aria-label="Next day"><ChevronRight /></Button>
            {!isToday && <Button variant="ghost" onClick={() => go(startOfDay(new Date()))}>Today</Button>}
          </>
        }
      />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <FilterBar f={f} />
        <ToggleGroup type="single" variant="outline" value={groupBy} onValueChange={(v) => v && setParam("group", v)} className="ml-auto">
          <ToggleGroupItem value="time">By time</ToggleGroupItem>
          <ToggleGroupItem value="account">By account</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {q.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-36 rounded-xl" />)}</div>
      ) : rows.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon"><CalendarPlus /></EmptyMedia>
            <EmptyTitle>Nothing scheduled</EmptyTitle>
            <EmptyDescription>No posts are planned for {isToday ? "today" : fmtDay(day)}.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild><Link to={`/posts/new?date=${ymd(day)}`}>Plan a post</Link></Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="space-y-8">
          {[...groups].map(([k, list]) => (
            <section key={k}>
              {groupBy === "account" && (
                <h2 className="mb-3"><PlatformLabel color={list[0].platform_color} name={list[0].platform_name} detail={list[0].handle} /></h2>
              )}
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
