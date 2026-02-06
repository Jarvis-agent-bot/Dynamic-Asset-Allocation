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
- No qlib / AI secrets are required for the v0 framework.
