# Mindspark LMS — Current System Architecture (High Level)

**Status:** As-built (monolith)  
**Stack:** React + Vite · Express + TypeScript · PostgreSQL + Prisma · local disk uploads  
**Related:** [architecture.md](./architecture.md) (detailed), [security-audit.md](./security-audit.md), [design.md](./design.md)

---

## 1. System context

Mindspark is a **multi-tenant SaaS LMS**. One shared application and database serve many institutes (tenants), isolated by `tenantId`. Path-based tenancy uses `/{slug}/...` in the browser and `/api/t/:slug/...` on the API.

```mermaid
flowchart TB
  subgraph actors [Actors]
    Admin["Institute admin"]
    Teacher["Teacher"]
    Student["Student"]
    SA["Platform superadmin"]
    Parent["Parent via magic link"]
    PayHere["PayHere IPN"]
    CronExt["External cron optional"]
  end

  subgraph mindspark [Mindspark platform]
    FE["Frontend SPA<br/>React · Vite"]
    API["Backend API<br/>Express · TypeScript"]
    Jobs["In-process schedulers<br/>fee reminders · digests"]
  end

  subgraph data [Data plane]
    DB[(PostgreSQL<br/>shared · row-level tenantId)]
    Disk["Local disk uploads/<br/>StorageService"]
  end

  subgraph external [External services]
    SMTP["SMTP / Nodemailer"]
    AI["Anthropic API<br/>optional OpenAI/Gemini"]
    Jitsi["Jitsi Meet"]
    PH["PayHere Checkout"]
  end

  Admin --> FE
  Teacher --> FE
  Student --> FE
  SA --> FE
  Parent --> FE
  FE -->|"/api"| API
  PayHere --> API
  CronExt --> API
  Jobs --> API
  API --> DB
  API --> Disk
  API --> SMTP
  API --> AI
  API --> Jitsi
  API --> PH
```

---

## 2. Runtime topology (development)

```mermaid
flowchart LR
  Browser["Browser"] --> Vite["Vite :5173"]
  Vite -->|"proxy /api"| Express["Express :4000"]
  Express --> PG[(PostgreSQL)]
  Express --> Uploads["uploads/"]
  Express --> Ext["SMTP · AI · Jitsi · PayHere"]
```

| Layer | Default | Source |
|-------|---------|--------|
| Frontend | `http://localhost:5173` | `frontend/` |
| Backend | `http://localhost:4000` | `backend/src/app.ts` → `index.ts` |
| Database | `DATABASE_URL` | Prisma `backend/prisma/schema.prisma` |
| Files | `UPLOAD_DIR` / `uploads/` | `backend/src/services/storage.ts` |

---

## 3. Logical building blocks

```mermaid
flowchart TB
  subgraph presentation [Presentation]
    SPA["React SPA<br/>role dashboards · tenant layouts"]
  end

  subgraph edge [API edge]
    Helmet["Helmet · CORS · rate limits"]
    AuthN["JWT authenticate"]
    TenantMW["resolveTenant · requireTenantMatch · ALS context"]
  end

  subgraph domains [Domain modules in one process]
    Identity["Auth · profile · invites · support sessions"]
    Learning["Classes · materials · videos · quizzes · gradebook"]
    LiveOps["Schedules · live · attendance"]
    Billing["Payments · PayHere · fee gating"]
    Intel["At-risk · interventions · AI student/teacher · parent trust"]
    Comms["Chat · notices · events · notifications"]
    Platform["Tenants · plans · audit · monitoring"]
  end

  subgraph platform [Cross-cutting]
    Prisma["Prisma basePrisma + scoped prisma"]
    Files["Upload · PDF watermark"]
    Mail["Email layouts + logs"]
    Cron["smartJobs · jobRuns"]
  end

  SPA --> Helmet --> AuthN --> TenantMW --> domains
  domains --> Prisma
  domains --> Files
  domains --> Mail
  Cron --> domains
```

---

## 4. API surface (high level)

```mermaid
flowchart TB
  Root["/api"]
  Root --> Health["/health"]
  Root --> Auth["/auth<br/>login · refresh · logout · me"]
  Root --> Admin["/admin<br/>superadmin platform + ops"]
  Root --> Cron["/cron<br/>x-cron-secret"]
  Root --> T["/t/:slug"]

  T --> TAuth["/auth"]
  T --> Public["/public<br/>landing · parent-report · payhere/notify"]
  T --> Inv["/invites · /admin-invites"]
  T --> App["authenticated LMS routes"]
```

**Tenant authenticated pipeline**

```mermaid
sequenceDiagram
  participant C as Client
  participant API as Express
  participant MW as Tenant middleware
  participant H as Route handler
  participant DB as PostgreSQL

  C->>API: Bearer access JWT · /api/t/{slug}/...
  API->>MW: resolveTenant(slug)
  MW->>DB: Tenant by slug
  API->>MW: authenticate JWT
  API->>MW: requireTenantMatch
  Note over MW: Superadmin needs active support session
  API->>MW: enterTenantContext ALS
  MW->>H: handler
  H->>DB: scoped Prisma queries
  H-->>C: JSON
```

---

## 5. Multi-tenancy model

| Concern | Approach |
|---------|----------|
| Routing | Path slug `/:slug` (UI) and `/api/t/:slug` (API) |
| Data isolation | Shared DB; almost all rows carry `tenantId` |
| Query enforcement | AsyncLocalStorage + Prisma extension (`backend/src/lib/prisma.ts`) |
| Cross-tenant ops | Superadmin platform routes + time-boxed **support sessions** |
| Plans | `Tenant.plan` / `planFeatures` via `planGates.ts` |

```mermaid
flowchart LR
  subgraph db [One PostgreSQL database]
    T1["tenantId = A rows"]
    T2["tenantId = B rows"]
    T3["tenantId = C rows"]
    Plat["Platform users<br/>superadmin tenantId null"]
  end
  API["Scoped prisma"] --> T1
  API --> T2
  API --> T3
  Base["basePrisma"] --> Plat
  Base --> T1
```

---

## 6. Auth & sessions (summary)

```mermaid
flowchart LR
  Login["Login"] --> Access["Access JWT ~15m<br/>Bearer header"]
  Login --> Refresh["Refresh JWT ~7d<br/>httpOnly cookie + hashed DB row"]
  Access --> API["API authorize"]
  Refresh --> Rotate["/auth/refresh"]
  Rotate --> Access
  SA["Superadmin"] --> Support["SupportSession 2h"]
  Support --> TenantAPI["Tenant routes as break-glass"]
```

Roles: `superadmin` · `admin` · `teacher` · `student`

---

## 7. Core domain map

```mermaid
erDiagram
  Tenant ||--o{ User : has
  Tenant ||--o{ Class : has
  Class ||--o{ Enrollment : has
  User ||--o{ Enrollment : student
  Enrollment ||--o{ Payment : pays
  Class ||--o{ Quiz : has
  Class ||--o{ Material : has
  Class ||--o{ VideoLesson : has
  Class ||--o{ ClassSchedule : lives
  User ||--o{ ParentToken : guardian_link
  User ||--o{ AiUsage : student_quota
  User ||--o{ AiStaffUsage : teacher_quota
```

**Major areas:** learning content, assessments, live class + attendance, payments (slip + PayHere), messaging, AI copilots, parent trust reports, platform ops.

---

## 8. Frontend structure (high level)

| Area | Path pattern | Guarding |
|------|----------------|----------|
| Platform login | `/login` | Public |
| Superadmin console | `/admin/*` | `ProtectedAdmin` |
| Tenant landing | `/:slug` | Public |
| Institute app | `/:slug/dashboard`, classes, … | `ProtectedTenant` + role routes |
| Parent report | `/:slug/parent?token=` | Magic link |

Layouts: `AdminLayout`, `TenantLayout`. API helper: `useTenantApi` → `/api/t/:slug/...`.

---

## 9. Integrations

| System | Direction | Purpose |
|--------|-----------|---------|
| PostgreSQL | Out | Primary store |
| Local disk | Out | Slips, materials, videos, logos |
| SMTP | Out | Invites, digests, live alerts |
| Anthropic | Out | AI Student Area + Teacher Copilot |
| PayHere | Out + In (IPN) | Online fees |
| Jitsi | Out (embed) | Live classrooms |
| Cron secret HTTP | In | Trigger jobs if external scheduler used |

---

## 10. Deployment shape (current)

**Today:** single Node process + Postgres + local disk (typical local/dev or one VM).

```mermaid
flowchart TB
  subgraph host [Single host or laptop]
    FE["Static SPA or Vite dev"]
    BE["One Express process"]
    PG[(Postgres)]
    Disk["uploads volume"]
  end
  FE --> BE --> PG
  BE --> Disk
```

This is a **modular monolith**: clear domain folders and route mounts, one deployable API. It is **not** microservices yet.

---

## 11. Strengths and limits of the current design

**Strengths**

- Fast to ship and reason about (one API, one schema)
- Strong tenancy hooks and role gates in one place
- Feature modules (AI, live, payments) already separated as services/routes

**Limits for large production**

- Vertical scaling only (one Node process shares CPU for uploads, AI, PDF, video proxy)
- Local disk does not survive multi-instance or serverless well
- In-process cron duplicates on multi-replica without a leader lock
- Blast radius: a bug in one domain can take down the whole API

For a target **production-grade microservices** design, see [architecture-microservices.md](./architecture-microservices.md).
