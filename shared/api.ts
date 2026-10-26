// Shapes of the JSON the API returns. Shared by the Worker and the web app so they can't drift.
import type { Role, Status } from "./rules";

/** The signed-in person. */
export interface Me { id: number; name: string; email: string; avatar_color: string; role: Role }

export interface Person {
  id: number; name: string; avatar_color: string; role: Role; active: number;
  /** 1 once deleted: kept only so finished posts can show their name */
  deleted: number;
  /** only sent to admins */
  email?: string;
}

export interface Platform { id: number; key: string; name: string; char_limit: number | null; color: string; visible: number; sort: number }

/** One platform profile of a brand, e.g. Acme on X. */
export interface Account {
  id: number; brand_id: number; platform_id: number; url: string; handle: string;
  platform_key: string; platform_name: string; platform_color: string; platform_visible: number;
  /** the member who manages this platform profile and posts to it by default */
  manager_id: number | null;
}

/** What people call an "account": a brand or person, with its platform profiles. */
export interface Brand {
  id: number; name: string; timezone: string | null; notes: string | null; active: number;
  accounts: Account[];
}

/** A media link on a version, e.g. "Hero image" → a Drive link. */
export interface MediaLink { url: string; label: string }

/**
 * One version of a post: what goes out on one platform profile, with its own text, media, people,
 * time and status. `account_id` identifies it within the post.
 */
export interface PostVersion {
  account_id: number; handle: string; brand_name: string;
  platform_key: string; platform_name: string; platform_color: string; char_limit: number | null;
  body: string; media: MediaLink[];
  /** who writes it, makes its media, and posts it */
  writer_id: number | null; creative_id: number | null; poster_id: number | null;
  /** null: goes out at the post's time */
  scheduled_at: number | null;
  status: Status;
  posted_url: string | null;
}

/** A kind of post, with starter text for new posts. */
export interface Topic { id: number; name: string; description: string; template: string; sort: number; open_count: number }

export interface PostSummary {
  id: number; title: string; topic_id: number | null; created_by: number | null; comment_count: number;
  /** follows the versions: completed when all are, working once any has started */
  status: Status;
  /** the default time for its versions */
  scheduled_at: number | null;
  versions: PostVersion[];
}

export interface Comment { id: number; author_id: number | null; author_name: string | null; author_color: string | null; body: string; created_at: number }

export interface PostDetail extends PostSummary {
  notes: string | null; version: number; created_at: number; updated_at: number;
  comments: Comment[];
}

/** Sidebar counts: open posts planned today, and the signed-in member's open versions (all, and by job). */
export interface Dashboard { today: number; all: number; content: number; media: number; post: number }
