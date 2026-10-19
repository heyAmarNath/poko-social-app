import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Avatar } from "../components/ui";

type Tile = { id: number; name: string; avatar_color: string };

export function ProfileSwitcher() {
  const qc = useQueryClient();
  const profiles = useQuery({ queryKey: ["public-profiles"], queryFn: () => api<Tile[]>("/profiles/public"), retry: false });
  const [picked, setPicked] = useState<Tile | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (pin.length !== 4 || !picked) return;
    setBusy(true);
    api("/auth/pin", { method: "POST", json: { profile_id: picked.id, pin } })
      .then(() => qc.resetQueries())
      .catch((e) => {
        setError(e.message);
        setPin("");
      })
      .finally(() => setBusy(false));
  }, [pin, picked, qc]);

  useEffect(() => {
    if (!picked) return;
    const h = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) setPin((p) => (p.length < 4 ? p + e.key : p));
      else if (e.key === "Backspace") setPin((p) => p.slice(0, -1));
      else if (e.key === "Escape") (setPicked(null), setPin(""), setError(""));
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [picked]);

  if (profiles.isError)
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center">
        <div>
          <h1 className="text-xl font-semibold">Can't reach the app</h1>
          <p className="mt-2 text-sm text-slate-500">{(profiles.error as Error).message}</p>
        </div>
      </div>
    );

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-900 p-6 text-white">
      {!picked ? (
        <>
          <h1 className="mb-10 text-3xl font-semibold">Who's working?</h1>
          <div className="flex max-w-3xl flex-wrap justify-center gap-6">
            {profiles.data?.map((p) => (
              <button key={p.id} onClick={() => setPicked(p)} className="group flex w-28 flex-col items-center gap-3">
                <span className="rounded-2xl ring-white/80 transition group-hover:ring-4 group-focus-visible:ring-4">
                  <Avatar person={p} size={104} />
                </span>
                <span className="text-sm text-slate-300 group-hover:text-white">{p.name}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center">
          <Avatar person={picked} size={80} />
          <p className="mt-3 text-lg">{picked.name}</p>
          <p className="mt-6 text-sm text-slate-400">Enter your PIN</p>
          <div className="mt-3 flex gap-3">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={`h-4 w-4 rounded-full border-2 border-white ${pin.length > i ? "bg-white" : ""}`} />
            ))}
          </div>
          <p className="mt-3 h-5 text-sm text-rose-300">{error}</p>
          <div className="mt-4 grid grid-cols-3 gap-3">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((k, i) =>
              k === "" ? (
                <span key={i} />
              ) : (
                <button
                  key={i}
                  disabled={busy}
                  onClick={() => {
                    setError("");
                    setPin((p) => (k === "⌫" ? p.slice(0, -1) : p.length < 4 ? p + k : p));
                  }}
                  className="h-16 w-16 rounded-full bg-white/10 text-xl font-medium hover:bg-white/20 active:bg-white/30"
                >
                  {k}
                </button>
              ),
            )}
          </div>
          <button className="mt-8 text-sm text-slate-400 hover:text-white" onClick={() => (setPicked(null), setPin(""), setError(""))}>
            ← Back to profiles
          </button>
        </div>
      )}
    </div>
  );
}
