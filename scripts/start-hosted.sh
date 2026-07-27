#!/bin/sh
set -eu

if [ -n "${DATABASE_URL:-}" ]; then
  node scripts/migrate.mjs
fi

if [ -n "${PROMPTS_DIR:-}" ] && [ "$PROMPTS_DIR" != "/app/packages/prompts" ]; then
  mkdir -p "$PROMPTS_DIR"
  if [ ! -f "$PROMPTS_DIR/registry.json" ]; then
    cp -R /app/packages/prompts/. "$PROMPTS_DIR/"
  fi
fi

exec node services/api/dist/server.js
