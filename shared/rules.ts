// Shared domain rules used by both the Worker API and the web UI.

/** Admins only administer (people, accounts, platforms). Members do all content work. */
export const ROLES = ["admin", "member"] as const;
export type Role = (typeof ROLES)[number];

/** A deliberately simple flow: not ready -> working -> scheduled -> posted, or cancelled. */
export const STATUSES = ["not_ready", "working", "scheduled", "posted", "cancelled"] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<Status, string> = {
  not_ready: "Not ready",
  working: "Working",
  scheduled: "Scheduled",
  posted: "Posted",
  cancelled: "Cancelled",
};

/** Any status can move to any other: there is no review gate. */
export const TRANSITIONS: Record<Status, Status[]> = Object.fromEntries(
  STATUSES.map((s) => [s, STATUSES.filter((t) => t !== s)]),
) as Record<Status, Status[]>;

export const OPEN_STATUSES: Status[] = ["not_ready", "working", "scheduled"];

export function canTransition(from: Status, to: Status): { ok: true } | { ok: false; reason: string } {
  if (!STATUSES.includes(to)) return { ok: false, reason: "Unknown status" };
  if (from === to) return { ok: false, reason: `Already ${STATUS_LABEL[to]}` };
  return { ok: true };
}

export const isAdmin = (a: { role: Role }) => a.role === "admin";
export const isMember = (a: { role: Role }) => a.role === "member";

/** Rank used to derive one overall status from many targets (lowest wins). */
const RANK: Status[] = ["not_ready", "working", "scheduled", "posted"];
export function overallStatus(statuses: Status[]): Status {
  const live = statuses.filter((s) => s !== "cancelled");
  if (live.length === 0) return statuses.length ? "cancelled" : "not_ready";
  return live.reduce((lo, s) => (RANK.indexOf(s) < RANK.indexOf(lo) ? s : lo));
}

export const MAX_UPLOAD_BYTES = 95 * 1024 * 1024; // stays under the 100 MB Worker request limit
