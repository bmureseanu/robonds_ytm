// Runs the scraper and writes public/data.json. Invoked by the GitHub
// Actions cron and locally via `npm run build:data`.
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scrapeAll } from "./scrape.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "public", "data.json");

async function main() {
  const t0 = Date.now();
  const result = await scrapeAll();
  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(result, null, 2));
  console.log(
    `wrote ${OUT} (${result.analytics.length} bonds, ${result.errors.length} errors, ${Date.now() - t0}ms)`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
