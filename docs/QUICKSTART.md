# Quickstart

This repo is a Next.js (App Router) app with a testable TypeScript core, plus an optional Python engine.

## Local dev

```bash
pnpm install
pnpm dev
```

Open:
- http://localhost:3000/daa/
- http://localhost:3000/daa/dashboard/

## CI gates (recommended)

```bash
pnpm test
pnpm run typecheck
pnpm build
```

## First deploy (VPS/Docker)

See: [deploy/README.md](../deploy/README.md)

After your first deploy, set a build SHA env var so the dashboard can display version info:

- `NEXT_PUBLIC_BUILD_SHA` (full git SHA)

## Admin bootstrap (fresh deployment)

If there are zero DAA admin accounts, the dashboard will prompt for bootstrap.

You will need:
- server env `DAA_AUTH_BOOTSTRAP_TOKEN`
- request header `x-daa-bootstrap-token` (the same token)

Then use `/api/daa/auth/bootstrap` to create the first admin (example via curl):

```bash
export DAA_AUTH_BOOTSTRAP_TOKEN="..."

curl -sS -X POST "https://YOUR_DOMAIN/api/daa/auth/bootstrap" \
  -H "accept: application/json" \
  -H "content-type: application/json" \
  -H "x-daa-bootstrap-token: $DAA_AUTH_BOOTSTRAP_TOKEN" \
  --data-binary @- <<'JSON'
{"username":"admin@example.com","password":"YOUR_PASSWORD"}
JSON
```
