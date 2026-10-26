import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { admin, call, member, platformId, seedPlatforms } from "./helpers";
import { purge } from "../worker/purge";

beforeEach(seedPlatforms);

/** Creates a brand with X + LinkedIn profiles, both managed by `managerId`. Returns the accounts. */
async function makeBrand(adminCookie: string, name: string, managerId?: number) {
  const x = await platformId("x");
  const li = await platformId("linkedin");
  const r = await call("/admin/brands", {
    cookie: adminCookie,
    json: {
      name,
      entries: [
        { platform_id: x, url: `https://x.com/${name.toLowerCase()}`, manager_id: managerId ?? null },
        { platform_id: li, url: `https://linkedin.com/company/${name.toLowerCase()}`, manager_id: managerId ?? null },
      ],
    },
  });
  expect(r.status).toBe(201);
  const brands = (await call("/brands", { cookie: adminCookie })).data as { name: string; accounts: { id: number; handle: string }[] }[];
  return brands.find((b) => b.name === name)!.accounts;
}

describe("accounts (brands)", () => {
  it("works out handles from profile links and saves each profile's manager", async () => {
    const a = await admin();
    const m = await member();
    const accounts = await makeBrand(a.cookie, "Acme", m.id);
    expect(accounts.map((x) => x.handle).toSorted()).toEqual(["@acme", "acme"]);
    const brands = (await call("/brands", { cookie: m.cookie })).data;
    expect(brands[0].accounts.every((x: { manager_id: number }) => x.manager_id === m.id)).toBe(true);
  });

  it("refuses duplicate names (ignoring case), bad links, and inactive managers", async () => {
    const a = await admin();
    await makeBrand(a.cookie, "Globex");
    const x = await platformId("x");
    const dup = await call("/admin/brands", { cookie: a.cookie, json: { name: "globex", entries: [{ platform_id: x, url: "https://x.com/g2" }] } });
    expect(dup.status).toBe(409);
    const badLink = await call("/admin/brands", { cookie: a.cookie, json: { name: "Bad", entries: [{ platform_id: x, url: "not a link" }] } });
    expect(badLink.status).toBe(400);
    const gone = await member("Gone");
    expect((await call(`/admin/profiles/${gone.id}`, { method: "PATCH", cookie: a.cookie, json: { active: false } })).status).toBe(200);
    const inactiveManager = await call("/admin/brands", { cookie: a.cookie, json: { name: "Initech", entries: [{ platform_id: x, url: "https://x.com/i", manager_id: gone.id }] } });
    expect(inactiveManager.status).toBe(400);
    // admins can manage accounts too
    expect((await call("/admin/brands", { cookie: a.cookie, json: { name: "Adminco", entries: [{ platform_id: x, url: "https://x.com/adminco", manager_id: a.id }] } })).status).toBe(201);
    // nothing half-saved by the failed attempts (tests in a file share one database)
    const names = (await call("/brands", { cookie: a.cookie })).data.map((b: { name: string }) => b.name);
    expect(names.filter((n: string) => ["Globex", "globex", "Bad", "Initech"].includes(n))).toEqual(["Globex"]);
  });
});

describe("posts", () => {
  it("gives every account its own version, posted by its only manager and written by the creator", async () => {
    const a = await admin();
    const m = await member("Max");
    const other = await member("Ola");
    const ids = (await makeBrand(a.cookie, "Hooli", m.id)).map((x) => x.id);
    const created = await call("/posts", { cookie: other.cookie, json: { title: "Launch", account_ids: ids } });
    expect(created.status).toBe(201);
    const post = (await call(`/posts/${created.data.id}`, { cookie: m.cookie })).data;
    expect(post.status).toBe("not_ready");
    expect(post.versions).toHaveLength(2);
    for (const v of post.versions) expect(v).toMatchObject({ poster_id: m.id, writer_id: other.id, creative_id: null, status: "not_ready", body: "", media: [] });
  });

  it("keeps each version's text, media, people, time, status and link, and derives the post's status", async () => {
    const a = await admin();
    const m = await member("Sub");
    const other = await member("Other");
    const [x, li] = (await makeBrand(a.cookie, "Subco", m.id)).map((acc) => acc.id);
    const day = Date.UTC(2032, 2, 3);
    const { data } = await call("/posts", { cookie: m.cookie, json: { title: "Two places", versions: [
      { account_id: x, body: "Short one for X", media: [{ url: "https://drive.google.com/a", label: "Hero" }, { url: "", label: "blank row" }] },
      { account_id: li, body: "A longer LinkedIn post", poster_id: other.id, creative_id: other.id, scheduled_at: day + 3_600_000, status: "working" },
    ] } });
    const get = async () => (await call(`/posts/${data.id}`, { cookie: m.cookie })).data;
    let post = await get();
    const ver = (id: number) => post.versions.find((v: { account_id: number }) => v.account_id === id);
    expect(ver(x)).toMatchObject({ body: "Short one for X", media: [{ url: "https://drive.google.com/a", label: "Hero" }], poster_id: m.id, status: "not_ready" });
    expect(ver(li)).toMatchObject({ body: "A longer LinkedIn post", media: [], poster_id: other.id, creative_id: other.id, status: "working" });
    expect(post.status).toBe("working"); // one version has started
    // the post has no date, but one version goes out that day
    expect((await call(`/posts?from=${day}&to=${day + 86_400_000}`, { cookie: m.cookie })).data.map((p: { id: number }) => p.id)).toEqual([data.id]);

    // one version completed: the post is still open; the other poster still has it in My work
    const setStatus = (acc: number, status: string) => call(`/posts/${data.id}/versions/${acc}/status`, { cookie: m.cookie, json: { status } });
    await setStatus(x, "completed");
    post = await get();
    expect([post.status, ver(x).status, ver(li).status]).toEqual(["working", "completed", "working"]);
    expect(await titles(m.cookie, "post")).not.toContain("Two places");
    expect(await titles(other.cookie, "post")).toContain("Two places");
    // both completed: the post is completed
    await setStatus(li, "completed");
    expect((await get()).status).toBe("completed");
    // all back to not ready
    await setStatus(x, "not_ready");
    await setStatus(li, "not_ready");
    expect((await get()).status).toBe("not_ready");
    expect((await setStatus(x, "done")).status).toBe(400);

    // saving the post keeps saved statuses (they change only through their route) and writes the details
    await setStatus(x, "completed");
    post = await get();
    const saved = await call(`/posts/${data.id}`, { method: "PUT", cookie: m.cookie, json: {
      title: "Two places", version: post.version, versions: [
        { account_id: x, body: "Edited", media: [], status: "not_ready", poster_id: m.id, scheduled_at: null, posted_url: "https://x.com/subco/status/1" },
        { account_id: li, poster_id: null, scheduled_at: null, posted_url: "" },
      ] } });
    expect(saved.status).toBe(200);
    post = await get();
    expect(ver(x)).toMatchObject({ status: "completed", body: "Edited", media: [], posted_url: "https://x.com/subco/status/1" });
    expect(ver(li)).toMatchObject({ status: "not_ready", body: "A longer LinkedIn post", poster_id: null, scheduled_at: null, posted_url: null });
    for (const bad of [{ posted_url: "javascript:alert(1)" }, { media: [{ url: "javascript:alert(1)", label: "" }] }, { media: "nope" }]) {
      const r = await call(`/posts/${data.id}`, { method: "PUT", cookie: m.cookie, json: { title: "Two places", version: post.version, versions: [{ account_id: x, ...bad }] } });
      expect(r.status).toBe(400);
    }
    // dropping the only open version leaves just a completed one: the post is completed
    const dropped = await call(`/posts/${data.id}`, { method: "PUT", cookie: m.cookie, json: {
      title: "Two places", version: post.version, versions: [{ account_id: x }] } });
    expect(dropped.status).toBe(200);
    post = await get();
    expect([post.status, post.versions.length, ver(x).body]).toEqual(["completed", 1, "Edited"]);
  });

  it("defaults each version's poster to its account's manager", async () => {
    const a = await admin();
    const [kushal, amar, ananya] = [await member("Kushal"), await member("Amar"), await member("Ananya")];
    const x = await platformId("x");
    const brand = async (name: string, manager: number | null) => {
      const r = await call("/admin/brands", { cookie: a.cookie, json: { name, entries: [{ platform_id: x, url: `https://x.com/${name}`, manager_id: manager }] } });
      expect(r.status).toBe(201);
      return ((await call("/brands", { cookie: a.cookie })).data as { name: string; accounts: { id: number; manager_id: number | null }[] }[]).find((b) => b.name === name)!.accounts[0];
    };
    const ceo = await brand("ceo", kushal.id);
    const pokoX = await brand("poko", ananya.id);
    const none = await brand("nomanager", null);
    expect(ceo.manager_id).toBe(kushal.id);

    const posters = async (versions: { account_id: number; poster_id?: number }[]) => {
      const { data } = await call("/posts", { cookie: amar.cookie, json: { title: "p", versions } });
      return ((await call(`/posts/${data.id}`, { cookie: amar.cookie })).data.versions as { account_id: number; poster_id: number | null }[])
        .map((v): [number, number | null] => [v.account_id, v.poster_id]);
    };
    // each version gets its account's manager, or nobody if it has none
    expect(new Map(await posters([{ account_id: pokoX.id }, { account_id: ceo.id }, { account_id: none.id }])))
      .toEqual(new Map([[pokoX.id, ananya.id], [ceo.id, kushal.id], [none.id, null]]));
    // a pick by hand wins
    expect(await posters([{ account_id: ceo.id, poster_id: amar.id }])).toEqual([[ceo.id, amar.id]]);
    // a deactivated manager isn't filled in
    expect((await call(`/admin/profiles/${kushal.id}`, { method: "PATCH", cookie: a.cookie, json: { active: false } })).status).toBe(200);
    expect(await posters([{ account_id: ceo.id }])).toEqual([[ceo.id, null]]);
  });

  it("lists a day's posts, my work by content, media and post versions, and counts them", async () => {
    const writer = await member("Wren");
    const maker = await member("Mo");
    const poster = await member("Pia");
    const day = Date.UTC(2031, 0, 15);
    const at = day + 10 * 3_600_000;
    const a = await admin();
    const [acc, acc2] = await makeBrand(a.cookie, "Plannedco");
    const created = await call("/posts", {
      cookie: writer.cookie,
      json: { title: "Planned", scheduled_at: at, versions: [
        { account_id: acc.id, poster_id: poster.id, creative_id: maker.id },
        { account_id: acc2.id, poster_id: poster.id, creative_id: maker.id },
      ] },
    });
    await call("/posts", { cookie: writer.cookie, json: { title: "Next day", scheduled_at: at + 86_400_000, versions: [{ account_id: acc.id, poster_id: null }] } });
    await call("/posts", { cookie: writer.cookie, json: { title: "Idea", account_ids: [] } });
    const onDay = (await call(`/posts?from=${day}&to=${day + 86_400_000}`, { cookie: maker.cookie })).data as { title: string }[];
    expect(onDay.map((p) => p.title)).toEqual(["Planned"]);

    // the creator writes every version unless someone else is picked
    expect(await titles(writer.cookie, "content")).toEqual(["Planned", "Next day"]);
    expect(await titles(maker.cookie, "media")).toEqual(["Planned"]);
    expect(await titles(poster.cookie, "post")).toEqual(["Planned"]);
    expect(await titles(maker.cookie, "content")).toEqual([]);
    // All: any of the three jobs
    expect(await titles(writer.cookie, "all")).toEqual(["Planned", "Next day"]);
    expect(await titles(maker.cookie, "all")).toEqual(["Planned"]);
    expect(await titles(poster.cookie, "all")).toEqual(["Planned"]);
    expect((await call("/posts?mine=other", { cookie: maker.cookie })).status).toBe(400);
    expect((await call("/posts?status=todo", { cookie: maker.cookie })).status).toBe(400);

    // counts are open versions
    const dash = (await call(`/dashboard?from=${day}&to=${day + 86_400_000}`, { cookie: maker.cookie })).data;
    expect(dash).toEqual({ today: 1, all: 2, content: 0, media: 2, post: 0 });
    expect((await call(`/dashboard?from=${day}&to=${day + 86_400_000}`, { cookie: writer.cookie })).data).toMatchObject({ all: 3, content: 3 });
    // a completed version leaves My work counts; the post stays until all are
    await call(`/posts/${created.data.id}/versions/${acc.id}/status`, { cookie: maker.cookie, json: { status: "completed" } });
    expect((await call(`/dashboard?from=${day}&to=${day + 86_400_000}`, { cookie: maker.cookie })).data).toMatchObject({ today: 1, all: 1, media: 1 });
    await call(`/posts/${created.data.id}/versions/${acc2.id}/status`, { cookie: maker.cookie, json: { status: "completed" } });
    expect(await titles(maker.cookie, "media")).toEqual([]);
    expect((await call(`/dashboard?from=${day}&to=${day + 86_400_000}`, { cookie: maker.cookie })).data.today).toBe(0);
    const completed = (await call("/posts?status=completed", { cookie: maker.cookie })).data as { title: string }[];
    expect(completed.map((p) => p.title)).toContain("Planned");
  });

  it("refuses a save based on an old version instead of overwriting someone's changes", async () => {
    const a = await admin();
    const m = await member();
    const [id] = (await makeBrand(a.cookie, "Pied Piper")).map((x) => x.id);
    const { data } = await call("/posts", { cookie: m.cookie, json: { title: "Draft", account_ids: [id] } });
    const v1 = (await call(`/posts/${data.id}`, { cookie: m.cookie })).data;
    const save = (body: string, version: number) =>
      call(`/posts/${data.id}`, { method: "PUT", cookie: m.cookie, json: { title: v1.title, notes: null, scheduled_at: null, version, versions: [{ account_id: id, body }] } });
    const first = await save("first", v1.version);
    expect(first.status).toBe(200);
    expect((await save("second", v1.version)).status).toBe(409);
    expect((await call(`/posts/${data.id}`, { cookie: m.cookie })).data.versions[0].body).toBe("first");
    // a status change never conflicts with an open editor
    await call(`/posts/${data.id}/versions/${id}/status`, { cookie: m.cookie, json: { status: "working" } });
    expect((await save("third", first.data.version)).status).toBe(200);
  });

  it("can still save a post after one of its accounts was deleted", async () => {
    const a = await admin();
    const m = await member();
    const keep = (await makeBrand(a.cookie, "Keepco")).map((x) => x.id);
    const gone = (await makeBrand(a.cookie, "Goneco")).map((x) => x.id);
    const { data } = await call("/posts", { cookie: m.cookie, json: { title: "Mixed", account_ids: [...keep, ...gone] } });
    const brandId = (await call("/brands", { cookie: a.cookie })).data.find((b: { name: string }) => b.name === "Goneco").id;
    expect((await call(`/admin/brands/${brandId}`, { method: "DELETE", cookie: a.cookie })).status).toBe(200);
    const post = (await call(`/posts/${data.id}`, { cookie: m.cookie })).data;
    expect(post.versions.map((x: { account_id: number }) => x.account_id).toSorted()).toEqual(keep.toSorted());
    const saved = await call(`/posts/${data.id}`, { method: "PUT", cookie: m.cookie, json: {
      title: post.title, notes: null, scheduled_at: null, version: post.version,
      versions: post.versions.map((x: { account_id: number }) => ({ account_id: x.account_id, body: "still works" })) } });
    expect(saved.status).toBe(200);
  });

  it("duplicates versions with their text, media and people, but no status, times or links", async () => {
    const a = await admin();
    const m = await member();
    const [x] = (await makeBrand(a.cookie, "Dupco", m.id)).map((acc) => acc.id);
    const { data } = await call("/posts", { cookie: m.cookie, json: { title: "Orig", scheduled_at: Date.UTC(2033, 0, 1), versions: [
      { account_id: x, body: "Copy me", media: [{ url: "https://dropbox.com/v", label: "Video" }], scheduled_at: Date.UTC(2033, 0, 2), posted_url: "https://x.com/1", status: "completed" },
    ] } });
    const copy = await call(`/posts/${data.id}/duplicate`, { method: "POST", cookie: m.cookie });
    const post = (await call(`/posts/${copy.data.id}`, { cookie: m.cookie })).data;
    expect(post).toMatchObject({ title: "Orig (copy)", status: "not_ready", scheduled_at: null });
    expect(post.versions[0]).toMatchObject({ body: "Copy me", media: [{ url: "https://dropbox.com/v", label: "Video" }], poster_id: m.id, writer_id: m.id, status: "not_ready", scheduled_at: null, posted_url: null });
  });
});

/** Titles of my open posts for one My work tab. */
const titles = async (cookie: string, mine: string) => ((await call(`/posts?mine=${mine}&status=open`, { cookie })).data as { title: string }[]).map((p) => p.title);

const topicNamed = async (cookie: string, name: string) =>
  ((await call("/topics", { cookie })).data as { id: number; name: string; template: string; open_count: number }[]).find((t) => t.name === name);

describe("topics", () => {
  it("list a topic's posts by open and completed, and count the open ones", async () => {
    const a = await admin();
    const m = await member();
    const [acc] = await makeBrand(a.cookie, "Topicco");
    expect((await call("/admin/topics", { cookie: a.cookie, json: { name: "Giveaway", template: "[Prize]" } })).status).toBe(201);
    const topic = (await topicNamed(m.cookie, "Giveaway"))!;
    const one = await call("/posts", { cookie: m.cookie, json: { title: "Win a video", topic_id: topic.id, account_ids: [acc.id] } });
    await call("/posts", { cookie: m.cookie, json: { title: "Second", topic_id: topic.id, account_ids: [] } });
    await call("/posts", { cookie: m.cookie, json: { title: "No topic", account_ids: [] } });
    expect((await call(`/posts?status=open&topic=${topic.id}`, { cookie: m.cookie })).data).toHaveLength(2);
    expect((await topicNamed(m.cookie, "Giveaway"))!.open_count).toBe(2);

    await call(`/posts/${one.data.id}/versions/${acc.id}/status`, { cookie: m.cookie, json: { status: "completed" } });
    expect((await call(`/posts?status=open&topic=${topic.id}`, { cookie: m.cookie })).data).toHaveLength(1);
    expect((await call(`/posts?status=completed&topic=${topic.id}`, { cookie: m.cookie })).data).toHaveLength(1);
    expect((await topicNamed(m.cookie, "Giveaway"))!.open_count).toBe(1);
    expect((await call("/posts?status=open&topic=none", { cookie: m.cookie })).data.some((p: { title: string }) => p.title === "No topic")).toBe(true);
  });

  it("are managed by admins only, and deleting one keeps its posts", async () => {
    const a = await admin();
    const m = await member();
    expect((await call("/admin/topics", { cookie: m.cookie, json: { name: "Memes" } })).status).toBe(403);
    const created = await call("/admin/topics", { cookie: a.cookie, json: { name: "Memes", description: "Funny ones", template: "[Joke]" } });
    expect(created.status).toBe(201);
    expect((await call("/admin/topics", { cookie: a.cookie, json: { name: "memes" } })).status).toBe(409);
    expect((await topicNamed(m.cookie, "Memes"))!.template).toBe("[Joke]");

    const post = await call("/posts", { cookie: m.cookie, json: { title: "A meme", topic_id: created.data.id, account_ids: [] } });
    expect((await call(`/admin/topics/${created.data.id}`, { method: "DELETE", cookie: a.cookie })).status).toBe(200);
    expect(await topicNamed(m.cookie, "Memes")).toBeUndefined();
    const kept = (await call(`/posts/${post.data.id}`, { cookie: m.cookie })).data;
    expect(kept.topic_id).toBeNull();
    // a deleted topic can't be picked for a post
    expect((await call("/posts", { cookie: m.cookie, json: { title: "x", topic_id: created.data.id, account_ids: [] } })).status).toBe(400);
  });

  it("can be reordered", async () => {
    const a = await admin();
    for (const name of ["First", "Second"]) await call("/admin/topics", { cookie: a.cookie, json: { name } });
    const ids = ((await call("/topics", { cookie: a.cookie })).data as { id: number }[]).map((t) => t.id);
    const flipped = ids.toReversed();
    expect((await call("/admin/topics/order", { cookie: a.cookie, json: { ids: flipped } })).status).toBe(200);
    expect(((await call("/topics", { cookie: a.cookie })).data as { id: number }[]).map((t) => t.id)).toEqual(flipped);
  });
});

describe("housekeeping", () => {
  it("purges posts deleted over 30 days ago with their versions and comments", async () => {
    const a = await admin();
    const m = await member();
    const [acc] = await makeBrand(a.cookie, "Purgeco");
    const { data } = await call("/posts", { cookie: m.cookie, json: { title: "Old", account_ids: [acc.id] } });
    await call(`/posts/${data.id}/comments`, { cookie: m.cookie, json: { body: "bye" } });
    await call(`/posts/${data.id}`, { method: "DELETE", cookie: m.cookie });
    expect(await purge(env)).toBe(0); // deleted just now: kept for 30 days
    await env.DB.prepare("UPDATE posts SET deleted_at = ? WHERE id = ?").bind(Date.now() - 31 * 86_400_000, data.id).run();
    expect(await purge(env)).toBe(1);
    for (const sql of ["SELECT 1 FROM posts WHERE id = ?", "SELECT 1 FROM post_versions WHERE post_id = ?", "SELECT 1 FROM comments WHERE post_id = ?"])
      expect(await env.DB.prepare(sql).bind(data.id).first()).toBeNull();
  });
});
