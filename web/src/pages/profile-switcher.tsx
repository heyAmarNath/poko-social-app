import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Lock, Megaphone, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { PersonAvatar } from "@/components/people";
import { PinInput } from "@/components/pin-input";
import type { Role } from "../../../shared/rules";

type Tile = { id: number; name: string; avatar_color: string; role: Role };

export function ProfileSwitcher() {
  const qc = useQueryClient();
  const profiles = useQuery({ queryKey: ["public-profiles"], queryFn: () => api<Tile[]>("/profiles/public"), retry: false });
  const [picked, setPicked] = useState<Tile | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (value: string) => {
    if (!picked) return;
    setBusy(true);
    setError("");
    try {
      await api("/auth/pin", { method: "POST", json: { profile_id: picked.id, pin: value } });
      await qc.resetQueries();
    } catch (e) {
      setError(errorMessage(e));
      setPin("");
      setBusy(false);
    }
  };
  const back = () => (setPicked(null), setPin(""), setError(""));

  if (profiles.isError)
    return (
      <div className="flex min-h-svh items-center justify-center p-6">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><Lock /></EmptyMedia>
            <EmptyTitle>Can't reach the app</EmptyTitle>
            <EmptyDescription>{errorMessage(profiles.error)}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-muted/40 p-6">
      <div className="mb-10 flex items-center gap-2 text-muted-foreground">
        <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground"><Megaphone className="size-4" /></div>
        <span className="font-medium text-foreground">Social Pipeline</span>
      </div>

      {!picked ? (
        <div className="w-full max-w-3xl text-center">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">Who's working?</h1>
          <p className="mt-2 text-sm text-muted-foreground">Pick your profile to continue.</p>
          <div className="mt-10 flex flex-wrap justify-center gap-6">
            {profiles.isPending
              ? [0, 1, 2].map((i) => <Skeleton key={i} className="size-28 rounded-2xl" />)
              : profiles.data.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPicked(p)}
                    className="group flex w-28 flex-col items-center gap-3 rounded-2xl p-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span
                      className="flex size-24 items-center justify-center rounded-2xl text-3xl font-semibold text-white shadow-sm transition group-hover:scale-105 group-hover:shadow-md"
                      style={{ background: p.avatar_color }}
                    >
                      {p.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
                    </span>
                    <span className="text-sm font-medium">{p.name}</span>
                    {p.role === "admin" && <Badge variant="secondary" className="-mt-2"><ShieldCheck /> Admin</Badge>}
                  </button>
                ))}
          </div>
        </div>
      ) : (
        <Card className="w-full max-w-sm">
          <CardHeader className="items-center text-center">
            <div className="mx-auto"><PersonAvatar person={picked} size="lg" /></div>
            <CardTitle className="mt-2">{picked.name}</CardTitle>
            <CardDescription>Enter your 4-digit PIN</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <PinInput value={pin} onChange={(v) => (setPin(v), setError(""))} onComplete={submit} autoFocus disabled={busy} size="lg" />
            <p className="h-5 text-sm text-destructive" role="alert">{error}</p>
            <Button variant="ghost" size="sm" onClick={back}><ArrowLeft /> Choose another profile</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
