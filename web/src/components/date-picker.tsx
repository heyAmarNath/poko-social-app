import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fmtDateTime, fmtDay } from "@/lib/dates";

export function DatePicker({ value, onChange, className }: { value: Date; onChange: (d: Date) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("justify-start font-normal", className)}>
          <CalendarIcon className="text-muted-foreground" />
          {fmtDay(value, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={value} defaultMonth={value} onSelect={(d) => d && (onChange(d), setOpen(false))} />
      </PopoverContent>
    </Popover>
  );
}

/** The times of day the picker offers: every 15 minutes (plus the chosen one, if it's in between). */
const STEP_MINUTES = 15;
const minutesOf = (ms: number) => {
  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
};
const fmtClock = (minutes: number) =>
  new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/**
 * Date + time picker: the calendar with the times of day beside it. Changes are committed when the
 * popover closes, so picking a day and then a time saves once.
 */
export function DateTimePicker({
  value, onChange, placeholder = "Pick a date & time", disabled, className, defaultTime = "10:00",
}: { value: number | null; onChange: (ms: number | null) => void; placeholder?: string; disabled?: boolean; className?: string; defaultTime?: string }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<number | null>(value);
  const shown = open ? draft : value;
  const [dh, dm] = defaultTime.split(":").map(Number);
  const defaultMinutes = dh * 60 + dm;

  /** A day keeps the chosen time (or the default one). */
  const setDate = (d: Date | undefined) => {
    if (!d) return;
    const m = draft === null ? defaultMinutes : minutesOf(draft);
    d.setHours(Math.floor(m / 60), m % 60, 0, 0);
    setDraft(d.getTime());
  };
  /** A time goes on the chosen day (or today). */
  const setTime = (m: number) => {
    const d = new Date(draft ?? Date.now());
    d.setHours(Math.floor(m / 60), m % 60, 0, 0);
    setDraft(d.getTime());
  };

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Popover
        open={open}
        onOpenChange={(o) => {
          if (o) setDraft(value);
          else if (draft !== value) onChange(draft);
          setOpen(o);
        }}
      >
        <PopoverTrigger asChild>
          <Button variant="outline" disabled={disabled} className={cn("flex-1 justify-start font-normal", !shown && "text-muted-foreground")}>
            <CalendarIcon className="text-muted-foreground" />
            {shown ? fmtDateTime(shown) : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <div className="flex max-[359px]:flex-col">
            <Calendar mode="single" selected={draft ? new Date(draft) : undefined} defaultMonth={draft ? new Date(draft) : undefined} onSelect={setDate} />
            <TimeList selected={draft === null ? null : minutesOf(draft)} fallback={defaultMinutes} onPick={setTime} />
          </div>
          <div className="flex items-center gap-2 border-t py-2 pr-2 pl-3">
            <span className="text-sm tabular-nums text-muted-foreground">{draft ? fmtDateTime(draft) : "Pick a day and a time"}</span>
            <Button size="sm" className="ml-auto" onClick={() => (draft !== value && onChange(draft), setOpen(false))}>Done</Button>
          </div>
        </PopoverContent>
      </Popover>
      {value && !disabled && (
        <Button variant="ghost" size="icon" aria-label="Clear" onClick={() => onChange(null)}>
          <X />
        </Button>
      )}
    </div>
  );
}

/** The times of day as a scrolling column as tall as the calendar, opened at the chosen (or default) time. */
function TimeList({ selected, fallback, onPick }: { selected: number | null; fallback: number; onPick: (minutes: number) => void }) {
  const list = useRef<HTMLDivElement>(null);
  const start = useRef(selected ?? fallback);
  const times = useMemo(() => {
    const all = Array.from({ length: (24 * 60) / STEP_MINUTES }, (_, i) => i * STEP_MINUTES);
    return selected === null || all.includes(selected) ? all : [...all, selected].toSorted((a, b) => a - b);
  }, [selected]);
  useEffect(() => {
    const el = list.current?.querySelector<HTMLElement>(`[data-minutes="${start.current}"]`);
    if (el && list.current) list.current.scrollTop = el.offsetTop - list.current.clientHeight / 2 + el.clientHeight / 2;
  }, []);
  return (
    <div className="relative w-24 border-l max-[359px]:h-40 max-[359px]:w-auto max-[359px]:border-t max-[359px]:border-l-0">
      <div ref={list} role="group" aria-label="Time" className="absolute inset-0 flex flex-col gap-0.5 overflow-y-auto p-1">
        {times.map((m) => (
          <Button key={m} type="button" size="sm" variant={m === selected ? "default" : "ghost"} aria-pressed={m === selected} data-minutes={m}
            className="w-full shrink-0 font-normal tabular-nums" onClick={() => onPick(m)}>
            {fmtClock(m)}
          </Button>
        ))}
      </div>
    </div>
  );
}
