import type { IconType } from "react-icons";
import {
  FaBluesky, FaDiscord, FaFacebook, FaInstagram, FaLinkedin, FaMastodon, FaMedium, FaPinterest, FaReddit,
  FaSnapchat, FaTelegram, FaThreads, FaTiktok, FaTumblr, FaTwitch, FaWhatsapp, FaXTwitter, FaYoutube,
} from "react-icons/fa6";
import { cn } from "@/lib/utils";

/** Brand icons from Font Awesome Free (via react-icons), matched by platform key or name. */
const ICONS: Record<string, IconType> = {
  x: FaXTwitter, twitter: FaXTwitter, facebook: FaFacebook, instagram: FaInstagram, linkedin: FaLinkedin,
  reddit: FaReddit, discord: FaDiscord, threads: FaThreads, tiktok: FaTiktok, youtube: FaYoutube,
  pinterest: FaPinterest, snapchat: FaSnapchat, telegram: FaTelegram, whatsapp: FaWhatsapp, bluesky: FaBluesky,
  mastodon: FaMastodon, tumblr: FaTumblr, twitch: FaTwitch, medium: FaMedium,
};

const norm = (s?: string) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

export function iconFor(k?: string, name?: string): IconType | null {
  return ICONS[norm(k)] ?? ICONS[norm(name)] ?? null;
}

/** Very dark brand colours (X, Threads, TikTok) follow the text colour so they show in dark mode. */
function isNearBlack(hex: string) {
  const m = hex.replace("#", "").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return false;
  const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.12;
}

/**
 * Platform brand icon. The platform name is never printed: it is the hover tooltip and the
 * accessible label, unless `decorative` is set because a parent already names it.
 */
export function PlatformIcon({
  k, name, color, className, decorative,
}: { k?: string; name?: string; color: string; className?: string; decorative?: boolean }) {
  const Icon = iconFor(k, name);
  const dark = isNearBlack(color);
  const glyph = Icon ? (
    <Icon aria-hidden className={cn("size-3.5 shrink-0", dark && "text-foreground", className)} style={dark ? undefined : { color }} />
  ) : (
    <span aria-hidden className={cn("inline-flex size-3.5 shrink-0 items-center justify-center rounded-full text-[8px] font-bold text-white", className)} style={{ background: color }}>
      {(name ?? k ?? "?").slice(0, 1).toUpperCase()}
    </span>
  );
  if (decorative || !name) return glyph;
  return (
    <span role="img" aria-label={name} title={name} className="inline-flex shrink-0">
      {glyph}
    </span>
  );
}

/** Icon plus an optional detail (usually the handle). The platform name shows only as the icon's tooltip. */
export function PlatformLabel({
  k, color, name, detail, className,
}: { k?: string; color: string; name: string; detail?: string; className?: string }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5 text-sm", className)}>
      <PlatformIcon k={k} name={name} color={color} />
      {detail && <span className="truncate text-muted-foreground">{detail}</span>}
    </span>
  );
}
