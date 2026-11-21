# CertiFlow 🎓

> Robust Certificate Issuance Platform for a Fictional Skills Programme.

---

## 🏗️ Architecture & Monorepo Structure

CertiFlow is structured as an all-inclusive monorepo with 4 dedicated application services plus data infrastructure:

```
certiflow/
├── docker-compose.yml          # Single-command orchestration for all 6 services
├── .env.example                # Sample environment configuration
├── supabase/
│   └── migrations/
│       ├── 20260101000000_init_schema.sql  # DDL with append-only audit trigger & constraints
│       └── 20260101000001_seed_data.sql    # Seeded personas (Anika, Dev, Meera, Kabir, Neha, Farah)
├── api/                        # Node.js + Fastify + TypeScript API
│   ├── src/
│   │   ├── config/env.ts       # Strict Zod environment validation
│   │   ├── db/                 # Postgres connection pool & migration runner
│   │   ├── policies/can.ts     # Central policy function can(user, action, batch)
│   │   ├── plugins/auth.ts     # JWT token validation & authorization decorator
│   │   ├── routes/health.ts    # Liveness & readiness endpoints
│   │   ├── routes/auth.ts      # Switchable user login & JWT generator
│   │   └── server.ts           # Fastify setup (Helmet, RateLimit via Redis, CORS, Pino)
├── worker/                     # Background job processor (pg-boss + Node.js)
├── mock-whatsapp/              # Mock WhatsApp delivery webhook service
└── web/                        # Next.js 14 frontend with switchable login UI
```

---

## 👥 Seeded Personas

Six personas are seeded directly into the database. Passwords are intentionally omitted for frictionless persona switching:

| Persona | Role | District | Centre | Email |
| :--- | :--- | :--- | :--- | :--- |
| **Anika** | `training_centre` | Central District | Apex Skills Training Centre | `anika@certiflow.local` |
| **Dev** | `district_officer` | Central District | — | `dev@certiflow.local` |
| **Meera** | `district_officer` | Central District | — | `meera@certiflow.local` |
| **Kabir** | `district_officer` | Central District | — | `kabir@certiflow.local` |
| **Neha** | `quality_team` | State-level | — | `neha@certiflow.local` |
| **Farah** | `state_office` | State-level | — | `farah@certiflow.local` |

> 📌 **Note:** Dev, Meera, and Kabir are colleagues in the **same district** (`Central District`), demonstrating multi-officer district reviews.

---

## 🛡️ Security & Policy Enforcement

1. **Token-Only Role & District Source of Truth**:
   - The server extracts `role`, `district_id`, and `centre_id` **EXCLUSIVELY from the verified JWT payload**.
   - Mutating request bodies are strictly validated with Zod (`.strict()`) and forbidden from injecting roles or districts.
2. **Central Policy Engine `can(user, action, batch)`**:
   - Every mutating route checks permissions through `can(request.user, action, batch)`.
   - Training centres can only touch batches for their own centre.
   - District officers can only act on submitted batches within their assigned district.
   - Quality team and State office enforce progressive stage transitions (`submitted` → `district_approved` → `quality_approved` → `state_approved`).
3. **Append-Only Audit Log**:
   - The `audit_log` table is guarded by a PostgreSQL trigger function (`prevent_audit_log_modification`) that raises an exception on any `UPDATE` or `DELETE`.
4. **Database Sequences & Constraints**:
   - Unique certificate numbers auto-generated from sequence `cert_number_seq`.
   - UNIQUE candidate + course constraints.
   - UNIQUE `(batch_id, round, step, officer_id)` constraint on `approvals`.
5. **Fastify Hardening**:
   - `@fastify/helmet` for secure HTTP headers.
   - `@fastify/rate-limit` backed by Redis for distributed rate-limiting.
   - Strict CORS configuration for authorized frontend origins.
   - Pino structured logging with `x-request-id` / unique UUID tracing.

---

## 🚀 Quickstart with Docker Compose

Everything runs with a single command:

```bash
docker compose up --build
```

### Services Breakdown:
- **web**: `http://localhost:3000` (Next.js Dashboard & Persona Switcher)
- **api**: `http://localhost:4000` (Fastify Backend)
  - `GET /health` (API health status)
  - `GET /health/ready` (DB & Redis connection check)
  - `GET /api/auth/users` (List seeded users)
  - `POST /api/auth/login` (Login user & sign JWT)
  - `GET /api/auth/me` (Protected route reading claims from JWT)
- **worker**: Background worker running `pg-boss`
- **postgres**: PostgreSQL 16 on port `5432` with auto-executed migrations
- **redis**: Redis 7 on port `6379`
- **mock-whatsapp**: `http://localhost:4001`
