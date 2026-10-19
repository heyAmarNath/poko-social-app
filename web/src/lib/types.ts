import type { Role, Status } from "../../../shared/rules";

export interface Me { id: number; name: string; avatar_color: string; roles: Role[]; access_email: string }
export interface Person { id: number; name: string; avatar_color: string; roles: Role[]; active: number; email?: string; locked_until?: number | null }
export interface ExtraField { key: string; label: string }
export interface Platform { id: number; key: string; name: string; char_limit: number | null; extra_fields: ExtraField[]; color: string; active: number; sort: number }
export interface Account {
  id: number; platform_id: number; handle: string; display_name: string | null; url: string | null;
  timezone: string | null; notes: string | null; active: number;
  platform_name: string; platform_key: string; platform_color: string;
}
export interface Rule { id: number; account_id: number; role: "manager" | "creative" | "writer"; profile_id: number }
export interface TargetRow {
  id: number; post_id: number; account_id: number; body_override: string | null; extra: string;
  scheduled_at: number | null; manager_id: number | null; status: Status; posted_url: string | null; posted_at: number | null;
  title: string; body: string; writer_id: number | null; creative_id: number | null; copy_due: number | null; media_due: number | null;
  handle: string; display_name: string | null; account_timezone: string | null; platform_id: number;
  platform_name: string; platform_key: string; platform_color: string; char_limit: number | null; attachment_count: number;
}
export interface Attachment { id: number; kind: "file" | "link"; url: string | null; filename: string; mime: string | null; size: number | null; created_at: number }
export interface Comment { id: number; author_id: number; author_name: string; author_color: string; body: string; created_at: number }
export interface HistoryRow { id: number; actor_name: string | null; action: string; detail: string | null; created_at: number }
export interface PostDetail {
  id: number; title: string; body: string; notes: string | null; created_by: number | null;
  writer_id: number | null; creative_id: number | null; copy_due: number | null; media_due: number | null;
  created_at: number; updated_at: number;
  targets: TargetRow[]; attachments: Attachment[]; comments: Comment[]; history: HistoryRow[];
}
export interface Dashboard { today: number; overdue: number; review: number; unassigned: number; mine: number }
