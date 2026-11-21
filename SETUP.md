# CertiFlow — Setup Guide

Exact steps from a fresh clone to a running system with demo data and passing tests.

---

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 20 or later | Required for all workspaces |
| npm | 10 or later | Comes with Node 20 |
| Docker Desktop | Latest stable | Required for PostgreSQL, Redis, pgweb, and all containers |
| Git | Any | — |

---

## 1. Clone and Install

```bash
git clone https://github.com/MANASA-REDDY04/certiflow-hackathon.git certiflow
cd certiflow
npm install
```

This installs packages for all workspaces (`web`, `api`, `worker`, `mock-whatsapp`).

---

## 2. Environment Setup

```bash
cp .env.example .env
```

The `.env.example` has working defaults for local development. No changes are needed to run the demo.

Key variables and their defaults:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `4000` | Fastify API port |
| `DATABASE_URL` | `postgres://postgres:postgres@localhost:5432/certiflow` | PostgreSQL connection |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection |
| `JWT_SECRET` | `super-secret-jwt-key-certiflow-2026` | Token signing — change in production |
| `JWT_EXPIRES_IN` | `1d` | Token lifetime |
| `MOCK_WHATSAPP_PORT` | `4001` | Mock WhatsApp server port |
| `MOCK_WHATSAPP_URL` | `http://localhost:4001` | Where the API sends WhatsApp messages |
| `QUALITY_REVIEW_THRESHOLD` | `50` | Candidates ≥ this triggers Quality QA step |
| `ESCALATION_REMINDER_SECONDS` | `15` | SLA reminder delay (demo: seconds; production: set to 86400) |
| `ESCALATION_STATE_SECONDS` | `30` | State-escalation delay (demo: seconds; production: set to 172800) |
| `RATE_LIMIT_MAX` | `100` | Requests per window per IP |
| `CORS_ORIGIN` | `http://localhost:3000,http://127.0.0.1:3000` | Allowed origins |

---

## 3. Start the System

### Option A — Docker Compose (recommended, runs everything)

```bash
docker compose up --build
```

This starts seven containers: `postgres`, `redis`, `api` (port 4000), `web` (port 3000), `worker`, `mock-whatsapp` (port 4001), and `db-viewer` (port 8080).

Migrations run automatically when the `api` container starts. Seed data is loaded on first start if tables are empty.

Skip to **Service URLs** once all containers are healthy.

### Option B — Local Node.js dev servers (faster code iteration)

Start only infrastructure via Docker:

```bash
docker compose up postgres redis db-viewer
```

Then open four terminals:

```bash
# Terminal 1 — API (port 4000; runs migrations and seed on start)
npm run dev:api

# Terminal 2 — Web (port 3000)
npm run dev:web

# Terminal 3 — Mock WhatsApp (port 4001)
npm run dev:mock

# Terminal 4 — Worker (optional; needed for pg-boss job processing)
npm run dev:worker
```

> **Important:** Without the worker, the pg-boss `certificate-issuance` queue accumulates but nothing processes. Certificates are still issued inline by the API for small batches in demo mode, so the worker is optional for the basic demo flow.

---

## 4. Migrations and Seed Data

Migrations run automatically when the API starts (via `runMigrations()` in the API startup code). They create all tables, constraints, the `pgboss` schema, and the append-only audit trigger.

Seed data is loaded automatically on first API start if the tables are empty. It creates:

- 1 district: **Central District**
- 1 training centre: **Apex Skills**
- 6 demo users (see table in section 6)

To load seed data manually while the postgres container is running:

```bash
docker exec -i certiflow-postgres-1 psql -U postgres -d certiflow < supabase/seed_data.sql
```

---

## 5. Service URLs

| Service | URL | Notes |
|---|---|---|
| Web (frontend) | http://localhost:3000 | Next.js — persona switcher at the top of the page |
| API root | http://localhost:4000 | Returns service info JSON |
| Swagger UI | http://localhost:4000/docs | Interactive API explorer |
| OpenAPI spec | http://localhost:4000/openapi.json | — |
| Mock WhatsApp inbox | http://localhost:4001 | Phone inbox UI; auto-refreshes every 3 s |
| DB Viewer (pgweb) | http://localhost:8080 | Read-only database browser; requires Docker |
| Liveness | http://localhost:4000/healthz | Always 200 if the process is up |
| Readiness | http://localhost:4000/readyz | 503 if DB or Redis is down |
| SSE stream | http://localhost:4000/api/events/stream | Requires JWT token as `?token=` query param |

---

## 6. Demo Users

| Name | Role | District / Centre | Used for |
|---|---|---|---|
| Anika Sharma | `training_centre` | Apex Skills | Creating batches, uploading candidates, submitting |
| Dev Patel | `district_officer` | Central District | First district approval |
| Meera Nair | `district_officer` | Central District | Second district approval (completes quorum) |
| Kabir Khan | `district_officer` | Central District | Optional third district officer |
| Neha Gupta | `quality_team` | — | Quality QA approval (large batches only) |
| Farah Siddiqui | `state_office` | — | Final approval, certificate issuance, cancel |

Switch personas using the **persona switcher** at the top of the web UI at http://localhost:3000. The JWT is exchanged automatically on each switch.

---

## 7. End-to-End Demo — The 6 Moments

Work through these in order using the persona switcher on the web UI.

### Moment 1 — Training Centre Creates and Submits a Batch

1. Switch to **Anika** (training_centre).
2. Click **+ New Batch** and enter a course name (e.g. "Data Foundations").
3. Click **Upload Candidates** and upload a CSV or XLSX file.

   Minimum CSV format:
   ```csv
   name,phone,score
   Alice Kumar,9876543210,88
   Bob Singh,9876543211,74
   ```

   Use fewer than 50 rows to skip Quality QA, or 50+ rows to trigger it.

4. Click **Submit for District Review**.
5. Batch status changes to `district_review`.

### Moment 2 — First District Officer Approves

1. Switch to **Dev** (district_officer).
2. The batch appears in the **Officer Queue** tab.
3. Click **Review & Decide** → Approve.
4. Status stays at `district_review` (quorum of 2 not yet met).

### Moment 3 — Second District Officer Approves (Quorum Met)

1. Switch to **Meera** (district_officer).
2. Click **Review & Decide** → Approve.
3. If batch has ≥ 50 candidates, status advances to `quality_review`. Otherwise it goes directly to `state_review`.

### Moment 4 — Quality QA (only if batch has ≥ 50 candidates)

1. Switch to **Neha** (quality_team).
2. The batch appears in her queue.
3. Click **Review & Decide** → Approve.
4. Status advances to `state_review`.

### Moment 5 — State Office Final Approval and Certificate Issuance

1. Switch to **Farah** (state_office).
2. The batch appears in her queue.
3. Click **Review & Decide** → Approve.
4. The API issues certificates inline: generates PDFs, records them in the DB, and sends WhatsApp messages to the mock inbox.
5. Batch status changes to `issued`.

### Moment 6 — Verify a Certificate and View WhatsApp Delivery

1. Open http://localhost:4001 to see the mock WhatsApp inbox. Each candidate should have a message with cert number and a download link.
2. Copy a `verify_code` from the DB viewer at http://localhost:8080 (table: `certificates`, column: `verify_code`), or from the candidates table in the UI.
3. Open http://localhost:3000/verify and enter the code.
4. The public verifier shows the masked name, course, issue date, and cert number. No PII is exposed.

---

## 8. Run Tests

```bash
# From the repo root
npm --workspace=@certiflow/api test

# Or from inside the api directory
cd api
npm test
```

There are 25 tests across 4 files:

| File | What it covers |
|---|---|
| `approvalWorkflow.test.ts` | State machine, quorum, concurrent approvals, district checks, send-back/resubmit |
| `certificateIssuance.test.ts` | Idempotent issuance, cancel + cache bust, download token |
| `escalationAndTrace.test.ts` | SLA escalation levels, trace endpoint |
| `batchCandidateParser.test.ts` | CSV/XLSX parsing, validation, formula injection, all-or-nothing |

Expected output: `25 passed`.

Tests do not require a running database or Redis. They use in-memory mocks.

---

## 9. Reset Data

### Reset everything (Docker) — wipes all DB data and starts fresh

```bash
docker compose down -v
docker compose up --build
```

The `-v` flag deletes volumes, which wipes PostgreSQL data. Migrations and seed run again on the next start.

### Reset just the mock WhatsApp inbox

Click **Clear All** in the inbox UI at http://localhost:4001, or:

```bash
curl -X DELETE http://localhost:4001/api/messages
```

### Reset certificates only (keep other data)

There is no built-in reset endpoint for certificates. Use pgweb (http://localhost:8080) or psql:

```bash
docker exec -it certiflow-postgres-1 psql -U postgres -d certiflow \
  -c "DELETE FROM deliveries; DELETE FROM certificates; UPDATE batches SET status = 'state_review';"
```

---

## 10. Troubleshooting

| Error | Likely Cause | Fix |
|---|---|---|
| `EADDRINUSE 0.0.0.0:4000` | Another process or Docker container is already on port 4000 | On Windows: `netstat -ano | findstr :4000` then `taskkill /PID <pid> /F` |
| `EADDRINUSE 0.0.0.0:4001` | The `PORT` env var is being inherited by mock-whatsapp | Ensure `MOCK_WHATSAPP_PORT=4001` is set in `.env` and `PORT` is not `4001` |
| `ECONNREFUSED 127.0.0.1:5432` | PostgreSQL is not running | Run `docker compose up postgres` or start Docker Desktop |
| `ECONNREFUSED 127.0.0.1:6379` | Redis is not running | Run `docker compose up redis` |
| `open //./pipe/dockerDesktopLinuxEngine` | Docker Desktop is not running | Start Docker Desktop from the system tray |
| `401 Unauthorized` on API calls | Missing or expired JWT | Use the persona switcher on the web UI |
| Certificates not visible in DB | Worker not running (pg-boss mode) | Start: `npm run dev:worker` |
| Batch stuck at `district_review` | Only one officer approved | Switch to a second district officer and approve |
| Quality QA step not appearing | Batch has fewer than 50 candidates | Expected. Upload ≥ 50 candidates to trigger it |
| `CORS error` in browser console | Web origin not in allowlist | Check `CORS_ORIGIN` in `.env` includes `http://localhost:3000` |
| pgweb shows no tables | Migrations have not run | Restart the API or container; migrations run on API start |
| WhatsApp messages not appearing | mock-whatsapp not running | Start: `npm run dev:mock` or `docker compose up mock-whatsapp` |
