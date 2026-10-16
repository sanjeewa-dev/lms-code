# LMS load performance report

Closed-loop ramps against a local Express + Prisma + PostgreSQL stack, tenant `ictpasidu`, **29 Sep 2026**. Login tokens were reused so the 10/15-minute auth limiter is not in the numbers.

| Item | Value |
| --- | --- |
| Baseline | 1 Node process on `http://localhost:4000` |
| Cluster verify | 4 workers on `http://localhost:4001` |
| Client timeouts | 20 s (reads), 30 s (writes) |
| Scripts | `scripts/load-test.mjs`, `scripts/write-load-test.mjs` |

**Headline:** Reads no longer cliff at 50 concurrent users (p95 **3.4 s** on 4 workers vs **10.8 s** on one process). Writes stay usable through **100 concurrent users with no timeouts**. At **3,000 concurrent writers** this laptop still times out: 4 workers with `maxConnections` 500 paused accept, and the same Postgres was already serving the original API on `:4000`. Designed capacity is 8 workers × 1,000 connections; that configuration was **not re-measured**.

| Metric | Result |
| --- | --- |
| Peak read throughput | **170 rps** (1 process, 10 VU) |
| Clustered read p95 at 50 VU | **3.4 s** (was 10.8 s) |
| Clustered writes at 100 VU | **0 timeouts** |
| Timeouts at 3,000 VU (4 workers) | **99.9%** |

---

## Read path

Mixed dashboard, quiz analytics, classes, student home, public landing, and health. Closed-loop: each virtual user issues the next request as soon as the previous finishes.

### p95 latency vs concurrent users

| VU | 1 process p95 | 4-worker p95 |
| ---: | ---: | ---: |
| 1 | 68 ms | 279 ms |
| 5 | 251 ms | 491 ms |
| 10 | 115 ms | 456 ms |
| 25 | 448 ms | 2.2 s |
| 50 | **10.8 s** | **3.4 s** |
| 80 | 2.8 s | 5.2 s |
| 120 | 1.1 s | 6.3 s |

The 10.8 s spike at 50 VU is the single-process event-loop stall. On 4 workers that hang is gone; health stays around 1.4 s instead of tracking the 10 s stall.

### Throughput and errors

| VU | 1p rps | 1p errors | 4w rps | 4w errors |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 29.9 | 0% | 9.3 | 0% |
| 5 | 62.2 | 0% | 23.6 | 0% |
| 10 | **169.9** | 0% | 48.6 | 0% |
| 25 | 107.7 | 0% | 35.6 | 0.94% |
| 50 | 40.8 | 0.82% | 39.8 | 2.18% |
| 80 | 81.7 | 0% | 40.9 | 2.93% |
| 120 | 177.1 | 0% | 47.3 | 3.67% |

- Baseline: **9,134** requests (00:41–00:43 UTC on `:4000`). Failures at 50 VU were 5 client TypeErrors during the stall.
- Cluster: **3,394** requests (02:10–02:12 UTC on `:4001`). Failures from 25 VU are HTTP 500s (Prisma pool / P1001).
- Cluster throughput is lower because the 4-worker API **shared Postgres** with the still-running `:4000` process.

### Heaviest read endpoints at 50 VU (the old cliff)

| Endpoint | 1 process p95 | 4-worker p95 |
| --- | ---: | ---: |
| `GET /quiz-analytics` | 11,248 ms | 4,170 ms |
| `GET /me/todo` | 11,080 ms | 4,779 ms |
| `GET /classes/:id/quizzes` | 11,040 ms | 7,565 ms |
| `GET /stats` | 10,797 ms | 6,419 ms |
| `GET /api/health` | 10,480 ms | 1,352 ms |

Comfortable single-process zone is **1–10 VU**. Cluster removes the 50 VU hang but does not beat recovered single-process 120 VU on this shared laptop Postgres.

---

## Write path

Mix: quiz start/submit, student and teacher uploads, chat, attendance, profile writes, notifications, AI routes. `ANTHROPIC_API_KEY` unset (400 “unavailable” is expected). Rate limits were disabled for these ramps. Quiz 409s are business conflicts after each student has submitted, not crashes.

### 1 process — 10 to 3,000 VU

7,734 attempts on `:4000`.

| VU | Requests | Success rps | p50 | p95 | OK | Dominant failure |
| ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 10 | 118 | 8.2 | 138 ms | 4.6 s | 83% | 4xx (AI / validation) |
| 50 | 449 | 26.3 | 663 ms | 6.2 s | 70% | 4xx + 409 |
| 100 | 609 | **33.3** | 1.4 s | 6.7 s | 66% | 4xx + 409 + AI |
| 500 | 544 | 23.3 | 13.6 s | 15.0 s | 43% | AI unavailable + 4xx |
| 1,000 | 1,014 | 52.1 | 20.0 s | 21.8 s | 41% | slow 4xx / AI / 409 |
| 2,000 | 2,000 | 3.8 | 32.4 s | 33.0 s | 1.5% | 1,932 timeouts |
| 3,000 | 3,000 | 1.5 | 31.2 s | 32.5 s | 0.4% | 2,988 timeouts |

From 2,000 VU the p50 sits on the 30 s timeout ceiling. Started rps at 2,000+ is in-flight pile-up, not completed work. Peak successful writes: ~33/s at 100 VU, ~52/s at 1,000 VU before collapse.

Outcome mix (share of requests):

| VU | HTTP 2xx | 409 quiz | Other 4xx / AI | Timeout |
| ---: | ---: | ---: | ---: | ---: |
| 10 | 83.05% | 0.85% | 16.1% | 0% |
| 50 | 70.16% | 7.13% | 22.72% | 0% |
| 100 | 65.68% | 12.81% | 21.51% | 0% |
| 500 | 42.83% | 11.03% | 46.14% | 0% |
| 1,000 | 41.12% | 15.19% | 43.69% | 0% |
| 2,000 | 1.5% | 0% | 1.9% | **96.6%** |
| 3,000 | 0.4% | 0% | 0% | **99.6%** |

### 4-worker cluster checkpoints

Same script, `http://localhost:4001`. 100 and 500 VU ran while the cluster was up. 3,000 VU ran while `maxConnections` was still **500** (later raised to **1,000**).

| VU | 1p OK | 1p p95 | 1p timeouts | 4w OK | 4w p95 | 4w timeouts |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 66% | 6.7 s | 0 | 55% | 16.1 s | **0** |
| 500 | 43% | 15.0 s | 0 | 33% | 28.6 s | 11 |
| 3,000 | 0.4% | 32.5 s | 2,988 | 0.06% | 47.0 s | 1,772 |

- **100 VU:** 196 req · 108 OK · 31 AI unavailable · 49 client 4xx · 7 conflict · 1 server · **no timeouts**.
- **500 VU:** 501 req · 167 OK · 71 AI unavailable · 89 client · 5 conflict · 158 server · 11 timeout.
- **3,000 VU:** 1,773 req · 1 OK · 1,772 timeouts.

---

## What this means

| Question | Measured answer |
| --- | --- |
| Can 10 people browse at once? | Yes. 1 process: 170 rps, p95 115 ms, 0 errors. Comfortable. |
| Does 50 concurrent readers hang the API? | On 1 process, yes (p95 10.8 s, health also stalled). On 4 workers, no hang — p95 3.4 s, health 1.4 s. |
| Can ~100 people submit quizzes / chat / upload together? | Yes without client timeouts. Success share ~55–66%; rest is 409, AI 400, or validation. p95 is several seconds. |
| Can 500 people write at once on this laptop? | Partially. ~1/3 succeed; p95 15–29 s. Cluster added 11 timeouts and 158 server errors on a shared Postgres. |
| Does 3,000 concurrent writes work yet? | No on the 4-worker verify. Almost every request hit the 30 s timeout. 8 workers + `maxConnections` 1,000 was not re-run. |

---

## Test conditions

Both APIs used the same local Postgres. The clustered verify ran on `:4001` while `:4000` was still serving traffic, so pool and disk contention is higher than a dedicated 8-worker box.

Rate limits were raised or disabled for the ramps. `ANTHROPIC_API_KEY` was unset, so AI POSTs return 400 after quota reservation — those still cost DB time.

Designed cluster defaults after the capacity work:

- `WEB_CONCURRENCY=8`
- Prisma `connection_limit=25`
- Postgres `max_connections=300`
- In-flight cap 400/worker (503 + Retry-After)
- `maxConnections` 1,000/worker

Daily `npm run dev` remains a single process. Capacity mode is compiled `npm run start` (or Docker Compose).

### How to rerun

```bash
# Reads (clustered local start on :4000)
cd backend && npm run build && WEB_CONCURRENCY=8 npm run start
# other terminal:
node scripts/load-test.mjs --base http://localhost:4000

# Writes (one stage)
node scripts/write-load-test.mjs --base http://localhost:4000 --only vu3000
```

Results write to `scripts/load-test-results.json` and `scripts/write-load-test-results.json`. Restore `API_RATE_LIMIT_MAX` / `AUTH_RATE_LIMIT_MAX` after a run if you overrode them.
