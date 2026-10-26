import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { call, member } from "./helpers";

/** Splits a SQL script into statements. Semicolons and dashes inside quoted text are left alone. */
function statements(sql: string) {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (!quoted && ch === "-" && sql[i + 1] === "-") {
      i = sql.indexOf("\n", i);
      if (i < 0) break;
      continue;
    }
    if (ch === "'") quoted = !quoted; // a doubled '' flips twice, so it stays quoted
    if (ch === ";" && !quoted) {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const count = async (table: string) => (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())!.n;

describe("seed", () => {
  it("sets up a new database with the platforms and the team's topics", async () => {
    await env.DB.batch(statements(env.TEST_SEED).map((s) => env.DB.prepare(s)));
    expect(await count("platforms")).toBe(9);
    expect(await count("topics")).toBe(16);

    expect(await count("profiles")).toBe(0); // the first admin is added with their Google email
    const { cookie } = await member();
    const topics = (await call("/topics", { cookie })).data as { name: string; template: string }[];
    expect(topics[0].name).toBe("Feature Promotion");
    expect(topics.every((t) => t.template.length > 0)).toBe(true);
  });
});
