# BVB YTM

Express + EJS app that shows yield-to-maturity for Romanian government
bonds (RON and EUR **Titluri de stat**) listed on Bucharest Stock Exchange
(`m.bvb.ro`), sortable by YTM at bid / ask / last price. BVB only publishes
YTM at last price; this app additionally computes YTM at the current ask
(what you'd pay to buy) and bid (what you'd get to sell) — usually what
you actually want when shopping for yield. A target-YTM input also inverts
the math: type a target and get the clean price each bond needs to offer
that yield, plus a badge telling you whether the market is already there.

Live at **https://bvb.bonsair.net/**.

## Requirements

- Node 18+

## Scripts

- `npm run build` — compiles TypeScript to `dist/` and copies runtime
  assets (`src/public/`, `src/views/`) there.
- `npm run build:data` — scrapes a fresh snapshot into
  `src/public/data.json` and syncs `dist/public/data.json`.
- `npm start` — runs the compiled server from `dist/server.js`.
- `npm run pm2:start` — boots the pm2 ecosystem (`bvb-web` + `bvb-scrape`).
- `npm run typecheck` — TypeScript-only check, no emit.
- `npm run cli` — terminal pretty-printer for debugging.

## Local

```sh
npm install
npm run build
npm run build:data    # optional: refresh data snapshot
npm start
```

Open `http://localhost:7902` (or whatever `PORT` you set).

## PM2 deploy

```sh
npm install
npm run build
npm run pm2:start
pm2 save
pm2 startup           # first time only — follow the printed command
```

This starts two pm2 apps:

- **bvb-web** — the long-running Express server (auto-restarts on crash).
- **bvb-scrape** — one-shot scraper that pm2's `cron_restart` fires every
  15 min during Bucharest business hours (off-peak minute marks
  `5,20,35,50 7-16 * * 1-5` UTC, plus an in-process Europe/Bucharest gate
  via `BVB_GATE=on` so DST boundaries don't matter). The script writes
  `dist/public/data.json` atomically (`.tmp` + rename) so the web server
  never reads a half-written file.

Useful commands:

```sh
pm2 list                          # status + last exit code
pm2 logs bvb-scrape               # tail stdout + stderr
pm2 restart bvb-scrape            # run a refresh on demand
pm2 reload ecosystem.config.cjs --update-env   # pick up config changes
```

## Layout

```
src/
  parse.ts        cheerio HTML parsers + RO-locale number/date helpers
  ytm.ts          ACT/365 annual-coupon schedule, accrued, bisection YTM
  analytics.ts    BondDetail -> per-100 dirty + YTM at bid/ask/last
  scrape.ts       fetch listing, filter (RON+EUR Titluri de stat), fan-out
  build-data.ts   entry point; honours BVB_OUT + BVB_GATE env knobs
  gate.ts         Europe/Bucharest business-hours gate (Intl-based, DST-safe)
  server.ts       Express app — renders the EJS view, serves static assets
                  with cache-control (no-cache on data.json/sw.js, 1h shell)
  cli.ts          terminal pretty-printer (debug)
  views/
    index.ejs     server-rendered HTML shell with sortable table UI
  public/
    sw.js         stale-while-revalidate for data.json, cache-first for shell
    manifest.json PWA manifest
    icon.svg      app icon
    data.json     refreshed by the scraper every ~15 min during business hours
scripts/
  copy-static.mjs build helper that mirrors src/public and src/views to dist
ecosystem.config.cjs   pm2 apps: bvb-web (long-running) + bvb-scrape (cron)
```

## Install on phone

Open https://bvb.bonsair.net/ on Android Chrome / iOS Safari → menu →
"Add to Home Screen". The app launches fullscreen with its own icon,
works offline against the last-cached `data.json` (via the service
worker's stale-while-revalidate policy), and refreshes in the background
when online.

## Calibration

The "BVB YTM" column reproduces the YTM shown on each bond's detail page
on `m.bvb.ro` (which is computed at last-traded price). Local YTM-at-last
matches BVB very closely under the annual-coupon + ACT/365 assumption:

| Universe              | n   | Mean abs diff to BVB YTM |
|-----------------------|-----|--------------------------|
| RON Titluri de stat   | ~70 | ≤ 1 bp                   |
| EUR Titluri de stat   | ~60 | ≤ 0.5 bp                 |

This holds across R-series (Fidelis, nominal 100), B-series (regular
treasury, nominal 5,000), and the EUR equivalents (`R????AE` tickers).

## Caveats

- BVB delays prices by ≥15 min, and the scraper refreshes on a 15-min
  cron — so data on screen can be up to ~30 min stale.
- The BVB detail page has a Tranzactionare tab with top-5 order-book
  depth; we only use top-of-book bid/ask.
- Bonds with no live ask quote (`ask = null`) get no YTM-at-ask and are
  filtered out by default; toggle "only with ask" off to see them.
- Bonds within days of maturity often have stale asks above the final
  cashflow value, producing a negative YTM-at-ask. Those rows are
  highlighted with ⚠ rather than hidden — they're a real liquidity
  signal, not a bug.

## Notes

- `npm start` does not scrape data on startup. It serves the last built
  snapshot.
- Outside pm2, run `npm run build:data` whenever you want fresh data.
- The build (`tsc`) does not touch `src/public/` or `src/views/` —
  `scripts/copy-static.mjs` mirrors them into `dist/` so the compiled
  server can serve them by absolute path.
