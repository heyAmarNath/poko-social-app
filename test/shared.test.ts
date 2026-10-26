import { describe, expect, it } from "vitest";
import { handleFromUrl, normalizeUrl } from "../shared/links";

describe("links", () => {
  it.each([
    ["x", "https://x.com/acme?s=20", "@acme"],
    ["instagram", "instagram.com/globex.hq/", "@globex.hq"],
    ["linkedin", "https://www.linkedin.com/company/initech/", "initech"],
    ["reddit", "https://reddit.com/r/startups", "r/startups"],
    ["youtube", "https://youtube.com/channel/UC123", "UC123"],
    ["youtube", "https://www.youtube.com/@hoolitv/videos", "@hoolitv"],
    ["discord", "https://discord.gg/abc123", "abc123"],
  ])("%s %s -> %s", (key, url, handle) => {
    expect(handleFromUrl(key, normalizeUrl(url)!)).toBe(handle);
  });

  it("only accepts web addresses", () => {
    expect(normalizeUrl("not a link")).toBeNull();
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeUrl("ftp://x.com/a")).toBeNull();
  });
});
