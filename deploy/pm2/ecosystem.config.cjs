// pm2 ecosystem config for the BVB scraper.
//
// Usage:
//   cd /path/to/repo
//   BVB_HOME=/path/to/repo BVB_WEB_ROOT=/var/www/bvb pm2 start deploy/pm2/ecosystem.config.cjs
//   pm2 save
//   pm2 startup    # follow the printed instructions to make pm2 survive reboot
//
// Why this is a "one-shot under cron_restart" pattern:
//   The scraper is not a long-running process — it does one pass and exits.
//   pm2's `cron_restart` schedules the *restart* of a stopped app, so we set
//   `autorestart: false` to keep it stopped between ticks. Net result: pm2
//   launches the script at the cron time, the script writes data.json
//   atomically and exits, pm2 keeps it stopped until the next cron tick.
//
// File is CJS (not ESM) because pm2's config loader expects CommonJS,
// while the rest of the repo is ESM ("type": "module" in package.json).
// Both can coexist as long as we use the .cjs extension here.

const path = require("node:path");

// Resolve from process.env so the friend can edit the env block below
// OR pass them on the command line via `pm2 start ... --update-env`.
const BVB_HOME = process.env.BVB_HOME || path.resolve(__dirname, "..", "..");
const BVB_WEB_ROOT = process.env.BVB_WEB_ROOT || "/var/www/bvb";
const BVB_OUT = process.env.BVB_OUT || path.join(BVB_WEB_ROOT, "data.json");

module.exports = {
  apps: [
    {
      name: "bvb-scrape",
      cwd: BVB_HOME,
      script: "dist/build-data.js",
      // 4 fires per hour during the UTC window that covers Bucharest 10:00–
      // 18:00 under both EET and EEST. Off-peak minute marks (:05/:20/:35
      // /:50) reduce scheduler skips on shared hosts. The in-process gate
      // (BVB_GATE=on, below) makes the final Bucharest-local-time decision,
      // so DST-boundary ticks self-exit cleanly.
      cron_restart: "5,20,35,50 7-16 * * 1-5",
      autorestart: false,           // one-shot per cron tick (see header)
      max_memory_restart: "200M",   // generous — actual usage is ~80 MB
      env: {
        NODE_ENV: "production",
        TZ: "UTC",                  // explicit; cron_restart parses in UTC
        BVB_GATE: "on",             // skip outside Bucharest business hours
        BVB_OUT: BVB_OUT,           // atomic write target (served by nginx)
      },
      out_file: path.join(BVB_HOME, "logs/scrape.out.log"),
      error_file: path.join(BVB_HOME, "logs/scrape.err.log"),
      merge_logs: true,
      time: true,
    },
  ],
};
