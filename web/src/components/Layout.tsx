import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useMe } from "../lib/data";
import { addDays, startOfDay } from "../lib/dates";
import type { Dashboard } from "../lib/types";
import { Avatar, ErrorText, Modal } from "./ui";
import { canAdmin, canEditCopy } from "../../../shared/rules";

export function Layout() {
  const me = useMe().data!;
  const qc = useQueryClient();
  const nav = useNavigate();
  const [menu, setMenu] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const today = startOfDay(new Date());
  const dash = useQuery({
    queryKey: ["dashboard", today.getTime()],
    queryFn: () => api<Dashboard>(`/dashboard?from=${today.getTime()}&to=${addDays(today, 1).getTime()}`),
    refetchInterval: 60_000,
  });

  const logout = async () => {
    await api("/auth/logout", { method: "POST" });
    await qc.resetQueries();
  };

  const links: [string, string, number?][] = [
    ["/day", "Day", dash.data?.today],
    ["/week", "Week"],
    ["/board", "Board", dash.data?.review],
    ["/mine", "My work", dash.data?.mine],
  ];
  if (canAdmin(me)) links.push(["/admin", "Admin"]);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-2">
          <span className="mr-2 hidden font-semibold sm:block">📣 Pipeline</span>
          <nav className="flex flex-1 gap-1 overflow-x-auto">
            {links.map(([to, label, count]) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `btn whitespace-nowrap ${isActive ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "btn-ghost"}`
                }
              >
                {label}
                {!!count && <span className="rounded-full bg-indigo-500 px-1.5 text-[10px] text-white">{count}</span>}
              </NavLink>
            ))}
          </nav>
          {canEditCopy(me) && (
            <button className="btn-primary whitespace-nowrap" onClick={() => nav("/posts/new")}>
              + <span className="hidden sm:inline">New post</span>
            </button>
          )}
          <div className="relative">
            <button className="flex items-center gap-2 rounded-full p-0.5" onClick={() => setMenu((m) => !m)}>
              <Avatar person={me} size={32} />
            </button>
            {menu && (
              <div className="card absolute right-0 mt-2 w-56 p-1 shadow-lg" onMouseLeave={() => setMenu(false)}>
                <div className="px-3 py-2">
                  <div className="text-sm font-medium">{me.name}</div>
                  <div className="text-xs text-slate-500">{me.roles.join(", ")}</div>
                </div>
                <button className="btn-ghost w-full justify-start" onClick={() => (setPinOpen(true), setMenu(false))}>Change PIN</button>
                <button className="btn-ghost w-full justify-start" onClick={logout}>Switch profile</button>
              </div>
            )}
          </div>
        </div>
        {!!(dash.data?.overdue || dash.data?.unassigned) && (
          <div className="border-t border-amber-200 bg-amber-50 px-4 py-1.5 text-center text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            {!!dash.data.overdue && <NavLink to="/board?view=overdue" className="underline">{dash.data.overdue} overdue</NavLink>}
            {!!dash.data.overdue && !!dash.data.unassigned && " · "}
            {!!dash.data.unassigned && <NavLink to="/board?view=unassigned" className="underline">{dash.data.unassigned} without a manager</NavLink>}
          </div>
        )}
      </header>
      <main className="mx-auto max-w-7xl px-4 py-5">
        <Outlet />
      </main>
      <ChangePin open={pinOpen} onClose={() => setPinOpen(false)} />
    </div>
  );
}

function ChangePin({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [err, setErr] = useState<unknown>(null);
  const [done, setDone] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    try {
      await api("/me/pin", { method: "POST", json: { current, next } });
      setDone(true);
      setCurrent("");
      setNext("");
    } catch (e) {
      setErr(e);
    }
  };
  return (
    <Modal open={open} onClose={() => (onClose(), setDone(false))} title="Change PIN">
      {done ? (
        <p className="text-sm">PIN updated.</p>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="label">Current PIN</label>
            <input className="input" inputMode="numeric" maxLength={4} type="password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </div>
          <div>
            <label className="label">New PIN</label>
            <input className="input" inputMode="numeric" maxLength={4} type="password" value={next} onChange={(e) => setNext(e.target.value)} />
          </div>
          <ErrorText error={err} />
          <button className="btn-primary">Save</button>
        </form>
      )}
    </Modal>
  );
}
