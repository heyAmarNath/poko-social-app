import type { Role } from "../shared/rules";

export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  ASSETS: Fetcher;
  SESSION_SECRET: string;
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  DEV_BYPASS_EMAIL?: string;
}

export interface Profile {
  id: number;
  name: string;
  avatar_color: string;
  roles: Role[];
  email: string | null;
}

export type AppEnv = {
  Bindings: Env;
  Variables: { accessEmail: string; profile: Profile };
};
