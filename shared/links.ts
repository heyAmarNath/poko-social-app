// Profile links: checking them, and the short handle shown for each.

/** Platforms whose handles read naturally with a leading "@". */
const AT_PLATFORMS = new Set(["x", "twitter", "instagram", "threads", "tiktok", "youtube", "pinterest", "twitch", "medium", "bluesky"]);

/** Returns the URL if it is a valid http(s) link, else null. */
export function normalizeUrl(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    if ((u.protocol === "http:" || u.protocol === "https:") && u.hostname.includes(".")) return u.toString();
  } catch {
    /* not a URL */
  }
  return null;
}

/**
 * A short display name for a profile link, used wherever the app shows an account's handle.
 * x.com/acme -> @acme, linkedin.com/company/initech -> initech, reddit.com/r/foo -> r/foo.
 */
export function handleFromUrl(platformKey: string, url: string): string {
  const u = new URL(url);
  const parts = u.pathname.split("/").map((p) => decodeURIComponent(p)).filter(Boolean);
  const k = platformKey.toLowerCase();
  let name: string | undefined;
  if (k === "reddit") {
    const i = parts.findIndex((p) => /^(r|u|user)$/i.test(p));
    if (i >= 0 && parts[i + 1]) return `${parts[i].toLowerCase() === "r" ? "r" : "u"}/${parts[i + 1]}`;
  } else if (k === "linkedin") {
    const i = parts.findIndex((p) => /^(company|in|school|showcase)$/i.test(p));
    name = i >= 0 ? parts[i + 1] : parts[0];
  } else if (k === "youtube") {
    if (parts[0] === "channel" && parts[1]) return parts[1]; // channel IDs are not @handles
    name = parts.find((p) => p.startsWith("@")) ?? (/^(c|user)$/.test(parts[0] ?? "") ? parts[1] : parts[0]);
  } else if (k === "bluesky") {
    name = parts[0] === "profile" ? parts[1] : parts[0];
  } else if (k === "discord") {
    name = parts[0] === "invite" ? parts[1] : parts.at(-1);
  } else if (k === "facebook") {
    name = parts[0] === "profile.php" ? u.searchParams.get("id") ?? undefined : parts[0];
  } else {
    name = parts.find((p) => p.startsWith("@")) ?? parts[0];
  }
  name = (name ?? "").replace(/^@/, "");
  if (!name) return u.hostname.replace(/^www\./, "");
  return AT_PLATFORMS.has(k) ? `@${name}` : name;
}
