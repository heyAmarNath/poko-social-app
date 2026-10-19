// Shared domain rules used by both the Worker API and the web UI.

export const ROLES = ["admin", "manager", "writer", "creative"] as const;
export type Role = (typeof ROLES)[number];

export const STATUSES = [
  "not_ready",
  "working",
  "waiting_review",
  "changes_requested",
  "scheduled",
  "posted",
  "cancelled",
] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<Status, string> = {
  not_ready: "Not ready",
  working: "Working",
  waiting_review: "Waiting for review",
  changes_requested: "Changes requested",
  scheduled: "Scheduled",
  posted: "Posted",
  cancelled: "Cancelled",
};

/** Which statuses each status may move to. */
export const TRANSITIONS: Record<Status, Status[]> = {
  not_ready: ["working", "waiting_review", "cancelled"],
  working: ["not_ready", "waiting_review", "cancelled"],
  waiting_review: ["working", "changes_requested", "scheduled", "cancelled"],
  changes_requested: ["working", "waiting_review", "cancelled"],
  scheduled: ["posted", "changes_requested", "waiting_review", "cancelled"],
  posted: ["scheduled"],
  cancelled: ["not_ready"],
};

/** Statuses only a manager (or admin) may set. */
export const MANAGER_ONLY: Status[] = ["changes_requested", "scheduled", "posted", "cancelled"];

export interface Actor {
  id: number;
  roles: Role[];
}

export const hasRole = (a: Actor, ...roles: Role[]) => roles.some((r) => a.roles.includes(r));

/**
 * Can `actor` move a target from `from` to `to`?
 * Managers may only act on targets they manage, or unassigned ones.
 */
export function canTransition(
  actor: Actor,
  from: Status,
  to: Status,
  targetManagerId: number | null,
): { ok: true } | { ok: false; reason: string } {
  if (!TRANSITIONS[from].includes(to)) {
    return { ok: false, reason: `Cannot go from ${STATUS_LABEL[from]} to ${STATUS_LABEL[to]}` };
  }
  if (hasRole(actor, "admin")) return { ok: true };
  if (MANAGER_ONLY.includes(to) || from === "posted" || from === "cancelled") {
    if (!hasRole(actor, "manager")) return { ok: false, reason: "Only a manager can set this status" };
    if (targetManagerId != null && targetManagerId !== actor.id) {
      return { ok: false, reason: "Only the assigned manager can set this status" };
    }
    return { ok: true };
  }
  if (to === "waiting_review") return { ok: true };
  if (hasRole(actor, "manager", "writer")) return { ok: true };
  return { ok: false, reason: "Your role cannot set this status" };
}

export const canEditCopy = (a: Actor) => hasRole(a, "admin", "manager", "writer");
export const canAssign = (a: Actor) => hasRole(a, "admin", "manager");
export const canAdmin = (a: Actor) => hasRole(a, "admin");

/** Rank used to derive one overall status from many targets (lowest wins). */
const RANK: Status[] = ["not_ready", "working", "changes_requested", "waiting_review", "scheduled", "posted"];
export function overallStatus(statuses: Status[]): Status {
  const live = statuses.filter((s) => s !== "cancelled");
  if (live.length === 0) return statuses.length ? "cancelled" : "not_ready";
  return live.reduce((lo, s) => (RANK.indexOf(s) < RANK.indexOf(lo) ? s : lo));
}

export const MAX_UPLOAD_BYTES = 95 * 1024 * 1024; // stays under the 100 MB Worker request limit
