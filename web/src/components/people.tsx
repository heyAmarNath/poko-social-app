import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Person } from "@/lib/types";

const TEXT = { sm: "group-data-[size=sm]/avatar:text-[9px]", default: "text-xs", lg: "text-sm" } as const;
const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

export function PersonAvatar({
  person, size = "default", label, className,
}: { person?: Pick<Person, "name" | "avatar_color"> | null; size?: "sm" | "default" | "lg"; label?: string; className?: string }) {
  const avatar = (
    <Avatar size={size} className={className}>
      {person ? (
        <AvatarFallback className={cn("font-medium text-white", TEXT[size])} style={{ background: person.avatar_color }}>{initials(person.name)}</AvatarFallback>
      ) : (
        <AvatarFallback className={cn("border border-dashed border-muted-foreground/50 bg-background text-muted-foreground", TEXT[size])}>?</AvatarFallback>
      )}
    </Avatar>
  );
  if (!label) return avatar;
  return (
    <Tooltip>
      <TooltipTrigger asChild><span className="inline-flex">{avatar}</span></TooltipTrigger>
      <TooltipContent>{label}: {person?.name ?? "Unassigned"}</TooltipContent>
    </Tooltip>
  );
}

const NONE = "__none";

export function PersonSelect({
  value, onChange, people, placeholder = "Unassigned", disabled, className,
}: { value: number | null | undefined; onChange: (v: number | null) => void; people: Person[]; placeholder?: string; disabled?: boolean; className?: string }) {
  return (
    <Select value={value === undefined ? "" : value ? String(value) : NONE} onValueChange={(v) => onChange(v === NONE ? null : Number(v))} disabled={disabled}>
      <SelectTrigger className={cn("w-full", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}><span className="text-muted-foreground">{placeholder}</span></SelectItem>
        {people.map((p) => (
          <SelectItem key={p.id} value={String(p.id)}>
            <PersonAvatar person={p} size="sm" />
            {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
