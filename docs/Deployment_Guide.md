# Deployment Guide

> **Local setup and environment variables live here.** For how a release
> actually reaches production — the tag-triggered pipeline, the post-deploy
> health gate, automatic and manual rollback, and on-call alerting — see
> [DEPLOYMENT.md](./DEPLOYMENT.md). For backups and database recovery, see
> [DISASTER_RECOVERY.md](./DISASTER_RECOVERY.md).

## Prerequisites
- Node 20+
- npm 10+
- Docker and Docker Compose

## Local Development Setup
1. Clone the repository.
2. Run `./scripts/setup-dev.sh` to install dependencies and create `.env` files.
3. Start frontend apps: `npm run dev` in their respective directories.
4. Start backend services using Docker Compose, from the repository root. The root
   `docker-compose.yml` is the single authoritative compose file (all 33 services plus the
   API Gateway); the files under `backend/infrastructure/docker/` are stale and cannot build.
   ```bash
   npm run docker:up
   ```
   For datastores and observability only, without the application services:
   ```bash
   npm run docker:infra
   ```

## Running all services manually
Alternatively, you can run `npm run dev` in each service's directory.

## Environment Variables
Each service expects specific environment variables. Use `setup-dev.sh` to copy `.env.example` into `.env`.

## Production Deployment on AWS/GCP
Use the provided Kubernetes configurations:
```bash
kubectl apply -f backend/infrastructure/kubernetes/deployments/
kubectl apply -f backend/infrastructure/kubernetes/services/
kubectl apply -f backend/infrastructure/kubernetes/ingress/
```
