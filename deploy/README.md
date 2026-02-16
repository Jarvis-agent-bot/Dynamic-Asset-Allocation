# VPS Deployment (Docker)

This project can be deployed to a VPS using Docker.

## Prerequisites
- A VPS with Docker + Docker Compose v2 installed
- This repo cloned on the VPS

## Start / Update
```bash
chmod +x deploy/start.sh
./deploy/start.sh
```

It will pull latest `main`, build the image, and restart the service.

## Notes
- Web (Next.js): 127.0.0.1:3000
- Python engine (FastAPI): 127.0.0.1:18000
- Suggested Nginx routing:
  - `/daa/` → http://127.0.0.1:3000/daa/
  - `/daa-api/` → http://127.0.0.1:18000/
  - `/api/daa/` → http://127.0.0.1:3000/api/daa/ (Next.js API routes used by Step4/5)
- No qlib / AI secrets are required for the v0 framework.

## DAA API Auth (FastAPI)
The Python engine includes a legacy passwordless (email magic-link) auth flow.
In the current epoch, public `/api/daa/*` is owned by Next.js and FastAPI public
`/api/daa/*` handlers are disabled by default (`DAA_ENABLE_FASTAPI_PUBLIC_DAA_ROUTES=0`).

Env vars (legacy/optional):
- `DAA_ADMIN_EDITOR_EMAILS`: comma-separated allowlist (editor role)
- `DAA_ADMIN_VIEWER_EMAILS`: comma-separated allowlist (viewer role)
- `RESEND_API_KEY`: Resend API key
- `DAA_AUTH_EMAIL_FROM`: sender (e.g. `DAA <no-reply@your-domain>`)
- `DAA_AUTH_PUBLIC_BASE_URL`: public base URL for the engine, e.g. `https://exwxyzi.cn/daa-api`
- Optional: `DAA_AUTH_COOKIE_NAME` (default: `daa_api_session`)
- Optional (legacy override): `DAA_ENABLE_FASTAPI_PUBLIC_DAA_ROUTES=1`
