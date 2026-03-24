#!/usr/bin/env bash
set -euo pipefail

# Simple VPS deploy script (run on the VPS)
# Assumes:
# - repo cloned on the VPS
# - docker + docker compose installed

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

COMPOSE_ENV_ARGS=()
if [[ -f ".env.local" ]]; then
  COMPOSE_ENV_ARGS+=(--env-file .env.local)
fi

echo "[deploy] pulling latest main..."
git fetch origin
git checkout main
git pull --ff-only

echo "[deploy] building + starting via docker compose..."
docker compose "${COMPOSE_ENV_ARGS[@]}" build --no-cache
docker compose "${COMPOSE_ENV_ARGS[@]}" up -d

echo "[deploy] status:"
docker compose "${COMPOSE_ENV_ARGS[@]}" ps
