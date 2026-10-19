import { useState } from "react";
import { cn } from "@/lib/utils";

const PALETTE = ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#06b6d4", "#8b5cf6", "#ef4444", "#84cc16", "#0ea5e9", "#f97316"];

/** Stable colour per name so an account keeps the same initials colour everywhere. */
function colorFor(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export const avatarSrc = (key: string) => `/api/${key}`;

const SIZES = { sm: "size-6 text-[10px]", md: "size-10 text-sm", lg: "size-16 text-xl", xl: "size-20 text-2xl" } as const;

export function AccountAvatar({
  name, avatarKey, size = "md", className,
}: { name: string; avatarKey?: string | null; size?: keyof typeof SIZES; className?: string }) {
  const [broken, setBroken] = useState(false);
  const initials = name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
  return (
    <span className={cn("relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white ring-1 ring-border", SIZES[size], className)}
      style={avatarKey && !broken ? undefined : { background: colorFor(name) }}>
      {avatarKey && !broken ? (
        <img src={avatarSrc(avatarKey)} alt="" className="block size-full object-cover" onError={() => setBroken(true)} />
      ) : (
        initials
      )}
    </span>
  );
}
