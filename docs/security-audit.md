# Mindspark LMS — Security Architecture Audit

**Role:** Senior Software Security Architect  
**Date:** 1 August 2026  
**Remediation applied:** 1 August 2026  
**Scope:** Full application stack (Express/Prisma backend, React frontend, payments, AI, live video, cron/jobs)  
**Method:** Static code review and trust-boundary analysis of the current repository (evidence-based). No live exploitation against production was performed.

---

## Remediation status

| ID | Status | What changed |
|----|--------|----------------|
| C1 | Fixed | Pending PayHere payment bound to `orderId` + class price; IPN rejects underpayment |
| C2 | Fixed | Production refuses weak/missing JWT & cron secrets |
| H1 | Fixed | HTTPS SSRF allowlist before video proxy fetch |
| H2 | Fixed | Refresh re-validates user/tenant status |
| H3 | Fixed | Separate `JWT_WATCH_SECRET` + `typ` claims |
| H4 | Fixed | Hashed, single-use parent magic links |
| H5 | Fixed | Teacher AI monthly quota (`AiStaffUsage`) |
| H6 | Fixed | Superadmin needs live support session + token hash |
| H7 | Partial | Refresh httpOnly cookie; access still in `localStorage` |
| M1–M14 | Fixed | Cron, revoke-on-password, Helmet, uploads, invites, quotas, recording URL, sandbox, Jitsi, rate limits, etc. |
| M15 / L2 / L4 | Accepted residual | Documented / by design / ops follow-up |
| L1 / L5 / L6 | Fixed | JWT algorithms, superadmin-as-admin, batches staff-only |

**Deploy checklist:** set strong `JWT_*` + `CRON_SECRET` (≥32 chars), `JWT_WATCH_SECRET`, `PAYHERE_SANDBOX=false` for live, Jitsi app credentials in production, restart API, have users re-login.

---

## 1. Executive summary

The platform has a solid multi-tenant foundation (AsyncLocalStorage + Prisma tenant stamping, enrollment gates, PayHere MD5 signature checks, bcrypt passwords, invite entropy). The remediation pass completed on 1 August 2026 fixed the Critical/High code findings (payments, secrets, SSRF, sessions, parent links, AI quotas, support gating, Helmet/uploads). Residual risk is mainly access-token XSS exposure, query-string tokens, and infrastructure/SCA outside this repo.

| Priority | Issue | Status |
|----------|--------|--------|
| P0 | PayHere underpayment unlock | **Fixed** |
| P0 | Weak JWT/cron defaults in production | **Fixed** |
| P1 | Video stream SSRF | **Fixed** |
| P1 | Refresh without status checks | **Fixed** |
| P1 | Watch JWT = access JWT | **Fixed** |
| P1 | Reusable parent magic links | **Fixed** |
| Residual | Access JWT in `localStorage` | Partial (refresh cookie done) |

**Verdict:** Code-level P0/P1 controls are in place. Production readiness still requires strong env secrets, live PayHere/Jitsi configuration, and operational hardening (MFA, SCA, WAF).

---

## 2. Scope and methodology

### In scope

- Authentication / JWT / refresh / password flows  
- Multi-tenant isolation and role authorization  
- Payments (slip + PayHere), uploads, materials, video streaming  
- Cron/jobs, AI routes, parent trust links, Jitsi live  
- Frontend token storage and route guards  
- Config / `.env.example` defaults  

### Out of scope (follow-up)

- Infrastructure (WAF, TLS termination, DB network ACLs)  
- Dependency CVE scanning (`npm audit` / SCA) as a continuous pipeline  
- Penetration testing of a running staging environment  
- Social engineering / physical security  

### Trust boundaries reviewed

```
Browser / Parent email
    → Public API (tenant landing, PayHere notify, parent report, cron)
    → Authenticated tenant API (/api/t/:slug)
    → Platform superadmin API
    → Prisma (tenant-scoped vs basePrisma)
    → Local/object file storage
    → PayHere, Anthropic, Jitsi, SMTP
```

---

## 3. Positive controls (keep)

| Control | Evidence |
|---------|----------|
| Tenant query isolation | `backend/src/lib/prisma.ts` injects `tenantId` on WHERE/create via ALS |
| Tenant route stack | resolve → authenticate → `requireTenantMatch` → enter context |
| Password hashing + complexity | bcrypt cost 10; shared password schema |
| Invite token entropy | `crypto.randomBytes(32)` |
| Support session token hashing | SHA-256 `tokenHash` + audit logs |
| PayHere signature + merchant check | `services/payhere.ts` |
| Slip payment amount not client-trusted | Server uses class price for slips |
| Path traversal hardening | `storage.ts` uses `path.basename(storageKey)` |
| Material access + PDF watermark | Enrollment gate; `Cache-Control: private, no-store` |
| Auth rate limits | `express-rate-limit` on login/register |
| Public video URLs stripped | Public tenant list omits `videoUrl` |
| PayHere secret masked in settings | Returns `••••••••` |
| Frontend XSS posture | Notices/events/chat as React text (not `dangerouslySetInnerHTML`) |
| SQL injection posture | No string-built SQL; health uses tagged `$queryRaw` |
| Enrollment gates on live/content | `requireActiveEnrollment` patterns |

---

## 4. Findings

### Critical

#### C1 — PayHere IPN trusts paid amount (underpayment unlocks access)

- **Location:** `backend/src/services/payhere.ts` (~96–147); checkout init in `backend/src/routes/payments.ts`
- **Description:** After signature verification, the handler records `body.payhere_amount` and may activate the enrollment. It does **not** compare the paid amount to `enrollment.class.price`. Slip uploads correctly ignore client amount; online path does not.
- **Exploit scenario:** Student reduces checkout amount before submit. PayHere charges the lower amount, signs the notify payload, LMS verifies MD5, approves payment, and activates enrollment.
- **Solution:**
  1. Reject unless paid amount equals expected class price (strict decimal/currency compare).
  2. At checkout init, create a server-side pending payment (or order) with expected `amount`, `enrollmentId`, `forMonth`; bind `order_id` to that row.
  3. On IPN, load by `order_id` / pending id; ignore `custom_*` as sole source of truth for amount.
- **Improvement:** Reconciliation job (daily) comparing PayHere settlements vs LMS approved totals; alert on amount mismatches.

#### C2 — JWT and cron secrets fall back to known defaults

- **Location:** `backend/src/config/env.ts` (~18–35); `.env.example`
- **Description:** Missing `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` default to `dev-access-secret` / `dev-refresh-secret`. `CRON_SECRET` defaults to `dev-cron-secret`.
- **Exploit scenario:** Misconfigured production boot → forge access tokens for any user, or call `/api/cron/*` with the known secret and run cross-tenant jobs.
- **Solution:**
  1. In `production`, throw on missing secrets or equality with known defaults.
  2. Enforce minimum length/entropy (e.g. ≥32 random bytes).
  3. Rotate any secrets that may have been deployed with defaults.
- **Improvement:** Startup health check that refuses to listen until secrets pass policy; document rotation runbook.

---

### High

#### H1 — SSRF via video stream proxy (`provider: 'url'`)

- **Location:** `backend/src/routes/features.ts` (~429–463); `videoUrl` validated only as `z.string().url()`
- **Description:** Authenticated stream handler `fetch`es the stored URL (including private IPs / cloud metadata). Teachers/admins can set URLs; `visibility: 'all'` widens who can trigger the fetch.
- **Exploit scenario:** Staff (or compromised account) sets `videoUrl` to `http://169.254.169.254/...` or an internal service; streaming returns internal content to the attacker.
- **Solution:** Allowlist `https` only; block private/link-local/metadata CIDRs; optional domain allowlist; prefer signed CDN URLs or direct client playback instead of server proxy.
- **Improvement:** Egress firewall for the API host; SSRF regression tests.

#### H2 — Refresh issues tokens without re-checking account or tenant status

- **Location:** `backend/src/routes/auth.ts` (~83–109)
- **Description:** Refresh verifies JWT + DB refresh row and that the user exists. It does **not** re-check `user.status`, `tenant.isActive`, or password presence (login does).
- **Exploit scenario:** Rejected/inactivated users or deactivated institutes keep renewing access for up to refresh TTL (~7d).
- **Solution:** Apply the same gates as login on refresh; on status change / tenant deactivate / password change, `deleteMany` refresh tokens for affected users.
- **Improvement:** Central `assertUserMayAuthenticate(user)` used by login, refresh, and support flows.

#### H3 — Watch tokens share the access-token secret

- **Location:** `backend/src/lib/jwt.ts`; `middleware/auth.ts`; video watch issuance in `features.ts`
- **Description:** Watch JWTs are signed/verified with `env.jwt.accessSecret`. A leaked watch query token verifies under `verifyAccessToken` and may authorize broader tenant API reads depending on claim shape and handlers.
- **Exploit scenario:** Student shares a stream URL; attacker uses the watch JWT as `Authorization: Bearer` on tenant routes.
- **Solution:** Dedicated watch secret; require `typ: 'watch'` (and pin `algorithms: ['HS256']`); `authenticate` must reject tokens without expected access claims; never accept watch tokens on general APIs.
- **Improvement:** Short TTL + one-time or cookie-bound stream sessions.

#### H4 — Parent magic links are reusable until expiry

- **Location:** `backend/src/services/parentTrust.ts` (~90–101)
- **Description:** `usedAt` is set on first open but never enforced. Strong 32-byte token, 48h TTL; report includes student email, attendance, quiz, payment summary. Token stored plaintext in DB.
- **Exploit scenario:** Forwarded email, browser history, proxy logs, or Referer leak → repeated access for 48 hours.
- **Solution:** Reject when `usedAt` is set (or short idle window after first use); store only token hashes; prefer one-time exchange for a short httpOnly session cookie.
- **Improvement:** Strip unnecessary PII from the report; audit every view.

#### H5 — Teacher AI endpoints have no usage quota / rate limit

- **Location:** `backend/src/routes/aiTeacher.ts`, `services/aiTeacher.ts` (contrast student `requireQuotaThenRun`)
- **Description:** Teacher tools call Anthropic with role/class checks only—no monthly token budget, no route rate limit.
- **Exploit scenario:** Abusive or compromised teacher/admin loops quiz generation and exhausts Anthropic budget.
- **Solution:** Per-tenant/per-teacher monthly caps; user/IP rate limits; hard daily spend ceiling; reuse or extend `aiUsage`.
- **Improvement:** Cost dashboards + alerts already partially present for platform ops—wire teacher usage into them.

#### H6 — Support / superadmin is god-mode (audit UX, not API gate)

- **Location:** `middleware/tenant.ts`; `services/supportSession.ts`; frontend `guards.tsx`
- **Description:** Any `superadmin` can hit any tenant slug. Ending a support session is not an API authorization boundary; frontend `lms_support_meta` is forgeable and not enforced server-side.
- **Exploit scenario:** Compromised superadmin credentials = immediate cross-tenant access (by design today).
- **Solution:** If product intent is gated support: require an active `SupportSession`, verify `tokenHash`, revoke on end. Document clearly if intentional break-glass remains.
- **Improvement:** Step-up MFA for superadmin; just-in-time elevation with reason + ticket id (already partially modeled).

#### H7 — Access/refresh tokens in `localStorage`

- **Location:** `frontend/src/api/client.ts`, `AuthContext.tsx`
- **Description:** Bearer tokens in `localStorage`. Any XSS (or malicious extension) steals full session. CORS uses credentials but auth is header-based.
- **Exploit scenario:** Future XSS or third-party script → account takeover for access TTL + refresh window.
- **Solution:** Prefer httpOnly + Secure + SameSite cookies for refresh; keep access short-lived; tighten CSP.
- **Improvement:** Periodic token binding / device sessions list for users.

---

### Medium

#### M1 — Cron secret accepted via query string; non-constant-time compare

- **Location:** `backend/src/routes/cron.ts` (~10–14)
- **Solution:** Header-only (`x-cron-secret`); `crypto.timingSafeEqual`; reject defaults in production (see C2).

#### M2 — Password change does not revoke refresh tokens

- **Location:** `backend/src/routes/profile.ts`; platform self-password path  
  (Override path in `platform.ts` correctly deletes refresh tokens.)
- **Solution:** Always `refreshToken.deleteMany({ userId })` after password updates.

#### M3 — No Helmet / global security headers; limited rate limiting

- **Location:** `backend/src/app.ts`
- **Solution:** Add Helmet (`nosniff`, frameguard, referrer-policy); rate-limit AI, uploads, parent-report, PayHere notify.

#### M4 — Upload MIME trusted from client (no magic-byte validation)

- **Location:** `backend/src/middleware/upload.ts`, `services/files.ts`, public logo serving
- **Solution:** Validate with `file-type` / sharp; re-encode images; disallow SVG; force `X-Content-Type-Options: nosniff`.

#### M5 — Large video uploads held in memory (DoS)

- **Location:** `backend/src/middleware/upload.ts` (up to ~500MB `memoryStorage`)
- **Solution:** Stream to disk/object storage; concurrency limits; lower defaults.

#### M6 — Staff overreach within tenant (parent link / nudge / live invite)

- **Location:** `parentTrust` send, smart nudge, live invite `studentIds`
- **Solution:** Require teacher↔student active class relationship (same pattern as payment review).

#### M7 — Invite / parent / refresh tokens stored as plaintext (or full JWT)

- **Location:** invite routes, `parentTrust`, `RefreshToken` model
- **Solution:** Store hashes only (pattern already used for support `tokenHash`).

#### M8 — AI student quota TOCTOU; prompt injection surface

- **Location:** `aiStudent.ts` check-then-increment; user text concatenated into prompts
- **Solution:** Atomic conditional update for quota; delimit untrusted user text; treat model JSON as untrusted content.

#### M9 — `recordingUrl` not constrained to https

- **Location:** schedules end handler; frontend `ScheduleTab` link
- **Solution:** Zod `https` URL only; block `javascript:` / `data:`.

#### M10 — PayHere checkout hardcodes sandbox URL

- **Location:** `backend/src/routes/payments.ts` (~416–421)
- **Solution:** Drive sandbox vs live from env/tenant config; never hardcode sandbox in production.

#### M11 — Tenant login status checks incomplete for non-students

- **Location:** `backend/src/routes/tenantAuth.ts`
- **Solution:** Enforce status (and tenant active) for all roles.

#### M12 — Auth rate limit relatively permissive; refresh unlimited

- **Location:** login `max: 50` / 15m; refresh has no limiter
- **Solution:** Lower login limits; add per-email throttle; rate-limit refresh.

#### M13 — Login account-state enumeration

- **Location:** `backend/src/routes/auth.ts` distinct invite-incomplete message
- **Solution:** Uniform error text and similar timing.

#### M14 — Jitsi without app credentials → guessable open rooms

- **Location:** `services/jitsi.ts`, `.env.example`
- **Solution:** Require JWT in production; non-guessable room names; refuse to start live if unset.

#### M15 — Prisma scoped client does not constrain `findUnique` / bare id updates

- **Location:** `backend/src/lib/prisma.ts` (documented)
- **Solution:** Lint/review rule: prefer `findFirst` + tenant; extend hooks where feasible.

---

### Low / Info

| ID | Finding | Direction |
|----|---------|-----------|
| L1 | JWT verify lacks explicit `algorithms` / `typ` | Pin HS256; add claim types |
| L2 | Frontend role guards are UX-only | Keep; never rely on them for security |
| L3 | Parent / watch tokens in query strings | Prefer POST exchange or Authorization header |
| L4 | In-process schedulers without leader election | Fine for single node; add lock for multi-replica |
| L5 | `requireRole('admin')` inconsistently excludes superadmin | Align role arrays intentionally |
| L6 | Students can list all batches | Low sensitivity; tighten if needed |

---

## 5. Prioritized remediation roadmap

### Sprint 0 — before production payments (P0)

1. **C1** Bind PayHere amount to server-side expected price / pending order.  
2. **C2** Fail closed on JWT/cron secrets in production; rotate if defaults ever used.  
3. Smoke-test: underpayment IPN rejected; missing secrets refuse boot.

### Sprint 1 — session & token hardening (P1)

4. **H2 / M2** Refresh status gates + revoke refresh on password/status/tenant deactivate.  
5. **H3** Separate watch JWT crypto + reject wrong `typ` in `authenticate`.  
6. **H4 / M7** One-time parent links + hash tokens at rest.  
7. **H1** SSRF allowlist / stop blind `fetch(videoUrl)`.

### Sprint 2 — abuse & browser posture (P2)

8. **H5 / M3 / M12** Teacher AI quotas + Helmet + broader rate limits.  
9. **M4 / M5** Upload magic-byte validation + stream large files.  
10. **H7** Move refresh to httpOnly cookies (phased).  
11. **M10 / M14** PayHere live/sandbox config + Jitsi JWT required in prod.  
12. **H6** Document or enforce support-session gate for superadmin.

### Continuous improvements

- Dependency SCA in CI (`npm audit` / Dependabot / similar).  
- Security regression tests for tenant isolation, payment amount binding, watch-token rejection.  
- Structured audit log retention for payments, support sessions, parent link views.  
- Threat model update when adding new public endpoints or AI tools.

---

## 6. Residual risk

After remediation:

- Access tokens remain in `localStorage` (refresh is httpOnly) — XSS can still steal short-lived access JWTs.  
- Superadmin break-glass remains high-impact if credentials leak (MFA recommended).  
- Prompt injection cannot be fully eliminated for LLM features; mitigate with quotas, monitoring, and no privileged tools bound to model output.  
- Infrastructure misconfiguration (open DB, weak SMTP, public upload bucket) and dependency SCA are outside this code audit.  
- Prisma `findUnique` is still not auto-scoped — rely on review discipline / prefer `findFirst`.

---

## 7. How to re-run this audit

Use the project skill **senior-security-architect** (`.cursor/skills/senior-security-architect/SKILL.md`):

> “Run a senior security architect audit of the LMS and update `docs/security-audit.md`.”

Focus follow-ups on payment, auth refresh, SSRF, and secret boot paths after remediations land.

---

*Prepared from static analysis of the Mindspark LMS monorepo. Findings cite observed code behavior; severities assume a reachable production API with real PayHere / Anthropic / Jitsi configuration where applicable.*
