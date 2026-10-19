// Shared domain rules used by both the Worker API and the web UI.

/** Admins only administer (people, accounts, platforms). Members do all content work. */
export const ROLES = ["admin", "member"] as const;
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

export const OPEN_STATUSES: Status[] = ["not_ready", "working", "waiting_review", "changes_requested", "scheduled"];

export function canTransition(from: Status, to: Status): { ok: true } | { ok: false; reason: string } {
  if (!TRANSITIONS[from].includes(to)) {
    return { ok: false, reason: `Cannot go from ${STATUS_LABEL[from]} to ${STATUS_LABEL[to]}` };
  }
  return { ok: true };
}

export const isAdmin = (a: { role: Role }) => a.role === "admin";
export const isMember = (a: { role: Role }) => a.role === "member";

/** Rank used to derive one overall status from many targets (lowest wins). */
const RANK: Status[] = ["not_ready", "working", "changes_requested", "waiting_review", "scheduled", "posted"];
export function overallStatus(statuses: Status[]): Status {
  const live = statuses.filter((s) => s !== "cancelled");
  if (live.length === 0) return statuses.length ? "cancelled" : "not_ready";
  return live.reduce((lo, s) => (RANK.indexOf(s) < RANK.indexOf(lo) ? s : lo));
}

export const MAX_UPLOAD_BYTES = 95 * 1024 * 1024; // stays under the 100 MB Worker request limit
