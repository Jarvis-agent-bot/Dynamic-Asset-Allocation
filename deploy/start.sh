#!/usr/bin/env bash
set -euo pipefail

# Simple VPS deploy script (run on the VPS)
# Assumes:
# - repo cloned on the VPS
# - docker + docker compose installed

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "[deploy] pulling latest main..."
git fetch origin
git checkout main
git pull --ff-only

echo "[deploy] building + starting via docker compose..."
docker compose build --no-cache
docker compose up -d

echo "[deploy] status:"
docker compose ps
