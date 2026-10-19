export const DAY = 86_400_000;

export function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
export function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
export const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export function parseYmd(s: string | null | undefined) {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return startOfDay(new Date());
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
export const fmtDay = (d: Date, opts: Intl.DateTimeFormatOptions = { weekday: "long", month: "long", day: "numeric" }) =>
  d.toLocaleDateString([], opts);
export const fmtDateTime = (ms: number) =>
  new Date(ms).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

/** <input type="datetime-local"> value <-> epoch ms, in the browser's local timezone. */
export function toLocalInput(ms: number | null | undefined) {
  if (!ms) return "";
  const d = new Date(ms);
  return `${ymd(d)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
export const fromLocalInput = (v: string) => (v ? new Date(v).getTime() : null);

/** How the time looks in the account's own timezone, if different from ours. */
export function inZone(ms: number, tz: string | null) {
  if (!tz) return null;
  try {
    const mine = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz === mine) return null;
    return new Date(ms).toLocaleString([], { timeZone: tz, hour: "2-digit", minute: "2-digit", weekday: "short" }) + ` ${tz}`;
  } catch {
    return null;
  }
}
