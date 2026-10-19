import { toast } from "sonner";

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Run an async action and toast any failure. Returns false if it failed. */
export async function attempt(fn: () => Promise<unknown>, success?: string) {
  try {
    await fn();
    if (success) toast.success(success);
    return true;
  } catch (e) {
    toast.error(errorMessage(e));
    return false;
  }
}
