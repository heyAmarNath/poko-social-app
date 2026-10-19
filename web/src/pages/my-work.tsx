import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ClipboardCheck, Hourglass, Image, PenLine, Send } from "lucide-react";
import { api } from "@/lib/api";
import { useMe } from "@/lib/data";
import { fmtDateTime } from "@/lib/dates";
import type { TargetRow } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { PageHeader } from "@/components/page-header";
import { TargetCard } from "@/components/target-card";

type Section = { title: string; hint: string; icon: typeof PenLine; rows: TargetRow[]; due?: (t: TargetRow) => number | null };

export function MyWorkPage() {
  const me = useMe().data!;
  const q = useQuery({ queryKey: ["targets", "mine"], queryFn: () => api<TargetRow[]>("/targets?mine=1") });
  const rows = q.data ?? [];
  const sections: Section[] = [
    {
      title: "Copy to write", icon: PenLine, hint: "You're the writer and it isn't in review yet.", due: (t) => t.copy_due,
      rows: rows.filter((t) => t.writer_id === me.id && ["not_ready", "working", "changes_requested"].includes(t.status)),
    },
    {
      title: "Media to make", icon: Image, hint: "You're the creative and it isn't scheduled yet.", due: (t) => t.media_due,
      rows: rows.filter((t) => t.creative_id === me.id && !["scheduled", "posted", "cancelled"].includes(t.status)),
    },
    {
      title: "To review", icon: ClipboardCheck, hint: "You manage the account and it's waiting for review.",
      rows: rows.filter((t) => t.manager_id === me.id && t.status === "waiting_review"),
    },
    {
      title: "To publish", icon: Send, hint: "Scheduled on accounts you manage.",
      rows: rows.filter((t) => t.manager_id === me.id && t.status === "scheduled"),
    },
  ];
  const shown = new Set(sections.flatMap((s) => s.rows.map((t) => t.id)));
  sections.push({ title: "Waiting on others", icon: Hourglass, hint: "Open items you're on, where the next step is someone else's.", rows: rows.filter((t) => !shown.has(t.id)) });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="My work" description="Everything open that has your name on it." />
      {q.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-36 rounded-xl" />)}</div>
      ) : !rows.length ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon"><CheckCircle2 /></EmptyMedia>
            <EmptyTitle>All caught up</EmptyTitle>
            <EmptyDescription>Nothing open is assigned to you.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-10">
          {sections.filter((s) => s.rows.length).map((s) => (
            <section key={s.title}>
              <div className="mb-3 flex items-center gap-2">
                <s.icon className="size-4 text-muted-foreground" />
                <h2 className="font-medium">{s.title}</h2>
                <Badge variant="secondary">{s.rows.length}</Badge>
                <span className="hidden text-sm text-muted-foreground sm:inline">{s.hint}</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {s.rows.map((t) => {
                  const due = s.due?.(t);
                  return (
                    <div key={t.id} className="space-y-1">
                      <TargetCard t={t} showDate />
                      {due && <p className={cn("px-1 text-xs", due < Date.now() ? "font-medium text-destructive" : "text-muted-foreground")}>Due {fmtDateTime(due)}</p>}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
