#!/usr/bin/env bash
# Refresh script invoked by cPanel cron. Idempotent and safe to run
# concurrently — uses a per-host lockfile.
#
# Expected env (set in the cron line or in a wrapper):
#   BVB_HOME      Absolute path to this checkout                e.g. /home/user/bvb
#   BVB_WEB_ROOT  Absolute path to the subdomain doc root        e.g. /home/user/bvb.friend.com
#   NODE_BIN      (optional) Absolute path to `node`             e.g. /home/user/nodevenv/bvb/20/bin/node
#                 If unset, falls back to `node` on PATH.
#
# What it does:
#   1. cd into BVB_HOME.
#   2. Runs the local-time gate (Mon-Fri 10:00–18:00 Europe/Bucharest).
#   3. Writes data.json directly into BVB_WEB_ROOT (atomic rename inside).
#   4. Logs to BVB_HOME/cron.log.
#
# Static assets (index.html, sw.js, etc.) are NOT copied here — those are
# installed once during setup. This script only refreshes data.json.

set -euo pipefail

: "${BVB_HOME:?BVB_HOME must be set (path to repo checkout)}"
: "${BVB_WEB_ROOT:?BVB_WEB_ROOT must be set (path to subdomain doc root)}"
NODE_BIN="${NODE_BIN:-node}"

cd "$BVB_HOME"
LOG="$BVB_HOME/cron.log"

# Portable mutual exclusion: `mkdir` is atomic on POSIX filesystems, so we
# treat the existence of LOCK_DIR as "another refresh is running". This works
# on Linux/macOS without depending on flock(1) (which isn't on macOS).
LOCK_DIR="$BVB_HOME/.refresh.lock.d"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  # Stale lock? If the dir is older than 5 min, assume the previous run died.
  if find "$LOCK_DIR" -maxdepth 0 -mmin +5 >/dev/null 2>&1; then
    echo "$(date -u +%FT%TZ) stale lock detected, removing" >> "$LOG"
    rm -rf "$LOCK_DIR"
    mkdir "$LOCK_DIR"
  else
    echo "$(date -u +%FT%TZ) another refresh is running, skipping" >> "$LOG"
    exit 0
  fi
fi
trap 'rm -rf "$LOCK_DIR"' EXIT

# Bucharest business-hours gate. Skip silently outside the window so cPanel's
# cron output emails don't pile up. Set BVB_FORCE=1 to bypass.
if [ "${BVB_FORCE:-0}" != "1" ]; then
  export TZ=Europe/Bucharest
  DOW=$(date +%u)
  HOUR=$(date +%H)
  if [ "$DOW" -gt 5 ] || [ "$((10#$HOUR))" -lt 10 ] || [ "$((10#$HOUR))" -ge 18 ]; then
    echo "$(date -u +%FT%TZ) outside Bucharest business hours (DOW=$DOW H=$HOUR); skipping" >> "$LOG"
    exit 0
  fi
fi

mkdir -p "$BVB_WEB_ROOT"
BVB_OUT="$BVB_WEB_ROOT/data.json" "$NODE_BIN" dist/build-data.js \
  >> "$LOG" 2>&1
