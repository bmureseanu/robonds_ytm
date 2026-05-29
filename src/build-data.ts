// Runs the scraper and writes data.json. Invoked by:
//   - GitHub Actions cron (writes src/public/data.json in the repo)
//   - cPanel cron (writes directly into the subdomain doc root)
//   - pm2 cron_restart on a real server (same — writes to BVB_OUT)
//   - locally via `npm run build:data`
//
// Env knobs:
//   BVB_OUT   Full path to the output JSON file. Defaults to
//             src/public/data.json (relative to the compiled script's dir).
//   BVB_GATE  Set to "on" to enable the in-process Europe/Bucharest
//             business-hours gate (Mon–Fri 10:00–18:00); the script
//             will exit 0 silently outside that window. Useful for
//             schedulers that don't natively support local-time crons
//             (pm2 cron_restart uses UTC). Default: off.
//   BVB_FORCE Set to "1" to bypass the gate even when BVB_GATE=on.
//
// Write is atomic: we write to <out>.tmp first then rename, so HTTP
// clients never read a half-written file.
import { writeFile, rename, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scrapeAll } from "./scrape.js";
import { inBusinessHours } from "./gate.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT = path.join(__dirname, "public", "data.json");
const OUT = process.env.BVB_OUT
  ? path.resolve(process.env.BVB_OUT)
  : DEFAULT_OUT;

async function main() {
  if (process.env.BVB_GATE === "on" && process.env.BVB_FORCE !== "1") {
    const gate = inBusinessHours();
    if (!gate.ok) {
      console.log(`gate: skipping (${gate.reason}); ${gate.localTime}`);
      return;
    }
    console.log(`gate: in-window (${gate.localTime})`);
  }
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
