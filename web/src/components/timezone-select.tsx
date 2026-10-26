import { useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export function TimezoneSelect({ value, onChange, allowNone }: { value: string; onChange: (tz: string) => void; allowNone?: boolean }) {
  // The browser's list leaves out "UTC" and some aliases browsers still report (e.g. Asia/Calcutta),
  // so always include those and the current value.
  const zones = useMemo(() => [...new Set(["UTC", ...(value ? [value] : []), browserTimeZone(), ...Intl.supportedValuesOf("timeZone")])], [value]);
  return (
    <Select value={value || "__none"} onValueChange={(v) => onChange(v === "__none" ? "" : v)}>
      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
      <SelectContent className="max-h-72">
        {allowNone && <SelectItem value="__none"><span className="text-muted-foreground">Not set</span></SelectItem>}
        {zones.map((z) => <SelectItem key={z} value={z}>{z.replaceAll("_", " ")}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
