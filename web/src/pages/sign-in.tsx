import { useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FcGoogle } from "react-icons/fc";
import { Megaphone, Wrench } from "lucide-react";
import { api } from "@/lib/api";
import { attempt } from "@/lib/errors";
import type { Me } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { PersonAvatar } from "@/components/people";

/** Why the last Google sign-in didn't work, as the API reports it in ?signin_error=. */
function problem(reason: string | null, email: string | null) {
  if (reason === "not_on_team") return `${email ?? "That Google account"} isn't on the team yet. Ask an admin to add you, then sign in again.`;
  if (reason === "cancelled") return "Sign-in was cancelled.";
  if (reason) return "Sign-in didn't work. Please try again.";
  return null;
}

/** Signed out: sign in with Google. On localhost with DEV_LOGIN set, you can also sign in as anyone. */
export function SignInPage() {
  const [sp] = useSearchParams();
  const options = useQuery({ queryKey: ["auth-options"], queryFn: () => api<{ google: boolean; dev: boolean }>("/auth/options"), retry: false });
  const error = problem(sp.get("signin_error"), sp.get("email"));
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/40 p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mx-auto flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Megaphone className="size-5" /></div>
          <CardTitle className="mt-2 text-xl">Poko Social</CardTitle>
          <CardDescription>Sign in with the Google account your admin added.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{error}</p>}
          {options.isPending ? (
            <Skeleton className="h-10 w-full" />
          ) : options.data?.google ? (
            <Button asChild size="lg" variant="outline" className="w-full">
              <a href="/api/auth/google"><FcGoogle /> Sign in with Google</a>
            </Button>
          ) : (
            <p className="text-center text-sm text-muted-foreground">Google sign-in isn't set up on this deployment yet.</p>
          )}
          {options.data?.dev && <DevSignIn />}
        </CardContent>
      </Card>
    </div>
  );
}

/** Local development only: pick any profile. The API refuses this anywhere but localhost. */
function DevSignIn() {
  const qc = useQueryClient();
  const people = useQuery({ queryKey: ["dev-profiles"], queryFn: () => api<Me[]>("/auth/dev/profiles") });
  const signIn = (id: number) => attempt(async () => {
    await api("/auth/dev", { method: "POST", json: { profile_id: id } });
    await qc.resetQueries();
  });
  return (
    <>
      <Separator />
      <div className="flex flex-col gap-2">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Wrench className="size-3.5" /> Local development: sign in as</p>
        {people.data?.length === 0 && <p className="text-sm text-muted-foreground">No profiles yet. Add one with the SQL in the README.</p>}
        {people.data?.map((p) => (
          <Button key={p.id} variant="ghost" className="h-auto justify-start py-1.5" onClick={() => signIn(p.id)}>
            <PersonAvatar person={p} size="sm" />
            <span className="truncate">{p.name}</span>
            <span className="ml-auto text-xs capitalize text-muted-foreground">{p.role}</span>
          </Button>
        ))}
      </div>
    </>
  );
}
