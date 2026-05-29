#!/usr/bin/env bash
# One-shot installer / updater for a pm2-managed deployment.
#
# Required env:
#   BVB_HOME      Absolute path to this checkout                e.g. /home/user/bvb
#   BVB_WEB_ROOT  Absolute path to the subdomain doc root        e.g. /var/www/bvb
#                 (this is where nginx serves from AND where the
#                  scraper atomically writes data.json)
#
# What it does:
#   1. npm ci  (production deps)
#   2. npm run build  (TS -> dist/)
#   3. mkdir -p $BVB_WEB_ROOT and copy static assets into it
#   4. Run one forced refresh so data.json exists before the first cron tick
#
# Idempotent: re-run after `git pull` to upgrade. pm2 will pick up the
# new dist/build-data.js on its next scheduled fire without needing a
# `pm2 reload`. If you change ecosystem.config.cjs, run:
#   pm2 reload deploy/pm2/ecosystem.config.cjs --update-env

set -euo pipefail

: "${BVB_HOME:?BVB_HOME must be set (path to repo checkout)}"
: "${BVB_WEB_ROOT:?BVB_WEB_ROOT must be set (path to subdomain doc root)}"

cd "$BVB_HOME"

echo "==> Installing dependencies"
npm ci

echo "==> Building TypeScript"
npm run build

echo "==> Preparing doc root: $BVB_WEB_ROOT"
mkdir -p "$BVB_WEB_ROOT"
# Static assets — copied once per deploy. NOT data.json (the scraper
# writes it directly into BVB_WEB_ROOT).
for f in index.html sw.js manifest.json icon.svg; do
  cp "src/public/$f" "$BVB_WEB_ROOT/$f"
done

echo "==> Running initial refresh (bypassing business-hours gate)"
mkdir -p logs
BVB_OUT="$BVB_WEB_ROOT/data.json" BVB_FORCE=1 node dist/build-data.js

echo
echo "==> Done. Verify:"
echo "     ls -la $BVB_WEB_ROOT"
echo
echo "==> Next: start (or reload) the pm2 app:"
echo "     BVB_HOME=$BVB_HOME BVB_WEB_ROOT=$BVB_WEB_ROOT \\"
echo "       pm2 start deploy/pm2/ecosystem.config.cjs --update-env"
echo "     pm2 save"
echo
echo "     If this is the first time pm2 runs on the box, also run:"
echo "       pm2 startup"
echo "     and follow the printed instructions (so pm2 survives reboot)."
