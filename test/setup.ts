import { applyD1Migrations, env } from "cloudflare:test";

declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1];
      TEST_SEED: string;
    }
  }
}

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
