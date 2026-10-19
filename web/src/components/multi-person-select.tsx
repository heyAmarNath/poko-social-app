import { useState } from "react";
import { Check, ChevronsUpDown, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Person } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PersonAvatar } from "@/components/people";

/**
 * Pick any number of people. `value === undefined` means the selection is mixed
 * (e.g. differs across platforms); picking anyone replaces it for all.
 */
export function MultiPersonSelect({
  people, value, onChange, placeholder = "No managers", className, compact, disabled, label,
}: {
  people: Person[]; value: number[] | undefined; onChange: (ids: number[]) => void; placeholder?: string; className?: string;
  /** Avatars only, for tight spaces like table rows. */
  compact?: boolean; disabled?: boolean; label?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = people.filter((p) => value?.includes(p.id));
  const toggle = (id: number) => {
    const cur = value ?? [];
    onChange(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} aria-label={label} disabled={disabled}
          className={cn("h-auto min-h-8 w-full justify-between py-1 font-normal", className)}>
          {value === undefined ? (
            <span className="text-muted-foreground">Mixed across platforms</span>
          ) : compact && selected.length > 0 ? (
            <span className="flex min-w-0 items-center gap-1.5" title={selected.map((p) => p.name).join(", ")}>
              <span className="flex -space-x-1">{selected.slice(0, 3).map((p) => <PersonAvatar key={p.id} person={p} size="sm" className="ring-2 ring-background" />)}</span>
              <span className="truncate text-xs">{selected.length === 1 ? selected[0].name.split(" ")[0] : `${selected.length} people`}</span>
            </span>
          ) : selected.length === 0 ? (
            <span className="flex items-center gap-1.5 text-muted-foreground"><UserPlus /> {placeholder}</span>
          ) : (
            <span className="flex min-w-0 flex-wrap items-center gap-1.5">
              {selected.map((p) => (
                <span key={p.id} className="inline-flex items-center gap-1 rounded-full bg-muted py-0.5 pr-2 pl-0.5 text-xs">
                  <PersonAvatar person={p} size="sm" />{p.name}
                </span>
              ))}
            </span>
          )}
          <ChevronsUpDown className="ml-1 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search people…" />
          <CommandList>
            <CommandEmpty>No members found.</CommandEmpty>
            <CommandGroup>
              {people.map((p) => {
                const on = !!value?.includes(p.id);
                return (
                  <CommandItem key={p.id} value={p.name} onSelect={() => toggle(p.id)}>
                    <PersonAvatar person={p} size="sm" />
                    {p.name}
                    <Check className={cn("ml-auto", on ? "opacity-100" : "opacity-0")} />
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
