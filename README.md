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
  build-data.ts   entry point; honours BVB_OUT env to control output path
  cli.ts          terminal pretty-printer (debug)
  public/         the static site
    index.html    sortable table UI + service worker registration
    sw.js         stale-while-revalidate for data.json, cache-first for shell
    manifest.json PWA manifest
    icon.svg      app icon
    data.json     committed by the GH Actions scrape workflow
.github/workflows/
  scrape.yml      cron every 15 min (Bucharest business hours); writes data.json
  deploy.yml      publishes src/public/ to GitHub Pages on push to main
deploy/cpanel/
  setup.sh        one-shot installer over SSH (npm ci, build, copy assets)
  refresh.sh      invoked by cPanel cron; writes data.json into the doc root
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

## Deploying on cPanel (subdomain on a friend's server)

The app is a flat directory of static files plus a tiny Node.js script that
refreshes `data.json` on a cron. Everything cPanel ships with handles this
natively (static doc root + cron + per-user Node.js).

### Prerequisites on the host

- SSH access (cPanel → **SSH Access** → enable, download key).
- Node.js 18 or newer. cPanel ships **Setup Node.js App** which provisions a
  per-user Node under `~/nodevenv/.../bin/node`; either that path or a system
  `node` works. Verify: `node --version`.
- The subdomain already created in cPanel → **Subdomains**, with its doc root
  noted (e.g. `/home/USER/bvb.example.com`).

### Initial setup

SSH in and run:

```sh
# 1. Clone wherever you like outside the doc root.
cd ~
git clone https://github.com/<you>/<repo>.git bvb
cd bvb

# 2. Decide on paths and run the installer.
export BVB_HOME="$HOME/bvb"
export BVB_WEB_ROOT="$HOME/bvb.example.com"   # subdomain doc root
export NODE_BIN="$(which node)"                # or the nodevenv path
bash deploy/cpanel/setup.sh
```

`setup.sh` is idempotent: `npm ci`, `npm run build`, copies
`index.html / sw.js / manifest.json / icon.svg` into `$BVB_WEB_ROOT`, then
runs one refresh so `data.json` exists. Hit the subdomain URL at this point;
the PWA should already work.

### Cron entry (the only piece that's host-specific)

In cPanel → **Cron Jobs** → **Add New Cron Job**:

```
5,20,35,50 7-16 * * 1-5  BVB_HOME=/home/USER/bvb BVB_WEB_ROOT=/home/USER/bvb.example.com NODE_BIN=/home/USER/nodevenv/bvb/20/bin/node bash /home/USER/bvb/deploy/cpanel/refresh.sh
```

- Cron uses **UTC** on most cPanel hosts. `7-16` UTC covers
  Mon–Fri 10:00–18:00 Europe/Bucharest under both EET and EEST.
- The script also runs a Bucharest-local-time gate, so out-of-window ticks
  (e.g. summer 16:30 UTC = 19:30 RO) exit silently — no cron-email spam.
- The minute marks `5,20,35,50` deliberately avoid `:00 / :15 / :30 / :45`
  to dodge load spikes on shared hosts.
- Locking is via an atomic `mkdir`-based mutex with a 5-min stale-lock
  recovery, so overlapping runs are safe.
- Output goes to `$BVB_HOME/cron.log`.

### Updating after a code change

```sh
cd ~/bvb && git pull && bash deploy/cpanel/setup.sh
```

`setup.sh` re-runs `npm ci`, recompiles TS, and re-copies static assets.
The cron line itself doesn't change.

### Disabling GitHub Actions when cPanel is the primary host

If the friend's cPanel is now your one source of truth, you can disable the
GitHub workflows (so the repo doesn't keep emailing you data-refresh commits):
**Actions tab → scrape → … → Disable workflow**, same for `deploy-pages`.
The code stays in the repo; only the schedule stops.

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
