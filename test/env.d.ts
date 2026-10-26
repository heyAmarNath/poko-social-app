/// <reference types="@cloudflare/vitest-plugin/types" />
import type { Env as WorkerEnv } from "../worker/env";

declare global {
  namespace Cloudflare {
    interface Env extends WorkerEnv {}
  }
}
