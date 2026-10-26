import { useState } from "react";
import { api } from "@/lib/api";
import { useRefresh } from "@/lib/data";
import { attempt } from "@/lib/errors";
import type { PostVersion } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STATUS_LABEL, STATUSES, type Status } from "../../../shared/rules";

const DOT: Record<Status, string> = {
  not_ready: "border-muted-foreground/60",
  working: "border-amber-500 bg-[linear-gradient(90deg,var(--color-amber-500)_50%,transparent_50%)]",
  completed: "border-emerald-500 bg-emerald-500",
};

/** Empty, half or full circle for not ready, working and completed. */
export function StatusDot({ status, className }: { status: Status; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2.5 shrink-0 rounded-full border-[1.5px]", DOT[status], className)} />;
}

/** A post's status (it follows its versions), as a dot and a word. */
export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground", className)}>
      <StatusDot status={status} /> {STATUS_LABEL[status]}
    </span>
  );
}

/** Picks a status. */
export function StatusSelect({ value, onChange, label, disabled, size = "default", className }: {
  value: Status; onChange: (s: Status) => void; label: string; disabled?: boolean; size?: "sm" | "default"; className?: string;
}) {
  return (
    <Select value={value} onValueChange={(s) => onChange(s as Status)} disabled={disabled}>
      <SelectTrigger size={size} aria-label={label} className={cn("w-32", className)}><SelectValue /></SelectTrigger>
      <SelectContent>
        {STATUSES.map((s) => <SelectItem key={s} value={s}><StatusDot status={s} /> {STATUS_LABEL[s]}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

/** A saved version's status. Saves straight away (no Save button), then refreshes every list. */
export function VersionStatus({ postId, version: v, size, className }: { postId: number; version: PostVersion; size?: "sm" | "default"; className?: string }) {
  const refresh = useRefresh();
  const [busy, setBusy] = useState(false);
  const set = async (to: Status) => {
    setBusy(true);
    await attempt(async () => {
      await api(`/posts/${postId}/versions/${v.account_id}/status`, { method: "POST", json: { status: to } });
      refresh();
    }, `${v.platform_name} ${v.handle}: ${STATUS_LABEL[to]}`);
    setBusy(false);
  };
  return <StatusSelect value={v.status} onChange={set} disabled={busy} size={size} className={className} label={`${v.platform_name} ${v.handle} status`} />;
}
