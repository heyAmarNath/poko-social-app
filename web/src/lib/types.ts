// The API's shapes live in shared/api.ts, used by the Worker too, so the two can't drift.
export type {
  Account, Brand, Comment, Dashboard, MediaLink, Me, Person, Platform, PostDetail, PostSummary, PostVersion, Topic,
} from "../../../shared/api";
