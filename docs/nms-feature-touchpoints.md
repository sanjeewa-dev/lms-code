# NMS feature touchpoints (5-feature port)

Emails introduced or used by password reset, paid materials (no email), school (no email), slip replace (no email), and per-student fee reminders. All tenant-scoped sends use `dispatchCommunication` from `backend/src/services/nmsClient.ts`.

## 1. Password reset

| Field | Value |
| --- | --- |
| **When sent** | After `POST /auth/forgot-password` finds exactly one eligible user and issues a reset token |
| **Caller** | `sendPasswordResetEmail` in `backend/src/services/email.ts` via `requestPasswordReset` in `backend/src/services/passwordReset.ts` |
| **templateId** | `auth.password_reset` |
| **relatedType** | `password_reset` |
| **relatedId** | User id |
| **content** | `{ instituteName, resetUrl, expiresInHours: '1' }` |
| **header** | `{ subjectLine: "Reset your {instituteName} password" }` |
| **receivers** | Single user `{ name, email }` |

### Superadmin / null `tenantId`

NMS JWT signing requires a `tenantId`. When the user has no tenant (platform superadmin):

- Does **not** call `dispatchCommunication`
- Falls back to SMTP `sendMail` for that edge case only
- Logs: `[password-reset] No tenantId for NMS; falling back to SMTP for superadmin password reset`

Tenant users always use NMS.

---

## 2. Per-student fee reminder

| Field | Value |
| --- | --- |
| **When sent** | Teacher/admin clicks fee reminder on class roster → `POST /classes/:classId/students/:studentId/fee-reminder` |
| **Caller** | `sendFeeReminderEmail` in `backend/src/services/email.ts` via `sendEnrollmentFeeReminder` in `backend/src/services/smartJobs.ts` |
| **Billing month** | LMS Code `currentBillingMonth()` (not Smart’s previous-month gate) |
| **templateId** | `payment.fee_reminder` |
| **relatedType** | `fee_reminder` |
| **relatedId** | `{enrollmentId}:manual:{YYYY-MM}:{timestamp}` (guardian appends `:guardian`) |
| **content** | `{ studentName, classTitle, instituteName, forMonthLabel, amountDue, paymentsUrl }` |
| **header** | `{ subjectLine: "Fee reminder: {classTitle} ({forMonthLabel})" }` (guardian: `"Parent notice: fee due for {studentName}"`) |
| **receivers** | Student email; if `guardianEmail` is set, a second NMS dispatch to the guardian |

Also creates an in-app notification (`type: general`, link `/payments`).

---

## 3–5. Features with no new NMS email

| Feature | Notes |
| --- | --- |
| **Paid materials** | Purchase / slip upload / approval use in-app notifications only |
| **School field** | Profile / invite / roster data only |
| **Slip replace** | `PATCH /payments/:paymentId/slip` updates file only; no email |

---

## Existing NMS templates (unchanged by this port)

Still used elsewhere via `dispatchCommunication`:

- `class.invite` — student class invite
- `session.live_started` — live class started / invite
- `class.enrolled` — enrolled notice
