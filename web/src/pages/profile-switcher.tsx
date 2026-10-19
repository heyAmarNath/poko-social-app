import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Lock, Megaphone, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
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
        <span className="font-medium text-foreground">Poko Social</span>
      </div>

      {!picked ? (
        <div className="flex w-full max-w-4xl flex-col items-center text-center">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">Who's working?</h1>
          <p className="mt-2 text-sm text-muted-foreground">Pick your profile to continue.</p>
          <div className="mt-6 w-full">
            {profiles.isPending ? (
              <div className="flex justify-center py-16"><Skeleton className="size-28 rounded-2xl" /></div>
            ) : (
              <ProfileRing profiles={profiles.data} onPick={setPicked} />
            )}
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

const initialsOf = (name: string) => name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

// Each profile is treated as a circle big enough for its tile and name.
const NODE = 128; // ring profile: 80px tile + name
const CENTER = 184; // admin: 112px tile + name + badge
const GAP = 20; // clear space between any two profiles
const MIN_R = CENTER / 2 + NODE / 2 + GAP; // ring never touches the admin

/**
 * Admin in the centre, everyone else evenly spaced on a circle around it.
 * The radius grows with the number of people so tiles never overlap,
 * and the whole figure scales down to fit narrow or short screens.
 */
function ProfileRing({ profiles, onPick }: { profiles: Tile[]; onPick: (t: Tile) => void }) {
  const center = profiles.find((p) => p.role === "admin") ?? null;
  const ring = profiles.filter((p) => p !== center);
  const n = ring.length;
  // Neighbours on the ring are a chord apart: 2r·sin(π/n) must fit one profile plus a gap.
  const r = n <= 1 ? MIN_R : Math.max(MIN_R, (NODE + GAP) / (2 * Math.sin(Math.PI / n)));
  const box = 2 * r + NODE;

  const wrap = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const fit = () => {
      const w = wrap.current?.clientWidth ?? box;
      const h = window.innerHeight - 220;
      setScale(Math.min(1, w / box, Math.max(h, 280) / box));
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (wrap.current) ro.observe(wrap.current);
    window.addEventListener("resize", fit);
    return () => (ro.disconnect(), window.removeEventListener("resize", fit));
  }, [box]);

  // Gentle staggered entrance.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(t);
  }, []);

  return (
    <div ref={wrap} className="flex w-full justify-center overflow-hidden" style={{ height: box * scale }}>
      <div className="relative shrink-0 origin-top" style={{ width: box, height: box, transform: `scale(${scale})` }}>
        {/* orbit */}
        <div className="absolute rounded-full border border-dashed border-border" style={{ inset: box / 2 - r, }} />
        <div className="absolute rounded-full bg-[radial-gradient(circle,var(--color-primary)_0%,transparent_70%)] opacity-[0.06]" style={{ inset: box / 2 - r * 0.75 }} />
        {ring.map((p, i) => {
          const a = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(n, 1);
          const x = box / 2 + r * Math.cos(a);
          const y = box / 2 + r * Math.sin(a);
          return (
            <div key={p.id} className="absolute" style={{ left: x, top: y, transform: "translate(-50%, -50%)" }}>
              <ProfileTile
                profile={p}
                onPick={onPick}
                className={cn("transition-all duration-500 ease-out", shown ? "scale-100 opacity-100" : "scale-75 opacity-0")}
                style={{ transitionDelay: `${80 + i * 45}ms` }}
              />
            </div>
          );
        })}
        {center && (
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <ProfileTile profile={center} onPick={onPick} big className={cn("transition-all duration-500", shown ? "scale-100 opacity-100" : "scale-90 opacity-0")} />
          </div>
        )}
      </div>
    </div>
  );
}

function ProfileTile({ profile: p, onPick, big, className, style }: { profile: Tile; onPick: (t: Tile) => void; big?: boolean; className?: string; style?: React.CSSProperties }) {
  return (
    <button
      onClick={() => onPick(p)}
      style={style}
      className={cn("group flex w-28 flex-col items-center gap-2.5 rounded-2xl p-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
    >
      <span
        className={cn(
          "flex items-center justify-center rounded-2xl font-semibold text-white shadow-sm transition group-hover:scale-105 group-hover:shadow-md",
          big ? "size-28 text-4xl ring-4 ring-background outline-2 outline-offset-4 outline-border" : "size-20 text-2xl",
        )}
        style={{ background: p.avatar_color }}
      >
        {initialsOf(p.name)}
      </span>
      <span className="max-w-full truncate text-sm font-medium">{p.name}</span>
      {p.role === "admin" && <Badge variant="secondary" className="-mt-1.5"><ShieldCheck /> Admin</Badge>}
    </button>
  );
}
