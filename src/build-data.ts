// Runs the scraper and writes data.json. Invoked by:
//   - GitHub Actions cron (writes src/public/data.json in the repo)
//   - cPanel cron (writes directly into the subdomain doc root)
//   - locally via `npm run build:data`
//
// Output path is controlled by env var BVB_OUT (full path to the JSON
// file). When unset, falls back to src/public/data.json relative to the
// compiled script's directory, which is what the repo and GitHub Actions
// expect.
//
// Write is atomic: we write to <out>.tmp first then rename, so HTTP
// clients never read a half-written file.
import { writeFile, rename, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scrapeAll } from "./scrape.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT = path.join(__dirname, "public", "data.json");
const OUT = process.env.BVB_OUT
  ? path.resolve(process.env.BVB_OUT)
  : DEFAULT_OUT;

async function main() {
  const t0 = Date.now();
  const result = await scrapeAll();
  await mkdir(path.dirname(OUT), { recursive: true });
  const tmp = OUT + ".tmp";
  await writeFile(tmp, JSON.stringify(result, null, 2));
  await rename(tmp, OUT);
  console.log(
    `wrote ${OUT} (${result.analytics.length} bonds, ${result.errors.length} errors, ${Date.now() - t0}ms)`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
