// pm2 ecosystem config for the app server plus the scheduled scraper.
//
// Usage:
//   cd /path/to/repo
//   npm install
//   npm run build
//   pm2 start ecosystem.config.cjs --update-env
//   pm2 save
//   pm2 startup    # follow the printed instructions to make pm2 survive reboot
//
// The web app is a normal long-running process. The scraper remains a
// one-shot job triggered by pm2's `cron_restart`, which restarts a stopped
// process on schedule. We keep `autorestart: false` for that job so it runs
// once per tick, writes dist/public/data.json, and exits cleanly.

const path = require("node:path");

const BVB_HOME = process.env.BVB_HOME || path.resolve(__dirname);
const PORT = process.env.PORT || "7902";

module.exports = {
  apps: [
    {
      name: "bvb-web",
      cwd: BVB_HOME,
      script: "dist/server.js",
      autorestart: true,
      max_memory_restart: "200M",
      env: {
        NODE_ENV: "production",
        PORT,
      },
      out_file: path.join(BVB_HOME, "logs/web.out.log"),
      error_file: path.join(BVB_HOME, "logs/web.err.log"),
      merge_logs: true,
      time: true,
    },
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
      },
      out_file: path.join(BVB_HOME, "logs/scrape.out.log"),
      error_file: path.join(BVB_HOME, "logs/scrape.err.log"),
      merge_logs: true,
      time: true,
    },
  ],
};
