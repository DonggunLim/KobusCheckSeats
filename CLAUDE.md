# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Korean express bus (Kobus) seat availability checker. Users submit monitoring jobs; background workers periodically scrape the Kobus website (via Cheerio/Axios) and notify when seats become available. Auth is via Kakao OAuth (NextAuth v5).

## Commands

```bash
# Development (requires Docker)
docker compose -f docker-compose.dev.yml up -d --build

# Individual processes
npm run dev          # Next.js dev server
npm run worker:dev   # Background job worker (watch mode)
npm run worker       # Background job worker (production)

# Database
npm run db:check-routes    # Update bus route master data
npm run db:check-schedule  # Update route schedules
npx prisma migrate dev     # Run migrations
npx prisma generate        # Regenerate Prisma client

# Production build
npm run build
npm run start
```

## Architecture

### Feature-Sliced Design (FSD)

```
src/
├── app/          # Next.js App Router pages + API routes
├── entities/     # Domain models: bus-route, job-history (api/model/ui per entity)
├── features/     # User-facing features: check-bus-seats, signin-kakao
├── widgets/      # Composite components: search-panel
├── shared/       # Cross-cutting: auth, db (Prisma), queue (BullMQ), utils, UI
└── workers/      # BullMQ worker processes (run separately from Next.js)
```

### Two Separate Processes

The app runs as **two independent Node.js processes**:
1. **Next.js server** (`npm run dev` / `npm run start`) — handles web requests
2. **Worker process** (`npm run worker`) — processes BullMQ jobs from Redis

In Docker Compose, these are separate services sharing the same network. Workers can be scaled independently (`--scale worker=N`).

### Job Flow

1. User submits a seat check job → `POST /api/queue/job` → BullMQ enqueues in Redis
2. `src/workers/check-seats.worker.ts` picks up jobs
3. Job logic in `src/workers/jobs/check-bus-seats.ts` scrapes Kobus via Cheerio
4. Job history tracked in `JobHistory` table via Prisma

### API Routes

- `/api/auth/[...nextauth]` — Kakao OAuth (NextAuth v5)
- `/api/terminals` — Bus terminals list
- `/api/areas` — Area codes
- `/api/destinations` — Destination lookup
- `/api/schedules/times` — Available departure times for a route
- `/api/queue/job` — Submit a seat monitoring job
- `/api/jobs/history` — User's job history

### Infrastructure

- **Database:** MySQL 8.0 via Prisma ORM
- **Queue:** BullMQ backed by Redis
- **Auth:** NextAuth v5 beta with Prisma adapter
- **Styling:** Tailwind CSS v4
- **Path alias:** `@/*` → `./src/*`

### Docker

- `docker-compose.dev.yml` — Local dev with live reload, uses `.env.local`
- `docker-compose.prod.yml` — Production, pulls images from GHCR
- `Dockerfile` — Multi-stage; separate `prod-app` and `prod-worker` targets
- `entrypoint.app.sh` — Runs `prisma migrate deploy` before starting app
- `entrypoint.worker.sh` — Runs `prisma generate` before starting worker

### CI/CD

GitHub Actions (`.github/workflows/deploy.yml`) triggers on push to `main`:
1. Builds and pushes two Docker images to GHCR (`app-latest`, `worker-latest`)
2. SSH deploys to home server at `/srv/kobusCheckSeats`
