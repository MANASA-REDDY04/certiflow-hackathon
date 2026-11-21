# CertiFlow — Technical Interview Q&A & Architecture Defense Guide

This guide is designed for technical interviews, system design rounds, and code walkthroughs for the CertiFlow project. It covers technical choices, deep architectural trade-offs, edge cases, failure modes, and code-level answers.

---

## 1. Tech Stack Defense: Why This Stack?

### Q1: Why Next.js 14 instead of plain React with Vite?
* **Answer:**
  1. **Built-in Route & State Structure:** Next.js 14 App Router allowed building the main dashboard, candidate tables, and public verification portal (`/verify`) within one consistent project structure.
  2. **Persona Switching & Isolated State:** Testing government workflows requires testing multiple personas (Training Centre, District Officers, Quality QA, State Office). Next.js made it easy to structure a unified persona switcher that instantly exchanges JWT sessions without managing complex client-side routers or external auth providers.
  3. **Zero Configuration for Production:** Next.js comes with built-in production optimizations, script loading, and server component capabilities for edge verification.

### Q2: Why Fastify 4 instead of Express?
* **Answer:**
  1. **Throughput & Overhead:** Fastify is significantly faster than Express (often 2x–3x higher req/sec) due to its internal Radix Tree router (`find-my-way`) and optimized JSON serialization via `fast-json-stringify`.
  2. **Schema-Driven Validation:** Fastify provides native integration with schema validation (Zod / JSON Schema), automatically validating and serializing payloads before route handlers execute.
  3. **Modern Plugin Architecture:** Clean encapsulation for JWT authentication (`@fastify/jwt`), security headers (`@fastify/helmet`), rate limiting (`@fastify/rate-limit`), and multipart uploads (`@fastify/multipart`) with zero middleware pollution.

### Q3: Why plain PostgreSQL in Docker instead of hosted Supabase?
* **Answer:**
  1. **Zero External Dependencies / True Fresh-Clone Experience:** Anyone evaluating the code or running tests can run `docker compose up` without creating a cloud account, setting up third-party API keys, or facing cloud network latency.
  2. **ACID Transactions & Explicit Row Locks:** We needed native PostgreSQL capabilities — specifically `SELECT ... FOR UPDATE` row locks, composite unique constraints, sequence generators, and custom `BEFORE UPDATE OR DELETE` triggers for immutable audit logs.
  3. **Migration Compatibility:** We structured migrations in standard SQL under `supabase/migrations/` so they remain 100% portable if migrating to hosted Supabase in production.

### Q4: Why pg-boss instead of BullMQ, RabbitMQ, or Kafka?
* **Answer:**
  1. **Zero Extra Infrastructure:** pg-boss uses PostgreSQL itself as the job queue storage engine (in a separate `pgboss` schema). There is no need to deploy and manage a separate Redis queue instance or Kafka broker.
  2. **Transactional Durability:** Jobs survive worker crashes and server restarts because they are committed to Postgres tables with full persistence.
  3. **Deduplication & Exponential Backoff:** Native support for singleton job keys (preventing duplicate certificate issuance jobs) and automatic retry backoff.
  4. **Trade-off:** For massive enterprise throughput (>50,000 jobs/sec), a dedicated broker like Kafka is preferred. But for our peak load of 500 batches/hour (~30,000 PDFs/hr or ~8.3 jobs/sec), pg-boss handles the load effortlessly with zero operational overhead.

### Q5: Why Redis Pub/Sub + Server-Sent Events (SSE) instead of WebSockets?
* **Answer:**
  1. **Unidirectional vs Bidirectional:** The requirement is strictly server-to-client: pushing real-time workflow status updates and queue changes when an officer votes. The client never sends workflow commands through the socket; actions go through standard authenticated REST endpoints.
  2. **Simpler Protocol:** SSE runs over standard HTTP, natively handles automatic reconnection with event IDs, and avoids WebSocket handshake, firewall, and reverse-proxy protocol upgrade issues.
  3. **Horizontal Scaling:** When multiple API instances run behind a load balancer, publishing an event to Redis channel `certiflow:events` broadcasts it across all API nodes, ensuring all connected SSE clients receive real-time updates regardless of which node they connected to.

### Q6: Why PDFKit & QRCode over Headless Chrome (Puppeteer / Playwright)?
* **Answer:**
  1. **Memory & CPU Footprint:** Headless Chrome instances consume 150MB–300MB of RAM per tab and take seconds to cold-start. PDFKit is a lightweight Node.js streaming library running directly in process, consuming only a few megabytes.
  2. **Speed:** Generating an A4 landscape certificate with custom fonts, border vector graphics, and embedded QR code takes ~20–40ms in PDFKit versus 500–1200ms in Puppeteer.
  3. **Predictability:** Fixed programmatic vector layouts never suffer from CSS print rendering inconsistencies or font-rendering glitches across different operating system environments.

---

## 2. Core Architecture & Concurrency Questions

### Q7: How did you solve race conditions when two district officers approve simultaneously?
* **The Problem:**
  District approval requires a quorum of 2 distinct officers from the batch's district. If Dev and Meera submit their approval decisions at the exact same millisecond:
  - Both requests could read `approved_count = 0`.
  - Both record an approval.
  - Both might conclude they are the second approval and attempt to advance the batch status, resulting in duplicate transitions, race conditions, or broken event streams.
* **The Solution:**
  1. **Row-Level Lock (`SELECT ... FOR UPDATE`):** The approval state machine executes inside a single database transaction. It begins by locking the specific batch row with `SELECT * FROM batches WHERE id = $1 FOR UPDATE`. This forces simultaneous transactions to serialize; one acquires the lock, while the other waits.
  2. **Composite Unique Constraint:** The `approvals` table has a constraint: `UNIQUE (batch_id, round, step, officer_id)`. Even if an officer attempts to double-click or submit concurrent votes, the second insert fails with a 409 Conflict.
  3. **Fresh Quorum Evaluation:** Once inside the locked transaction, the code queries the count of distinct approved officers for that round. The first officer brings count to 1 (batch stays in `district_review`). The second officer brings count to 2, meeting quorum and advancing the status to `quality_review` (if $\ge 50$ candidates) or `state_review`.

### Q8: What happens when a batch is rejected vs sent back?
* **Answer:**
  * **Rejection (`status = 'rejected'`):** Strictly terminal. The batch cannot be edited, reviewed, or resubmitted. Any subsequent decision call returns a `409 Conflict`.
  * **Send-Back (`status = 'sent_back'`):** A recoverable revision loop.
    1. A mandatory reason of $\ge 5$ characters must be provided by the reviewer.
    2. The batch returns to the Training Centre persona (`Anika`).
    3. The Training Centre can update candidates and call `POST /api/batches/:id/resubmit`.
    4. Resubmitting increments the batch's `round` counter (e.g. Round 1 $\to$ Round 2) and resets the status to `district_review`.
    5. **Critical design choice:** Prior round approvals are **not deleted**; they remain permanently in the database scoped by `round = 1` for audit history, but they do not count toward Round 2's quorum. Both district officers must review and approve the revised batch anew.

### Q9: How do you guarantee idempotency in certificate issuance and WhatsApp delivery?
* **Answer:**
  1. **Certificate Creation:** `findOrCreateCertificate` uses an upsert query:
     ```sql
     INSERT INTO certificates (id, batch_id, candidate_id, course_name, cert_number, verify_code, status)
     VALUES ($1, $2, $3, $4, nextval('cert_number_seq'), $5, 'valid')
     ON CONFLICT (candidate_id, course_name)
     DO UPDATE SET updated_at = now()
     RETURNING *;
     ```
     Even if an issuance job runs multiple times (e.g., worker retry), duplicate certificates are impossible.
  2. **WhatsApp Dispatch:** The API generates an `idempotency_key` (hash of candidate ID, cert ID, and round) and stores it in the `deliveries` table before dispatching. The Mock WhatsApp server checks incoming `X-Idempotency-Key` headers: if already processed, it returns the cached response rather than sending duplicate messages to the candidate.

### Q10: How does the public verification system work, and how is caching invalidated?
* **Answer:**
  1. **Minimal PII Exposure:** The public endpoint (`GET /api/certificates/verify/:code`) returns only: masked candidate name (e.g., `R**** S****`), course title, issue date, cert number, and validity status. Phone numbers, scores, and national IDs are strictly excluded.
  2. **Redis Read Caching:** Successful lookups are cached in Redis with a 120-second TTL (`cert:verify:<verify_code>`). Invalid lookups are cached for 30 seconds to prevent database hammering during bursts.
  3. **Immediate Cache Busting on Revocation:** When the State Office cancels a certificate (`POST /api/certificates/:id/cancel` with a mandatory reason), the system marks the database record as `cancelled` and **synchronously executes `redis.del(cacheKey)`**. Subsequent public verification requests immediately hit the database and reflect the revoked status.

### Q11: How is the audit log protected from tampering?
* **Answer:**
  In a high-stakes government platform, an administrator or developer should never be able to alter approval logs. In migration 2 (`002_audit_and_escalation.sql`), we attached a PostgreSQL trigger to the `audit_log` table:
  ```sql
  CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
  RETURNS TRIGGER AS $$
  BEGIN
    RAISE EXCEPTION 'audit_log rows are immutable: UPDATE and DELETE are prohibited';
  END;
  $$ LANGUAGE plpgsql;

  CREATE TRIGGER trg_audit_log_immutable
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();
  ```
  Any SQL `UPDATE` or `DELETE` query will be aborted by the database engine itself.

---

## 3. Scale, Failure Scenarios & Production Readiness

### Q12: How would this architecture handle 500 batches (~30,000 certificates) in 1 hour?
* **The Math:**
  * 30,000 certificates / 3,600 seconds $\approx$ **8.3 PDFs/second** and **8.3 WhatsApp messages/second**.
  * At sudden burst (all 500 batches submitted in a 10-minute window): 30,000 / 600s $\approx$ **50 PDFs/sec**.
* **Bottleneck Analysis & Mitigation:**
  1. **PDF Generation (CPU Bound):** Generating a PDF with PDFKit takes ~25ms. A single worker thread generates ~10–15 PDFs/sec. A pool of 4–6 worker instances easily meets 50 PDFs/sec.
  2. **WhatsApp Provider Rate Limits (I/O Bound):** WhatsApp Business APIs typically cap dispatches (e.g. Meta limits tiers to 80–250 msg/sec per number). At 8.3 msg/sec sustained, a single provider connection is well within limits.
  3. **Database Write Throughput:** Each issuance creates 3 database writes (1 cert, 1 delivery insert, 1 delivery update) $\to$ ~25 writes/sec sustained, ~150 writes/sec burst. PostgreSQL on a standard 4-vCPU instance easily handles 1,500+ writes/sec with a connection pooler like `pgBouncer`.

### Q13: What happens if the WhatsApp provider suffers an outage?
* **Answer:**
  1. When the API or worker calls the WhatsApp endpoint and receives a 503 Outage or 504 Gateway Timeout, the individual delivery record in the `deliveries` table is marked as `failed` with the error message.
  2. The overall batch approval is **not blocked or rolled back** — once approved by the State Office, the legal approval and certificate records remain valid.
  3. The pg-boss job handler catches the delivery failure and allows pg-boss to retry the job using exponential backoff.
  4. In the mock WhatsApp server (`:4001`), an interactive toggle ("Total Provider Outage" / "Delivered but Timed Out") is built in specifically to demonstrate this resilience during live evaluation.

### Q14: What happens if the worker process crashes in the middle of processing a batch?
* **Answer:**
  1. pg-boss uses a visibility timeout mechanism. If a worker crashes mid-task, the job lock expires, and pg-boss marks the job as available for pickup.
  2. When the worker restarts or another worker instance polls the queue, it resumes the job.
  3. Because `findOrCreateCertificate` uses idempotent `ON CONFLICT` statements and delivery rows use idempotency keys, re-running the job for the same candidates never generates duplicate certificate numbers or sends duplicate messages.

---

## 4. Honest Project Defense: Bugs & Limitations

### Q15: What are the known limitations in your current submission?
* **Answer (Be honest and specific):**
  1. **Database Row-Level Security (RLS):** Authorization is currently enforced at the application layer by verifying signed JWT claims in Fastify pre-handlers. Database RLS policies are not yet enabled in the PostgreSQL schema.
  2. **Local Storage vs Cloud Storage:** Certificate PDFs are written to local container storage (`storage/private/certificates/`). In production, this must be swapped for Amazon S3 or Google Cloud Storage with private pre-signed URLs.
  3. **Mock Provider:** WhatsApp delivery is currently integrated with our local Fastify mock server rather than a production Meta Cloud API or Twilio credentials.
  4. **Single District Seed Data:** Current seed data populates Central District with 3 officers; testing multi-district routing requires adding records for additional districts.

### Q16: What was the most interesting bug you debugged in this project?
* **Answer:**
  * **The Stepper Mapping Out-of-Bounds Bug:**
    In the frontend status stepper, the workflow steps were indexed 0 to 5 (6 steps total). The status `issued` was returning index `6` in the helper function, causing the array lookup to go out of bounds and fail to render the completed checkmarks. Additionally, `submitted` was falling through to index 2 (`district_review`), skipping the visual `Submitted` step. Fixing the index offset and explicitly handling the completed `issued` state restored accurate visual progress across all roles.

---

## 5. 60-Second Elevator Pitch

> *"CertiFlow is a multi-tier governance platform for skills training certifications. It solves certificate fraud and review bottlenecks by taking training batches through a strict state machine: training centers submit trainee rosters; district review requires a quorum of two independent officers from that district; batches with 50 or more candidates trigger an automated quality review; and the state office gives final authorization. Upon approval, it automatically generates tamper-proof PDF certificates with individual QR codes, computes SHA-256 hashes, and delivers them directly to candidates' phones via WhatsApp. The entire system is built on TypeScript, Fastify, Next.js, PostgreSQL with row-level locks, and Redis for real-time SSE updates and public verification caching."*
