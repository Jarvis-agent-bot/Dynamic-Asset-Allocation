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
- Default port: 3000 (map it behind Nginx if needed)
- No qlib / AI secrets are required for the v0 framework.
