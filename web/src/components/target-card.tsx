import { Link } from "react-router";
import { Clock, Paperclip } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePeopleMap } from "@/lib/data";
import { fmtDateTime, fmtTime } from "@/lib/dates";
import type { TargetRow } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PersonAvatar } from "@/components/people";
import { PlatformLabel } from "@/components/platform";
import { StatusMenu } from "@/components/status";
import { OPEN_STATUSES } from "../../../shared/rules";

export const isOverdue = (t: TargetRow) => !!t.scheduled_at && t.scheduled_at < Date.now() && OPEN_STATUSES.includes(t.status);

export function TargetCard({ t, compact, showDate }: { t: TargetRow; compact?: boolean; showDate?: boolean }) {
  const people = usePeopleMap();
  const overdue = isOverdue(t);
  const text = t.body_override ?? t.body;
  return (
    <Card className={cn("relative gap-0 p-4 transition-colors hover:bg-muted/40", overdue && "ring-1 ring-destructive/50")}>
      <Link to={`/posts/${t.post_id}`} className="absolute inset-0 rounded-[inherit]" aria-label={`Open ${t.title}`} />
      <div className="flex items-center justify-between gap-2">
        <PlatformLabel color={t.platform_color} name={t.platform_name} detail={t.handle} className="text-xs" />
        <span className={cn("flex shrink-0 items-center gap-1 text-xs tabular-nums", overdue ? "font-medium text-destructive" : "text-muted-foreground")}>
          <Clock className="size-3" />
          {t.scheduled_at ? (showDate ? fmtDateTime(t.scheduled_at) : fmtTime(t.scheduled_at)) : "No time"}
        </span>
      </div>
      <div className="mt-2 font-medium leading-snug">{t.title}</div>
      {!compact && text && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{text}</p>}
      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <StatusMenu target={t} />
          {overdue && <Badge variant="destructive">Overdue</Badge>}
        </div>
        <div className="relative z-10 flex items-center gap-2">
          {t.attachment_count > 0 && (
            <span className="flex items-center gap-0.5 text-xs text-muted-foreground"><Paperclip className="size-3" />{t.attachment_count}</span>
          )}
          <div className="flex -space-x-1 [&_[data-slot=avatar]]:ring-2 [&_[data-slot=avatar]]:ring-card">
            <PersonAvatar size="sm" label="Writer" person={t.writer_id ? people.get(t.writer_id) : null} />
            <PersonAvatar size="sm" label="Creative" person={t.creative_id ? people.get(t.creative_id) : null} />
            <PersonAvatar size="sm" label="Manager" person={t.manager_id ? people.get(t.manager_id) : null} />
          </div>
        </div>
      </div>
    </Card>
  );
}
