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
- **Departure times and seats:** the timetable JSON `oprninf/alcninqr/readAlcnSrch.ajax` (session cookie from `oprnAlcnPage.do` required), read by `src/shared/lib/kobus-schedules.ts` and shared by the times API and the seat worker. Every bus counts, including sold-out (`ALCN_CHC=cnt0`) and departing-soon (`time0`); seats are `RMN_SATS_NUM`. The JSON has no via-stop field, so via locations are not collected. The `deprDtm` date is built from `formatToParts`, never by trimming a localized date string (Next dev produced `2026/11/21`).
- `scsYn=Y` with zero buses (e.g. holiday dates before sale opens) is a valid empty answer and is not cached. Other `scsYn` values (past date, beyond the sale window, unknown route) raise `KobusScheduleUnavailableError`; `rotVldChc=F` raises `KobusSessionError` (the worker renews its shared session once); an unexpected shape is an error that names the first mismatched field. None of these mean "no seats".
- If the live lookup fails the times API returns 502. There is no timetable fallback: the weekly `bus_schedules` crawl was removed on 2026-11-17 (table and its rows are kept; the worker deletes the retired `update-schedules` repeatable on start).

### Monitoring

- A job targets exact departure times (`targetTimes`) or a departure-time range (`targetTimeRange`, inclusive, `24:00` = midnight), never both. A range covers buses added later (holiday extra buses) and dates whose sale has not opened yet.
- The worker checks every `JOB_CHECK_INTERVAL_MS` (1 minute) until the last target time (`getMonitoringDeadlineKST`). Each check stores `last_checked_at`, the check result, and clears `error` on success.
- Telegram sends retry 3 times (5xx/429/network). If seats were found but the alert failed, the job keeps running with `notify_status=failed` and resends on the next check. A job completes only after an alert is sent, unless `keep_watching`: then it keeps checking and alerts again only for departures that newly have seats; it ends with `MONITORING_ENDED`.
- `src/workers/kobus-health.ts` sends an admin Telegram alert after 5 consecutive integration failures across jobs (date/route refusals excluded) and when lookups recover; the maintenance worker alerts when the weekly route sync fails.

### Monitoring UI

- The time selection API includes per-time remaining-seat totals, sold-out/departing-soon flags, and `checkedAt` (preserved by the 1-minute cache). A time is sold out only if every bus at that time is unavailable.
- Time/terminal selection keys responses by request, so late responses for old conditions are ignored. Changing the date clears selected times.
- History shows the last check time and result for running jobs, the latest check error, the alert count, and seats found for completed jobs. No automatic booking is performed.
- Registration uses toasts. Failed registration preserves form choices; only success resets the form. Past target times are rejected (400).

### Infrastructure

- **Database:** MySQL 8.0 via Prisma ORM
- **Queue:** BullMQ backed by Redis
- **Notifications:** Telegram Bot API group messages
- **Styling:** Tailwind CSS v4
- **Path alias:** `@/*` → `./src/*`

### Docker

- `docker-compose.dev.yml` — Local dev with live reload, uses `.env.local`
- `docker-compose.prod.yml` — Reference copy of the operator-owned server compose (`/srv/kobusCheckSeats/docker-compose.yml`); images come from `KOBUS_APP_IMAGE`/`KOBUS_WORKER_IMAGE` in the server `.env`, worker count from `KOBUS_WORKER_REPLICAS` (default 1). Changes here are not deployed automatically; the operator syncs the server copy.
- `Dockerfile` — Multi-stage; separate `prod-app` and `prod-worker` targets
- `entrypoint.app.sh` — Runs `prisma migrate deploy` before starting app
- `entrypoint.worker.sh` — Runs `prisma generate` before starting worker

### CI/CD

GitHub Actions (`.github/workflows/deploy.yml`) on pull requests and pushes to `main`:
1. `verify`: `npm ci`, `prisma generate`, lint, `tsc --noEmit`, tests, `next build`.
2. `image`: builds `ghcr.io/donggunlim/kobuscheckseat-app:<sha>` and `ghcr.io/donggunlim/kobuscheckseat-worker:<sha>` (revision label = commit); pushed only from `main`.
3. `deploy` (`main` only): sends `deploy <sha>` over a restricted key to node-01, where the shared homeserver-deploy gate (adapter `services/kobuscheckseats/adapter.sh`) pulls and label-checks both images, backs up the `kobus` MySQL database, smoke-tests candidates privately (pending Prisma migrations stop the old app/worker first and are applied by the candidate), switches both images together and verifies; a failure after cutover restores the previous images (never the database).
