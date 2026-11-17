# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Korean express bus (Kobus) seat availability checker. Users submit monitoring jobs; background workers periodically query Kobus's timetable JSON (via Axios) and notify a dedicated Telegram group when seats become available. The app does not require login.

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
├── features/     # User-facing features: check-bus-seats
├── widgets/      # Composite components: search-panel
├── shared/       # Cross-cutting: db (Prisma), queue (BullMQ), Telegram, utils, UI
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
3. Job logic in `src/workers/jobs/check-bus-seats.ts` queries the Kobus timetable JSON for the target date
4. Job history tracked in `JobHistory` table via Prisma

### API Routes

- `/api/terminals` — Bus terminals list
- `/api/areas` — Area codes
- `/api/destinations` — Destination lookup
- `/api/schedules/times` — Departure times for a route on a date (live Kobus lookup)
- `/api/queue/job` — Submit a seat monitoring job
- `/api/jobs/history` — Job history

### Kobus Data Sources

- **Areas/terminals/routes:** `readRotLinInf.ajax`, synced weekly (Mon 03:00 KST) by the maintenance worker; route tables are replaced in a transaction.
- **Departure times and seats:** the timetable JSON `oprninf/alcninqr/readAlcnSrch.ajax` (session cookie from `oprnAlcnPage.do` required), read by `src/shared/lib/kobus-schedules.ts` and shared by the times API and the seat worker. Every bus counts, including sold-out (`ALCN_CHC=cnt0`) and departing-soon (`time0`); seats are `RMN_SATS_NUM`. The JSON has no via-stop field, so via locations are not collected.
- `scsYn=Y` with zero buses (e.g. holiday dates before sale opens) is a valid empty answer and is not cached. Other `scsYn` values (past date, beyond the sale window, unknown route) raise `KobusScheduleUnavailableError`; `rotVldChc=F` (no session) or an unexpected shape is an error, never "no seats".
- `bus_schedules` is a weekly D+2 snapshot used only when the live lookup fails; the UI labels it as possibly inaccurate. Its `is_via_route`/`via_location` columns are no longer written.

### Infrastructure

- **Database:** MySQL 8.0 via Prisma ORM
- **Queue:** BullMQ backed by Redis
- **Notifications:** Telegram Bot API group messages
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
