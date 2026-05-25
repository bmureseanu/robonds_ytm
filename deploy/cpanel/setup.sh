#!/usr/bin/env bash
# One-shot installer for a cPanel host. Runs over SSH. Idempotent — safe to
# re-run to upgrade after a `git pull`.
#
# Expected env:
#   BVB_HOME      Where the repo lives                  e.g. /home/user/bvb
#   BVB_WEB_ROOT  Subdomain doc root for static assets  e.g. /home/user/bvb.friend.com
#   NODE_BIN      (optional) Absolute path to `node`
#
# What it does:
#   1. npm ci  (production deps + tsx for the build script)
#   2. npm run build  (TS -> dist/)
#   3. Copies index.html, sw.js, manifest.json, icon.svg into BVB_WEB_ROOT
#   4. Runs one initial refresh so data.json exists
#
# Idempotent: re-run after `git pull` to redeploy.

set -euo pipefail

: "${BVB_HOME:?BVB_HOME must be set}"
: "${BVB_WEB_ROOT:?BVB_WEB_ROOT must be set}"
NODE_BIN="${NODE_BIN:-node}"

cd "$BVB_HOME"
mkdir -p "$BVB_WEB_ROOT"

echo "==> Installing dependencies"
npm ci

echo "==> Building TypeScript"
npm run build

echo "==> Copying static assets to $BVB_WEB_ROOT"
# Copy each static asset deterministically. We deliberately do not copy
# data.json from the repo — the cron will write a fresh one straight to
# the doc root.
for f in index.html sw.js manifest.json icon.svg; do
  cp "src/public/$f" "$BVB_WEB_ROOT/$f"
done

echo "==> Running initial refresh"
BVB_FORCE=1 BVB_HOME="$BVB_HOME" BVB_WEB_ROOT="$BVB_WEB_ROOT" \
  NODE_BIN="$NODE_BIN" bash deploy/cpanel/refresh.sh

echo
echo "Done. Verify:"
echo "  ls -la $BVB_WEB_ROOT"
echo
echo "Now add a cron entry in cPanel (replace placeholders):"
echo "  5,20,35,50 7-16 * * 1-5 BVB_HOME=$BVB_HOME BVB_WEB_ROOT=$BVB_WEB_ROOT NODE_BIN=$NODE_BIN bash $BVB_HOME/deploy/cpanel/refresh.sh"
