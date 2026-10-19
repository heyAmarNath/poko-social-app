import { cn } from "@/lib/utils";

export function PlatformDot({ color, className }: { color: string; className?: string }) {
  return <span className={cn("size-2.5 shrink-0 rounded-full ring-1 ring-foreground/20", className)} style={{ background: color }} />;
}

export function PlatformLabel({ color, name, detail, className }: { color: string; name: string; detail?: string; className?: string }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5 text-sm", className)}>
      <PlatformDot color={color} />
      <span className="font-medium">{name}</span>
      {detail && <span className="truncate text-muted-foreground">{detail}</span>}
    </span>
  );
}
