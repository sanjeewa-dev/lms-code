# Notification & Delivery Platform — Design Diagrams

**Companion to:** [notification-email-microservice.md](./notification-email-microservice.md)  
**Audience:** Architects, platform engineers, product integrators

---

## 1. System context (who talks to whom)

High-level view of the shared notification platform across multiple products.

**Why two boxes?** The **Notification Delivery Platform** is what your team builds and owns (API, inbox, workers, queue, DB). **Shared / external** items are either used by many services (event bus) or operated by a third party (SES/SMTP). The queue and workers belong **inside** the platform; they were omitted in an earlier sketch for simplicity.

```mermaid
flowchart TB
  subgraph clients [Clients]
    SPA[LMS Web SPA]
    CoachApp[Coaching App]
    Mobile[Future Mobile]
  end

  subgraph products [Product systems - other microservices]
    LMSBFF[LMS BFF]
    CoachBFF[Coaching BFF]
    Catalog[Catalog Session Platform]
    Payments[Payments]
    Identity[Identity]
    Assessment[Assessment]
  end

  subgraph notifyPlatform [Notification Delivery Platform - we own this]
    direction TB
    API[Ingest Inbox Prefs APIs]
    Workers[Delivery workers]
    InternalQ[Priority delivery queue]
    InternalDB[(PostgreSQL + Redis)]
    API --> InternalDB
    API --> InternalQ
    InternalQ --> Workers
    Workers --> InternalDB
  end

  subgraph sharedExternal [Shared platform and third-party - we consume not own]
    Bus[Domain event bus<br/>used by all services]
    SES[SMTP / SES / Email provider]
  end

  SPA --> LMSBFF
  CoachApp --> CoachBFF
  Mobile --> LMSBFF
  LMSBFF --> API
  CoachBFF --> API

  Catalog --> Bus
  Payments --> Bus
  Assessment --> Bus
  Identity --> Bus
  Bus -->|events consumed| API

  Catalog -->|POST /v1/notify| API
  Payments -->|POST /v1/notify| API
  Identity -->|POST /v1/notify| API

  Identity -.->|recipient_projection events| InternalDB
  Workers --> SES
```

### Inside vs outside the platform

| Inside Notification Delivery Platform | Outside (shared / third-party) |
|---------------------------------------|--------------------------------|
| Ingest, Inbox, Preferences APIs | Domain event bus (Catalog, Payments, Assessment also publish) |
| Delivery workers | AWS SES / SMTP / SendGrid |
| Internal priority queue | Identity service (source of user email) |
| PostgreSQL, Redis | Tenant Config (branding read by notify) |
| Template packs, channel adapter **code** | Actual mail infrastructure the adapter calls |

The **event bus is not inside** the notification service because it is **platform-wide**: Catalog emits `SessionScheduled`, Payments emits `PaymentApproved`, and Notification subscribes — one bus, many publishers. Putting it inside the notification box would wrongly imply only notifications use it.

The **email provider is not inside** because you integrate with it (like PayHere or Jitsi); you do not operate it.

For module-level detail (everything inside the platform box), see **Diagram 2** below.

---

## 2. Logical architecture (modules inside the platform)

Modular monolith in Phase 0; Delivery workers peel first at scale.

```mermaid
flowchart TB
  subgraph edge [Edge layer]
    GW[API Gateway]
    BFF1[LMS BFF]
    BFF2[Coaching BFF]
  end

  subgraph notify [Notification Delivery Platform]
    direction TB

    subgraph api [API tier - stateless]
      Ingest[Ingest module<br/>POST /v1/notify]
      InboxAPI[Inbox module<br/>GET /v1/inbox]
      PrefsAPI[Preferences module<br/>GET PUT /v1/preferences]
      EventConsumer[Event consumer<br/>pack bindings]
    end

    subgraph core [Core services]
      Packs[Product template packs<br/>lms coaching events]
      Router[Channel router]
      PrefEngine[Preference engine]
      Renderer[Template renderer]
      RateLimit[Rate limiter]
    end

    subgraph data [Data tier]
      PG[(PostgreSQL)]
      Redis[(Redis cache<br/>unread counts)]
    end

    subgraph async [Async tier]
      QSec[Queue P1 security]
      QTx[Queue P3 transactional]
      QRem[Queue P5 reminder]
      QBulk[Queue P9 bulk]
      Workers[Delivery workers]
    end

    subgraph channels [Channel adapters]
      InApp[In-app adapter]
      Email[Email adapter]
      Sms[SMS adapter later]
      Push[Push adapter later]
    end
  end

  subgraph siblings [Platform siblings]
    TenantCfg[Tenant Config]
    IdSvc[Identity]
    Digest[Digest scheduler later]
  end

  BFF1 --> GW
  BFF2 --> GW
  GW --> Ingest
  GW --> InboxAPI
  GW --> PrefsAPI

  EventConsumer --> Ingest
  Packs --> Ingest
  Packs --> EventConsumer
  Packs --> Renderer

  Ingest --> PrefEngine
  Ingest --> Router
  Ingest --> RateLimit
  Ingest --> InApp
  Ingest --> PG
  Ingest --> QSec
  Ingest --> QTx
  Ingest --> QRem
  Ingest --> QBulk

  InboxAPI --> PG
  InboxAPI --> Redis
  PrefsAPI --> PG

  QSec --> Workers
  QTx --> Workers
  QRem --> Workers
  QBulk --> Workers

  Workers --> Renderer
  Workers --> Email
  Workers --> Sms
  Workers --> Push
  Workers --> PG

  IdSvc -->|recipient_projection| PG
  TenantCfg -->|branding SMTP refs| Renderer
  Digest -.->|POST /v1/notify| Ingest
```

---

## 3. Notify flow (sequence)

End-to-end path from producer to delivered notification.

```mermaid
sequenceDiagram
  autonumber
  participant P as Producer<br/>Catalog / Payments / BFF
  participant G as API Gateway
  participant I as Ingest module
  participant PK as Product pack
  participant PR as Preferences
  participant RP as Recipient projection
  participant DB as PostgreSQL
  participant Q as Priority queue
  participant W as Delivery worker
  participant R as Template renderer
  participant E as Email provider
  participant U as End user

  P->>G: POST /v1/notify<br/>Idempotency-Key + templateKey + data
  G->>I: Forward with tenantId productCode userId claims
  I->>PK: Validate templateKey + category
  I->>I: Dedupe intent tenantId + idempotencyKey
  I->>PR: Resolve channels + quiet hours
  I->>RP: Resolve email locale phone
  I->>DB: Insert notify_intent
  I->>DB: Insert notification_messages in_app
  I->>DB: Insert delivery_jobs dedupe per user channel
  I->>Q: Enqueue jobs by priority
  I-->>P: 202 Accepted intentId

  W->>Q: Claim job lease
  W->>PR: Re-check prefs if delayed
  W->>R: Render template + branding + locale
  W->>E: Send email
  E-->>W: providerId
  W->>DB: Insert delivery_attempt + update job sent

  U->>G: GET /v1/inbox
  G->>DB: List messages cursor paginated
  DB-->>U: Notifications + unread badge
```

---

## 4. Multi-product integration

How LMS, coaching, and future products share one platform without forking.

```mermaid
flowchart LR
  subgraph lms [productCode lms]
    LMSRoutes[/classes schedules payments/]
    LMSTemplates[session.scheduled<br/>class.invite<br/>payment.approved]
  end

  subgraph coaching [productCode coaching]
    CoachRoutes[/programs sessions/]
    CoachTemplates[session.booked<br/>session.reminder<br/>consent.updated]
  end

  subgraph events [productCode events]
    EventRoutes[/series registrations/]
    EventTemplates[registration.confirmed<br/>event.starting_soon]
  end

  subgraph platform [Shared Notification Platform]
    API[/v1/notify /v1/inbox/]
    PackRegistry[Pack registry]
    SharedCore[Ingest Inbox Delivery]
  end

  LMSRoutes --> API
  CoachRoutes --> API
  EventRoutes --> API

  LMSTemplates --> PackRegistry
  CoachTemplates --> PackRegistry
  EventTemplates --> PackRegistry

  PackRegistry --> SharedCore
```

---

## 5. Data model (core entities)

```mermaid
erDiagram
  NOTIFY_INTENT ||--o{ NOTIFICATION_MESSAGE : creates
  NOTIFY_INTENT ||--o{ DELIVERY_JOB : enqueues
  DELIVERY_JOB ||--o{ DELIVERY_ATTEMPT : records
  TEMPLATE ||..o{ NOTIFY_INTENT : renders_via
  NOTIFICATION_PREFERENCES ||..o{ NOTIFY_INTENT : filters
  RECIPIENT_PROJECTION ||..o{ DELIVERY_JOB : addresses

  NOTIFY_INTENT {
    text id PK
    text tenant_id
    text product_code
    text template_key
    text category
    text idempotency_key UK
    text status
    jsonb doc
    timestamptz created_at
  }

  NOTIFICATION_MESSAGE {
    text id PK
    text tenant_id
    text product_code
    text user_id
    text intent_id FK
    text title
    text body
    text link
    timestamptz read_at
    timestamptz created_at
  }

  DELIVERY_JOB {
    text id PK
    text intent_id FK
    text user_id
    text channel
    smallint priority
    text status
    text dedupe_key UK
    timestamptz scheduled_for
  }

  DELIVERY_ATTEMPT {
    text id PK
    text job_id FK
    int attempt_no
    text status
    text provider_id
    text error
  }

  NOTIFICATION_PREFERENCES {
    text tenant_id PK
    text product_code PK
    text user_id PK
    jsonb doc
  }

  RECIPIENT_PROJECTION {
    text tenant_id PK
    text user_id PK
    text email
    text locale
    text phone_e164
  }

  TEMPLATE {
    text product_code PK
    text template_key PK
    text channel PK
    int version PK
    text status
    jsonb doc
  }
```

---

## 6. Channel routing & categories

```mermaid
flowchart TD
  Intent[NotifyIntent<br/>templateKey + category] --> Pack[Product pack<br/>default channels]
  Pack --> Prefs{User preferences<br/>+ quiet hours}
  Prefs -->|security| ForceEmail[Always email<br/>no opt-out]
  Prefs -->|transactional| TxChannels[in_app + email]
  Prefs -->|reminder| RemChannels[respect email off<br/>delay if quiet hours]
  Prefs -->|marketing| MktCheck{opt-in?}
  MktCheck -->|no| Skip[Skip external channels]
  MktCheck -->|yes| MktChannels[email only]

  ForceEmail --> InAppWrite[Write in_app if pack allows]
  TxChannels --> InAppWrite
  RemChannels --> InAppWrite
  MktChannels --> InAppWrite

  InAppWrite --> Inbox[(notification_messages)]
  ForceEmail --> Q1[Queue P1]
  TxChannels --> Q3[Queue P3]
  RemChannels --> Q5[Queue P5]
  MktChannels --> Q9[Queue P9]
  Skip --> Done[Intent completed partial]
  Q1 --> Workers[Delivery workers]
  Q3 --> Workers
  Q5 --> Workers
  Q9 --> Workers
  Workers --> Provider[SMTP / SES / SMS / Push]
```

---

## 7. Event-driven integration

Domain events from other platform services trigger notifications via pack bindings.

```mermaid
flowchart LR
  subgraph producers [Event producers]
    E1[SessionScheduled]
    E2[PaymentApproved]
    E3[MemberInvited]
    E4[UserPasswordResetRequested]
    E5[SessionStartingSoon]
  end

  subgraph bus [Event bus]
    Topic[notifications.ingest]
  end

  subgraph consumer [Notification platform]
    Bind[Pack event bindings]
    Map[Map event to templateKey]
    Recip[Resolve recipients from payload]
    Notify[Create NotifyIntent]
  end

  E1 --> Topic
  E2 --> Topic
  E3 --> Topic
  E4 --> Topic
  E5 --> Topic

  Topic --> Bind
  Bind --> Map
  Map --> Recip
  Recip --> Notify
```

**Example bindings (lms pack):**

| Event | templateKey | Recipients |
|-------|-------------|------------|
| `SessionScheduled` | `session.scheduled` | `event.participantUserIds` |
| `PaymentApproved` | `payment.approved` | `event.userId` |
| `MemberInvited` | `class.invite` | `event.inviteeEmail` or `event.userId` |
| `UserPasswordResetRequested` | `auth.password_reset` | `event.userId` |

---

## 8. Deployment topology (Phase 0 → Phase 1)

```mermaid
flowchart TB
  subgraph phase0 [Phase 0 - Modular monolith]
    direction TB
    LB0[Load balancer]
    App0[Notification app<br/>Ingest + Inbox + Prefs APIs]
    Worker0[Delivery workers<br/>same cluster or sidecar]
    PG0[(PostgreSQL HA)]
    Q0[(Redis / SQS queue)]
    R0[(Redis cache)]
    LB0 --> App0
    App0 --> PG0
    App0 --> Q0
    Worker0 --> Q0
    Worker0 --> PG0
    App0 --> R0
  end

  subgraph phase1 [Phase 1 - Peel delivery at scale]
    direction TB
    LB1[Load balancer]
    App1[Notification API<br/>Ingest Inbox Prefs]
    WPool[Delivery worker pool<br/>auto-scale on queue depth]
    PG1[(PostgreSQL HA)]
    Q1[(Priority queues)]
    R1[(Redis)]
    LB1 --> App1
    App1 --> PG1
    App1 --> Q1
    WPool --> Q1
    WPool --> PG1
    App1 --> R1
  end

  phase0 -.->|scale trigger<br/>queue depth / send latency| phase1
```

---

## 9. BFF mapping (product UX vs platform API)

```mermaid
flowchart LR
  subgraph lmsUX [LMS user experience]
    Bell[Notification bell]
    List[Notification list]
    Read[Mark as read]
  end

  subgraph lmsAPI [LMS BFF routes]
    R1[GET /api/t/:slug/notifications]
    R2[GET .../notifications/unread-count]
    R3[POST .../notifications/:id/read]
  end

  subgraph platformAPI [Platform API]
    P1[GET /v1/inbox]
    P2[GET /v1/inbox/unread-count]
    P3[POST /v1/inbox/:id/read]
  end

  Bell --> R2 --> P2
  List --> R1 --> P1
  Read --> R3 --> P3
```

---

## 10. Security & privacy boundaries

```mermaid
flowchart TB
  subgraph safe [Safe in list APIs and logs]
    Meta[subject status providerId<br/>to address timestamp]
    InApp[title body link<br/>no secrets in body]
  end

  subgraph restricted [Never in list APIs or logs]
    Secrets[password reset tokens<br/>magic links invite URLs]
    RawHTML[Full rendered HTML with tokens]
  end

  subgraph joinPath [Delivery path only]
    Render[Worker renders template]
    Send[Provider sends mail]
    Audit[Store metadata only]
  end

  Intent[NotifyIntent with data] --> Render
  Render --> Send
  Send --> Audit
  Audit --> Meta

  Render -.->|never log| RawHTML
  Send -.->|never expose| Secrets
```

---

## 11. Scale evolution roadmap

```mermaid
timeline
  title Notification platform scale path
  section Phase 0
    Modular monolith : Ingest + Inbox + Workers
    Hybrid Postgres : Typed inbox columns + JSONB
    lms pack : First templates + BFF aliases
  section Phase 1
    Peel Delivery workers : Horizontal pool + priority queues
    Redis unread cache : Badge poll optimization
  section Phase 2
    coaching pack : Prefs + consent + reminders
    SMS push adapters : New channels same pipeline
  section Phase 3
    Digest sibling : Bundled weekly notify
    Inbox read replica : If badge/list QPS dominates
```

---

## Diagram index

| # | Diagram | Use when |
|---|---------|----------|
| 1 | System context | Explaining platform placement to stakeholders |
| 2 | Logical architecture | Engineering onboarding / service boundaries |
| 3 | Notify sequence | Implementing ingest + delivery |
| 4 | Multi-product integration | Adding a new productCode |
| 5 | Data model | Database design / migrations |
| 6 | Channel routing | Preferences and quiet hours logic |
| 7 | Event-driven integration | Wiring Catalog, Payments, Identity |
| 8 | Deployment topology | Infra and scaling planning |
| 9 | BFF mapping | Frontend / product team integration |
| 10 | Security boundaries | Review / audit discussions |
| 11 | Scale roadmap | Phased delivery planning |

---

*Render these diagrams in any Mermaid-compatible viewer (GitHub, VS Code, Cursor preview).*
