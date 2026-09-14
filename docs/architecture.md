# Mindspark LMS — Architecture

System architecture diagrams for the multi-tenant Learning Management System.

**Stack:** React + Vite (frontend) · Express + TypeScript (backend) · PostgreSQL + Prisma · local disk uploads

**Docs in this set**

| Doc | Purpose |
|-----|---------|
| [architecture-current.md](./architecture-current.md) | High-level as-built architecture (diagrams) |
| [architecture-microservices.md](./architecture-microservices.md) | Production-grade microservices target architecture |
| This file | Detailed monolith maps (API, tenancy, modules) |

---

## 1. High-level system context

```mermaid
flowchart TB
  subgraph Clients
    Browser["Browser SPA"]
    Parent["Parent (magic link)"]
    PayHereIPN["PayHere IPN"]
    Cron["Cron / scheduler"]
  end

  subgraph Platform["Mindspark Platform"]
    FE["Frontend<br/>React · Vite · :5173"]
    API["Backend API<br/>Express · TypeScript · :4000"]
    Jobs["In-process jobs<br/>fee reminders · parent digests"]
  end

  subgraph Data
    DB[(PostgreSQL<br/>shared DB · row-level tenantId)]
    Uploads["uploads/<br/>StorageService · outside web root"]
  end

  subgraph External
    SMTP["SMTP / Nodemailer"]
    AI["Anthropic API"]
    Jitsi["Jitsi Meet"]
    PayHere["PayHere Checkout"]
  end

  Browser --> FE
  Parent --> FE
  FE -->|"/api proxy"| API
  PayHereIPN --> API
  Cron --> API
  API --> DB
  API --> Uploads
  API --> SMTP
  API --> AI
  API --> Jitsi
  API --> PayHere
  Jobs --> API
```

---

## 2. Runtime topology (local / default)

```mermaid
flowchart LR
  User["User"] --> Vite["Vite :5173"]
  Vite -->|"proxy /api"| Express["Express :4000"]
  Express --> PG[(PostgreSQL)]
  Express --> Disk["uploads/"]
  Express --> Ext["SMTP · Anthropic · Jitsi · PayHere"]
```

| Component | Default | Notes |
|-----------|---------|--------|
| Frontend | `http://localhost:5173` | SPA; proxies `/api` to backend |
| Backend | `http://localhost:4000` | REST API (`createApp` in `backend/src/app.ts`) |
| Database | `DATABASE_URL` | Prisma schema push + seed |
| Uploads | `UPLOAD_DIR` / `uploads/` | Not served as static public files |

---

## 3. API surface map

```mermaid
flowchart TB
  API["/api"]

  API --> Health["/health"]
  API --> Auth["/auth<br/>login · refresh · logout · me"]
  API --> Admin["/admin<br/>superadmin platform"]
  API --> Cron["/cron<br/>CRON_SECRET"]
  API --> Tenant["/t/:slug/..."]

  Tenant --> TAuth["/auth<br/>tenant register / login"]
  Tenant --> Public["/public<br/>landing · parent-report · PayHere notify"]
  Tenant --> Invites["/invites · /admin-invites"]
  Tenant --> Authed["authenticated tenant routes"]

  Authed --> Classes["classes · roster · enroll"]
  Authed --> Learn["materials · quizzes · submissions · gradebook"]
  Authed --> Live["schedules · live · attendance"]
  Authed --> Ops["payments · settings · overview"]
  Authed --> Comms["chat · notifications · notices · events"]
  Authed --> Intel["smart · interventions · AI student · AI teacher · parent-trust"]
```

### Platform (`/api/admin`)

- Tenant provisioning, activate/deactivate
- Users, AI usage, payments rollup, audit
- Deep health, jobs, emails
- Support sessions into a tenant

### Tenant (`/api/t/:slug`)

- Full institute LMS surface after `resolveTenant` → `authenticate` → `requireTenantMatch` → `enterTenantContext`

---

## 4. Multi-tenant request pipeline

```mermaid
sequenceDiagram
  participant C as Client
  participant FE as Frontend
  participant MW as Middleware chain
  participant Ctx as AsyncLocalStorage
  participant Prisma as Scoped Prisma
  participant DB as PostgreSQL

  C->>FE: /:slug/... UI route
  FE->>MW: /api/t/:slug/... + Bearer JWT

  Note over MW: resolveTenant<br/>load Tenant by slug (basePrisma)

  Note over MW: authenticate<br/>verify access JWT → req.user

  Note over MW: requireTenantMatch<br/>JWT tenantId == path tenant<br/>(superadmin support bypass)

  Note over MW: enterTenantContext<br/>runWithContext({ tenantId, role, userId })

  MW->>Ctx: set request context
  MW->>Prisma: handler uses scoped client
  Prisma->>DB: auto-inject where.tenantId / stamp creates
  DB-->>C: tenant-isolated response
```

**Public / special paths**

| Path pattern | Middleware |
|--------------|------------|
| `/api/t/:slug/public` | `resolveTenant` → `enterTenantContext` |
| `/api/t/:slug/invites` | `resolveTenant` only |
| `/api/t/:slug/public/payhere/notify` | `resolveTenant` → `enterTenantContext` + form body |
| Authenticated `/api/t/:slug/*` | Full chain above |

Reserved UI slugs: `login`, `admin`.

---

## 5. Data isolation model

```mermaid
flowchart TB
  subgraph Request
    ALS["AsyncLocalStorage<br/>tenantId · role · userId"]
  end

  subgraph PrismaClients
    Base["basePrisma<br/>unscoped"]
    Scoped["prisma = basePrisma.$extends<br/>TENANT_MODELS"]
  end

  subgraph DB["PostgreSQL"]
    Rows["Tables with tenantId<br/>User · Class · Enrollment · Payment · ..."]
  end

  ALS --> Scoped
  Scoped -->|"find/count/updateMany/deleteMany<br/>+ create stamp"| Rows
  Base -->|"platform · auth · tenant resolve<br/>parent token · cross-cutting"| Rows
```

**Guarantees**

1. Every tenant-owned row carries `tenantId`.
2. Request context is set once per authenticated (or public-scoped) tenant call.
3. The extended Prisma client injects `tenantId` on bulk reads/writes and creates for models in `TENANT_MODELS`.
4. `basePrisma` is used only where isolation must be bypassed deliberately (platform ops, login, slug resolution).

---

## 6. Authentication & authorization

```mermaid
flowchart LR
  subgraph Tokens
    Access["Access JWT ~15m<br/>sub · role · email · name · tenantId"]
    Refresh["Refresh JWT ~7d<br/>RefreshToken table"]
  end

  Login["/api/auth/login<br/>or /api/t/:slug/auth"] --> Issue["issueTokens()"]
  Issue --> Access
  Issue --> Refresh

  Access --> Guards["authenticate · requireRole · requireActiveEnrollment"]
  Refresh --> Rotate["/api/auth/refresh"]
```

| Role | Scope |
|------|--------|
| `superadmin` | Platform; JWT `tenantId = null` |
| `admin` | Full institute |
| `teacher` | Own classes + assigned teach tools |
| `student` | Enrolled learning + payments + AI Study |

`UserStatus`: `pending` | `approved` | `rejected` — non-superadmins must be `approved` to sign in.  
Emails are unique per tenant: `@@unique([tenantId, email])`.

---

## 7. Protected materials pipeline

```mermaid
sequenceDiagram
  participant T as Teacher
  participant API as materials routes
  participant S as StorageService
  participant Disk as uploads/
  participant PDF as pdf.ts (pdf-lib + sharp)
  participant St as Student

  T->>API: upload material (multer)
  API->>S: persistUploadedFile
  S->>Disk: store key
  API->>API: File + Material rows<br/>viewOnly default true

  St->>API: GET /materials/:id/meta
  St->>API: GET /materials/:id/pages/:n
  API->>S: read buffer
  API->>PDF: renderWatermarkedPage<br/>"name - email"
  PDF-->>St: image/jpeg<br/>Cache-Control: private, no-store

  Note over St: Viewer disables download / right-click / drag<br/>original file never exposed as public URL
```

---

## 8. External integrations

```mermaid
flowchart TB
  API["Express API"]

  API --> Email["email.ts · Nodemailer<br/>invites · live alerts · parent links · digests"]
  API --> Anthropic["anthropic.ts<br/>AI Study + AI Copilot"]
  API --> JitsiSvc["jitsi.ts<br/>meet.jit.si · optional JWT"]
  API --> PayHereSvc["payhere.ts<br/>checkout init + IPN notify"]

  Email --> EmailLog["EmailLog (also when SMTP unset)"]
  Anthropic --> AiUsage["AiUsage · AiToolHistory"]
  JitsiSvc --> Schedules["ClassSchedule · live routes"]
  PayHereSvc --> Payments["Payment · Enrollment"]
```

| Integration | Purpose |
|-------------|---------|
| SMTP | Invites, live-class alerts, parent magic links, digests |
| Anthropic | Student AI Area + Teacher Copilot (plan-gated) |
| Jitsi | Built-in live rooms; Zoom / Teams / Meet as link platforms |
| PayHere | Online fee checkout + public notify webhook |
| Cron / jobs | Fee reminders, parent digests (`jobs/scheduler.ts`, `/api/cron`) |

---

## 9. Frontend ↔ backend alignment

```mermaid
flowchart TB
  subgraph UI["React Router"]
    Login["/login"]
    PlatformUI["/admin/*"]
    TenantUI["/:slug/*"]
  end

  subgraph BE["Express"]
    AuthAPI["/api/auth"]
    AdminAPI["/api/admin"]
    TenantAPI["/api/t/:slug"]
  end

  Login --> AuthAPI
  PlatformUI --> AdminAPI
  TenantUI --> TenantAPI
```

| UI area | Typical API |
|---------|-------------|
| Unified login | `/api/auth` |
| Platform console | `/api/admin` |
| Institute app | `/api/t/:slug/...` |
| Public landing / parent report | `/api/t/:slug/public` |

---

## Related docs

- [Design diagrams](./design.md) — domain model, role flows, class hub, payments, quizzes, parent trust, AI
- [Client pitch](./mindspark-client-pitch.html) — presentation deck
