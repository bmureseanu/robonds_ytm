# BVB Titluri de stat (RON & EUR) — YTM at ask, bid & last

A static PWA that shows yield-to-maturity for Romanian government bonds
(RON and EUR Titluri de stat) listed on Bucharest Stock Exchange
(`m.bvb.ro`), sortable by YTM at bid / ask / last price. BVB only publishes
YTM at last price; this app additionally computes YTM at the current ask
(what you'd pay to buy) and bid (what you'd get to sell), which is usually
what you actually want when shopping for yield. Both currencies are scraped
in the same pass and split into two tabs in the UI (bookmarkable via
`#RON` / `#EUR`).

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
  build-data.ts   entry point; honours BVB_OUT + BVB_GATE env knobs
  gate.ts         Europe/Bucharest business-hours gate (Intl-based, DST-safe)
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
deploy/pm2/
  setup.sh           one-shot installer for a pm2-managed Linux server
  ecosystem.config.cjs   pm2 app: one-shot scraper triggered via cron_restart
  nginx.example.conf for the reverse proxy that serves the static site
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

## Deploying on a Linux server with pm2

For a host that already runs other Node apps under [pm2](https://pm2.keymetrics.io/)
(typical VPS / dedicated setup). The architecture:

- The static files live in a doc root directory (e.g. `/var/www/bvb`),
  served by the existing reverse proxy (nginx / Caddy / Apache).
- The scraper is a one-shot Node script. pm2 fires it on a cron-style
  schedule (`cron_restart`) and writes `data.json` atomically into that
  same doc root. The Bucharest business-hours gate lives inside the
  script (`BVB_GATE=on`) so DST boundaries don't matter.

### Prerequisites on the host

- Node ≥ 18 (`node --version`). If installed via `nvm`, the `node` used by
  the SSH session should be the same one pm2 inherits.
- pm2 installed globally for the deploy user: `npm i -g pm2`.
- A reverse proxy you can edit a server block in (nginx is assumed below).

### Initial setup

SSH in as the deploy user and run:

```sh
cd ~ && git clone https://github.com/<you>/<repo>.git bvb
cd bvb
export BVB_HOME="$HOME/bvb"
export BVB_WEB_ROOT="/var/www/bvb"        # subdomain doc root
bash deploy/pm2/setup.sh
```

`setup.sh` is idempotent — re-run after every `git pull` to upgrade. It
runs `npm ci`, compiles TS to `dist/`, copies static assets into
`$BVB_WEB_ROOT`, and runs one forced refresh so `data.json` exists.

### Wire up pm2

```sh
BVB_HOME="$HOME/bvb" BVB_WEB_ROOT=/var/www/bvb \
  pm2 start deploy/pm2/ecosystem.config.cjs --update-env
pm2 save             # persist the app list for reboots
pm2 startup          # (first time only) follow the printed command
                     # to register pm2 with systemd
```

Useful pm2 commands afterwards:

```sh
pm2 list             # see app status and last exit code
pm2 logs bvb-scrape  # tail stdout + stderr
pm2 restart bvb-scrape    # run a refresh on demand (bypasses cron)
pm2 reload deploy/pm2/ecosystem.config.cjs --update-env  # pick up config changes
```

### Wire up nginx

Copy `deploy/pm2/nginx.example.conf` to `/etc/nginx/sites-available/bvb.example.com`,
edit the `server_name` and `root` directives, then:

```sh
sudo ln -sf /etc/nginx/sites-available/bvb.example.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d bvb.example.com      # (optional) HTTPS
```

For Caddy / Apache, the same pattern applies: serve the doc root as
plain static, mark `/data.json` and `/sw.js` as no-cache, and short-cache
the rest.

### Updating after code change

```sh
cd ~/bvb && git pull && bash deploy/pm2/setup.sh
```

The new `dist/build-data.js` is picked up automatically on the next pm2
cron tick — no `pm2 reload` needed unless you changed
`ecosystem.config.cjs` itself.

### Disabling GitHub Actions when pm2 is the primary host

Same as for cPanel: **Actions tab → scrape → Disable workflow**, same for
`deploy-pages`. The repo stays, the schedule stops.

## Install on phone

Open the Pages URL on Android Chrome / iOS Safari → menu → "Add to Home
Screen". The app launches fullscreen with an icon, works offline against the
last-cached `data.json`, and refreshes in the background when online.

## Calibration

The "BVB YTM" column reproduces the YTM shown on each bond's detail page on
`m.bvb.ro` (which is computed at last-traded price). Local YTM-at-last
matches BVB very closely under the annual-coupon + ACT/365 assumption:

| Universe | n | Mean |YTM_last − BVB_YTM| |
|---|---|---|
| RON Titluri de stat | ~70 | ≤ 1 bp |
| EUR Titluri de stat | ~60 | ≤ 0.5 bp |

This holds across R-series (Fidelis, nominal 100), B-series (regular
treasury, nominal 5,000), and the EUR equivalents (R????AE tickers).

## Caveats

- The Tranzactionare tab on BVB exposes top-5 order-book depth; only top-of-book
  bid/ask is used here.
- Bonds with no live ask quote (`ask = null`) get no YTM-at-ask and are filtered
  out by default; toggle "only with ask" off to see them.
- Bonds within days of maturity often have stale asks above the final cashflow,
  producing a negative YTM-at-ask. Those rows are highlighted with ⚠ rather
  than hidden — they're a real liquidity signal.
