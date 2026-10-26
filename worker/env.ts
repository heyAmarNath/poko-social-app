import type { Role } from "../shared/rules";

export interface Env {
  DB: D1Database;
  SESSION_SECRET: string;
  /** The Google sign-in client (Google Cloud Console → Clients). The secret is a Worker secret. */
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  /** Local development only: lets you sign in as any profile without Google, and only on localhost. */
  DEV_LOGIN?: string;
}

export interface Profile {
  id: number;
  name: string;
  email: string;
  avatar_color: string;
  role: Role;
}

export type AppEnv = {
  Bindings: Env;
  Variables: { profile: Profile };
};
