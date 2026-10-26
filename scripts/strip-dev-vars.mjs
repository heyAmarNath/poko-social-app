// The Cloudflare Vite plugin copies .dev.vars (local secrets) into the build output for `vite preview`.
// Remove it so a build folder can never carry local secrets anywhere.
import { readdirSync, rmSync, existsSync } from "node:fs";
for (const dir of existsSync("dist") ? readdirSync("dist") : []) {
  const f = `dist/${dir}/.dev.vars`;
  if (existsSync(f)) {
    rmSync(f);
    console.log(`removed ${f}`);
  }
}
