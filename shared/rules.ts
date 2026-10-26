// Shared domain rules used by both the Worker API and the web UI.

/** Everyone does content work; admins also manage people, accounts, topics and platforms. */
export const ROLES = ["admin", "member"] as const;
export type Role = (typeof ROLES)[number];

/**
 * Each version of a post moves from not ready, to working, to completed (posted or dropped).
 * The post's status follows its versions: completed when all are, working once any has started.
 */
export const STATUSES = ["not_ready", "working", "completed"] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<Status, string> = { not_ready: "Not ready", working: "Working", completed: "Completed" };

/** A version's media: links to images or videos kept elsewhere (Drive, Dropbox…). */
export const MAX_MEDIA_LINKS = 20;

export const isAdmin = (a: { role: Role }) => a.role === "admin";
