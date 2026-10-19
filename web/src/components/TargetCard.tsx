import { useState } from "react";
import { Link } from "react-router";
import { api } from "../lib/api";
import { useMe, usePeopleMap, useRefresh } from "../lib/data";
import { fmtDateTime, fmtTime } from "../lib/dates";
import type { TargetRow } from "../lib/types";
import { Avatar, PlatformDot, STATUS_STYLE, StatusChip } from "./ui";
import { canTransition, STATUS_LABEL, TRANSITIONS, type Status } from "../../../shared/rules";

const OPEN: Status[] = ["not_ready", "working", "waiting_review", "changes_requested", "scheduled"];

export const isOverdue = (t: TargetRow) => !!t.scheduled_at && t.scheduled_at < Date.now() && OPEN.includes(t.status);

/** Status dropdown showing only transitions this user may make. */
export function StatusMenu({ target, onError }: { target: Pick<TargetRow, "id" | "status" | "manager_id">; onError?: (m: string) => void }) {
  const me = useMe().data!;
  const refresh = useRefresh();
  const [busy, setBusy] = useState(false);
  const options = TRANSITIONS[target.status].filter((s) => canTransition(me, target.status, s, target.manager_id).ok);
  if (!options.length) return <StatusChip status={target.status} />;
  return (
    <select
      aria-label="Change status"
      disabled={busy}
      className={`cursor-pointer appearance-none rounded-full border-0 px-2 py-0.5 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${STATUS_STYLE[target.status]}`}
      value=""
      onClick={(e) => e.stopPropagation()}
      onChange={async (e) => {
        const to = e.target.value as Status;
        let posted_url: string | undefined;
        if (to === "posted") posted_url = window.prompt("Live post URL (optional)") || undefined;
        setBusy(true);
        try {
          await api(`/targets/${target.id}/status`, { method: "POST", json: { status: to, posted_url } });
          refresh();
        } catch (err) {
          onError ? onError((err as Error).message) : alert((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <option value="" disabled>{STATUS_LABEL[target.status]} ▾</option>
      {options.map((s) => (
        <option key={s} value={s}>→ {STATUS_LABEL[s]}</option>
      ))}
    </select>
  );
}

export function TargetCard({ t, compact, showDate }: { t: TargetRow; compact?: boolean; showDate?: boolean }) {
  const people = usePeopleMap();
  const overdue = isOverdue(t);
  const text = t.body_override ?? t.body;
  return (
    <div className={`card group relative p-3 transition hover:border-indigo-400 ${overdue ? "border-l-4 border-l-red-500" : ""}`}>
      <Link to={`/posts/${t.post_id}`} className="absolute inset-0" aria-label={t.title} />
      <div className="flex items-center justify-between gap-2">
        <PlatformDot color={t.platform_color} name={compact ? t.platform_name : `${t.platform_name} · ${t.handle}`} />
        <span className={`text-xs tabular-nums ${overdue ? "font-semibold text-red-600" : "text-slate-500"}`}>
          {t.scheduled_at ? (showDate ? fmtDateTime(t.scheduled_at) : fmtTime(t.scheduled_at)) : "No time"}
        </span>
      </div>
      <div className={`mt-1.5 font-medium ${compact ? "text-sm leading-snug" : ""}`}>{t.title}</div>
      {compact && <div className="text-xs text-slate-500">{t.handle}</div>}
      {!compact && text && <p className="mt-1 line-clamp-2 text-sm text-slate-600 dark:text-slate-400">{text}</p>}
      <div className="relative mt-2 flex items-center justify-between gap-2">
        <span className="relative z-10"><StatusMenu target={t} /></span>
        <div className="flex items-center gap-1">
          {t.attachment_count > 0 && <span className="whitespace-nowrap text-xs text-slate-500">📎{t.attachment_count}</span>}
          <span title="Writer"><Avatar person={t.writer_id ? people.get(t.writer_id) : null} size={20} /></span>
          <span title="Creative"><Avatar person={t.creative_id ? people.get(t.creative_id) : null} size={20} /></span>
          <span title="Manager"><Avatar person={t.manager_id ? people.get(t.manager_id) : null} size={20} /></span>
        </div>
      </div>
    </div>
  );
}
