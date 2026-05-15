# BVB RON Titluri de stat — YTM at ask, bid & last

A static PWA that shows yield-to-maturity for Romanian RON government bonds
listed on Bucharest Stock Exchange (`m.bvb.ro`), sortable by YTM at bid / ask /
last price. BVB only publishes YTM at last price; this app additionally computes
YTM at the current ask (what you'd pay to buy) and bid (what you'd get to sell),
which is usually what you actually want when shopping for yield.

No backend. A GitHub Actions cron scrapes BVB every 15 minutes, commits a fresh
`data.json` to the repo, and GitHub Pages serves the static site. The page is
installable as a PWA on Android / iOS.

## Layout

```
src/
  parse.ts        cheerio HTML parsers + RO-locale number/date helpers
  ytm.ts          ACT/365 annual-coupon schedule, accrued, bisection YTM
  analytics.ts    BondDetail -> per-100 dirty + YTM at bid/ask/last
  scrape.ts       fetch listing, filter, fan-out fetch details
  build-data.ts   entry point used by CI; writes src/public/data.json
  cli.ts          terminal pretty-printer (debug)
  public/         the static site served by GitHub Pages
    index.html    sortable table UI + service worker registration
    sw.js         stale-while-revalidate for data.json, cache-first for shell
    manifest.json PWA manifest
    icon.svg      app icon
    data.json     committed by the scrape workflow
.github/workflows/
  scrape.yml      cron every 15 min; runs build:data; commits data.json
  deploy.yml      publishes src/public/ to GitHub Pages on push to main
```

## Local development

```sh
npm install
npm run build:data    # writes src/public/data.json
npm run serve         # serves src/public on http://localhost:3000
```

Or for a one-shot terminal dump:

```sh
npm run cli
```

## Deploying

1. Push this repo to GitHub.
2. (If the first deploy fails with a 403 on commit) **Settings → Actions →
   General → Workflow permissions: Read and write permissions**.
3. Run the `scrape` workflow once manually from the Actions tab so the first
   `data.json` exists. It will dispatch `deploy-pages`, which programmatically
   enables Pages (via `configure-pages` with `enablement: true`) and publishes
   the site.

After that, the cron runs every 15 minutes, commits `data.json` if changed, and
dispatches the deploy workflow. The Pages URL appears in the deploy job's
output (`https://<user>.github.io/<repo>/`).

## Install on phone

Open the Pages URL on Android Chrome / iOS Safari → menu → "Add to Home
Screen". The app launches fullscreen with an icon, works offline against the
last-cached `data.json`, and refreshes in the background when online.

## Calibration

The "BVB YTM" column reproduces the YTM shown on each bond's detail page on
`m.bvb.ro` (which is computed at last-traded price). Local YTM-at-last typically
matches it within 1 bp for both R-series (Fidelis, nominal 100) and B-series
(regular treasury, nominal 5,000). Annual coupons + ACT/365 are assumed; this
matches the Romanian retail-govies convention.

## Caveats

- The Tranzactionare tab on BVB exposes top-5 order-book depth; only top-of-book
  bid/ask is used here.
- Bonds with no live ask quote (`ask = null`) get no YTM-at-ask and are filtered
  out by default; toggle "only with ask" off to see them.
- Bonds within days of maturity often have stale asks above the final cashflow,
  producing a negative YTM-at-ask. Those rows are highlighted with ⚠ rather
  than hidden — they're a real liquidity signal.
