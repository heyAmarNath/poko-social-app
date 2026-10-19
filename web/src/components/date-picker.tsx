import { useState } from "react";
import { CalendarIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
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

const timeOf = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/**
 * Date + time picker. Changes are committed when the popover closes, so editing the
 * date and then the time saves once.
 */
export function DateTimePicker({
  value, onChange, placeholder = "Pick a date & time", disabled, className, defaultTime = "10:00",
}: { value: number | null; onChange: (ms: number | null) => void; placeholder?: string; disabled?: boolean; className?: string; defaultTime?: string }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<number | null>(value);
  const shown = open ? draft : value;

  const setDate = (d: Date | undefined) => {
    if (!d) return;
    const [h, m] = (draft ? timeOf(draft) : defaultTime).split(":").map(Number);
    d.setHours(h, m, 0, 0);
    setDraft(d.getTime());
  };
  const setTime = (t: string) => {
    if (!t) return;
    const d = new Date(draft ?? Date.now());
    const [h, m] = t.split(":").map(Number);
    d.setHours(h, m, 0, 0);
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
          <Calendar mode="single" selected={draft ? new Date(draft) : undefined} defaultMonth={draft ? new Date(draft) : undefined} onSelect={setDate} />
          <div className="flex items-center gap-2 border-t p-3">
            <Input type="time" className="w-32" value={draft ? timeOf(draft) : ""} onChange={(e) => setTime(e.target.value)} />
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
