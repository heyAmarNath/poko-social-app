// Weekday + timezone helpers for recurring templates. Pure functions, used by Worker and UI.

/** ISO weekdays: 1 = Monday ... 7 = Sunday. */
export const WEEKDAYS = [
  { n: 1, short: "Mon", long: "Monday" },
  { n: 2, short: "Tue", long: "Tuesday" },
  { n: 3, short: "Wed", long: "Wednesday" },
  { n: 4, short: "Thu", long: "Thursday" },
  { n: 5, short: "Fri", long: "Friday" },
  { n: 6, short: "Sat", long: "Saturday" },
  { n: 7, short: "Sun", long: "Sunday" },
] as const;

/** How many days ahead template posts are created. */
export const TEMPLATE_HORIZON_DAYS = 14;

export const isYmd = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
export const isHhmm = (s: unknown): s is string => typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

export function isTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Calendar parts of an instant as seen in a timezone. */
function partsIn(ms: number, tz: string) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second };
}

/** Today's date (YYYY-MM-DD) in a timezone. */
export function todayIn(tz: string, now = Date.now()) {
  const p = partsIn(now, tz);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

export function addDaysYmd(ymd: string, n: number) {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function isoWeekday(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1;
}

/** Epoch ms for a wall-clock date and time in a timezone. Handles DST shifts. */
export function zonedToEpoch(ymd: string, hhmm: string, tz: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  const wanted = Date.UTC(y, m - 1, d, h, mi);
  let guess = wanted;
  for (let i = 0; i < 2; i++) {
    const p = partsIn(guess, tz);
    const seen = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
    guess += wanted - seen;
  }
  return guess;
}

export interface Schedule {
  weekdays: number[];
  time: string;
  timezone: string;
  starts_on: string;
  ends_on: string | null;
}

/** Dates (YYYY-MM-DD) a schedule runs on, from `from` for `days` days. */
export function runDates(s: Schedule, from: string, days: number) {
  const out: string[] = [];
  for (let i = 0; i < days; i++) {
    const day = addDaysYmd(from, i);
    if (day < s.starts_on) continue;
    if (s.ends_on && day > s.ends_on) break;
    if (s.weekdays.includes(isoWeekday(day))) out.push(day);
  }
  return out;
}

/** "Every weekday at 10:00", "Mon, Wed and Fri at 09:30"… */
export function describeSchedule(weekdays: number[], time: string) {
  const set = [...new Set(weekdays)].sort();
  const key = set.join("");
  const when =
    key === "1234567" ? "Every day" :
    key === "12345" ? "Every weekday" :
    key === "67" ? "Every weekend" :
    set.length === 0 ? "Never" :
    (() => {
      const names = set.map((n) => WEEKDAYS[n - 1].short);
      return names.length === 1 ? `Every ${WEEKDAYS[set[0] - 1].long}` : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
    })();
  return `${when} at ${time}`;
}
