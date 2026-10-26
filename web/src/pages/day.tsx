import { Link, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarPlus, ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { addDays, fmtDay, parseYmd, startOfDay, ymd } from "@/lib/dates";
import type { PostSummary } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { DatePicker } from "@/components/date-picker";
import { PageHeader } from "@/components/page-header";
import { PostList } from "@/components/post-list";

/** Everything planned for a day: today unless ?date=YYYY-MM-DD picks another. */
export function DayPage() {
  const [sp, setSp] = useSearchParams();
  const day = parseYmd(sp.get("date"));
  const go = (d: Date) => {
    const n = new URLSearchParams(sp);
    n.set("date", ymd(d));
    setSp(n);
  };
  const isToday = ymd(day) === ymd(new Date());
  // Every control keeps its size and place whatever the date, so stepping through days never moves them.
  return (
    <DayPosts
      day={day}
      actions={
        <>
          <Button variant="outline" size="icon" onClick={() => go(addDays(day, -1))} aria-label="Previous day"><ChevronLeft /></Button>
          <DatePicker value={day} onChange={go} className="w-48 tabular-nums" />
          <Button variant="outline" size="icon" onClick={() => go(addDays(day, 1))} aria-label="Next day"><ChevronRight /></Button>
          <Button variant="outline" disabled={isToday} onClick={() => go(startOfDay(new Date()))}>Today</Button>
        </>
      }
    />
  );
}

function DayPosts({ day, actions }: { day: Date; actions: React.ReactNode }) {
  const from = day.getTime();
  const to = addDays(day, 1).getTime();
  const q = useQuery({ queryKey: ["posts", "day", from], queryFn: () => api<PostSummary[]>(`/posts?from=${from}&to=${to}`) });
  const rows = q.data ?? [];
  const isToday = ymd(day) === ymd(new Date());
  const done = rows.filter((p) => p.status === "completed").length;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Day"
        description={[fmtDay(day), rows.length > 0 && `${done} of ${rows.length} completed`].filter(Boolean).join(" · ")}
        actions={actions}
      />
      {q.isPending ? (
        <Skeleton className="h-48 rounded-xl" />
      ) : rows.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon"><CalendarPlus /></EmptyMedia>
            <EmptyTitle>Nothing planned</EmptyTitle>
            <EmptyDescription>No posts for {isToday ? "today" : fmtDay(day)}. Give a post a date to see it here.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent><Button asChild><Link to="/posts/new">New post</Link></Button></EmptyContent>
        </Empty>
      ) : (
        <PostList posts={rows} sortKey="day" />
      )}
    </div>
  );
}
