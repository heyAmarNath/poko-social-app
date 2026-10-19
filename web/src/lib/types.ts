import type { Role, Status } from "../../../shared/rules";


export interface Me { id: number; name: string; avatar_color: string; role: Role; access_email: string }
export interface Person { id: number; name: string; avatar_color: string; role: Role; active: number; email?: string | null; locked_until?: number | null }
export interface ExtraField { key: string; label: string }
export interface Platform { id: number; key: string; name: string; char_limit: number | null; extra_fields: ExtraField[]; color: string; visible: number; sort: number }
export interface Account {
  id: number; platform_id: number; handle: string; display_name: string | null; url: string | null;
  timezone: string | null; notes: string | null; active: number; avatar_key: string | null;
  platform_name: string; platform_key: string; platform_color: string; platform_visible: number;
}
export interface Handler { account_id: number; profile_id: number }
/** What members see when starting a post from a template. */
export interface TemplateSummary {
  id: number; title: string; body: string; notes: string | null; weekdays: number[]; time: string; timezone: string;
  writer_id: number | null; creative_id: number | null; account_ids: number[];
}
export interface Template {
  id: number; title: string; body: string; notes: string | null; weekdays: number[]; time: string; timezone: string;
  starts_on: string; ends_on: string | null; writer_id: number | null; creative_id: number | null; active: number;
  account_ids: number[]; post_count: number; created_at: number; updated_at: number;
}
export interface TargetRow {
  id: number; post_id: number; account_id: number; body_override: string | null; extra: string;
  scheduled_at: number | null; manager_id: number | null; status: Status; posted_url: string | null; posted_at: number | null;
  title: string; body: string; writer_id: number | null; creative_id: number | null; copy_due: number | null; media_due: number | null; template_id: number | null;
  handle: string; display_name: string | null; account_timezone: string | null; platform_id: number;
  platform_name: string; platform_key: string; platform_color: string; char_limit: number | null; attachment_count: number;
}
export interface Attachment { id: number; kind: "file" | "link"; url: string | null; filename: string; mime: string | null; size: number | null; created_at: number }
export interface Comment { id: number; author_id: number; author_name: string; author_color: string; body: string; created_at: number }
export interface PostDetail {
  id: number; title: string; body: string; notes: string | null; created_by: number | null;
  writer_id: number | null; creative_id: number | null; copy_due: number | null; media_due: number | null;
  created_at: number; updated_at: number;
  targets: TargetRow[]; attachments: Attachment[]; comments: Comment[];
  template_id: number | null; template_title: string | null;
}
export interface Dashboard { today: number; overdue: number; unassigned: number; mine: number }
