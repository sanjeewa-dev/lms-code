# Mindspark LMS — Design

Domain and product design diagrams: entities, roles, class hub, and key flows.

---

## 1. Domain model (core entities)

```mermaid
erDiagram
  Tenant ||--o{ User : has
  Tenant ||--o{ Batch : has
  Tenant ||--o{ CourseClass : has
  Tenant ||--o{ Enrollment : has
  Tenant ||--o{ Payment : has

  User ||--o{ CourseClass : teaches
  User ||--o{ Enrollment : student
  Batch ||--o{ CourseClass : groups

  CourseClass ||--o{ Enrollment : has
  CourseClass ||--o{ Material : has
  CourseClass ||--o{ Quiz : has
  CourseClass ||--o{ ClassSchedule : has
  CourseClass ||--o{ Attendance : has
  CourseClass ||--o{ VideoLesson : has

  Enrollment ||--o{ Payment : pays

  Material ||--o{ Submission : receives
  Quiz ||--o{ Question : contains
  Quiz ||--o{ QuizAttempt : attempts
  QuizAttempt ||--o{ Answer : records

  User ||--o{ ParentToken : guardian_link
  User ||--o{ Intervention : follow_up
  User ||--o{ AiUsage : quota
```

> Mermaid reserves `Class`, so the diagram uses `CourseClass` for the Prisma `Class` model.

### Key models (summary)

| Model | Purpose |
|-------|---------|
| **Tenant** | Institute / tutor workspace (slug, branding, plan) |
| **User** | `superadmin` \| `admin` \| `teacher` \| `student` |
| **Batch** | Groups classes |
| **Class** | Learning unit; optional price; teacher-owned |
| **Enrollment** | Student ↔ class (`pending` \| `active` \| `rejected`) |
| **Payment** | Slip / PayHere; `enrollment` \| `monthly` |
| **Material** | Notes / assessments; view-only by default |
| **Submission** | Student file + grade for assessments |
| **Quiz / Question / QuizAttempt / Answer** | MCQ lifecycle; one attempt per student |
| **ClassSchedule** | Live / meeting sessions (Jitsi, Zoom, Teams, Meet) |
| **Attendance** | Presence by session date |
| **VideoLesson / ClassTopic** | Content with visibility (all / class / batch) |
| **Notice / Event** | Institute communications |
| **Conversation / Message** | Teacher/admin ↔ student chat |
| **ParentToken** | Magic-link parent access |
| **Intervention / AiUsage / AiToolHistory** | Ops intelligence + AI quotas |

---

## 2. Role & responsibility design

```mermaid
flowchart TB
  subgraph Platform
    SA["superadmin<br/>provision tenants · monitor · AI usage · audit · support session"]
  end

  subgraph Institute["Tenant"]
    AD["admin<br/>users · branding · bank/PayHere · all classes · approvals"]
    TE["teacher<br/>own classes · roster · grade · live · AI Copilot"]
    ST["student<br/>enroll · learn · quiz · pay · AI Study · chat"]
    PA["parent<br/>no LMS login · Trust Center via token"]
  end

  SA -->|"creates / supports"| AD
  AD --> TE
  AD --> ST
  TE -->|"teaches"| ST
  AD -->|"sends magic link"| PA
  TE -->|"sends magic link"| PA
```

| Role | Primary surfaces |
|------|------------------|
| Super-admin | `/admin/*` platform console |
| Admin | `/:slug/dashboard`, settings, payments, all teach tools |
| Teacher | Class hub, attendance, interventions, AI Copilot |
| Student | Catalog, class content, quizzes, payments, AI Study |
| Parent | `/:slug/parent?token=…` report only |

---

## 3. Class hub information architecture

Class routes: `/:slug/classes/:classId/:section`

```mermaid
flowchart LR
  Dash["Class Dashboard"] --> Mat["materials"]
  Dash --> Sch["schedule"]
  Dash --> Quiz["quizzes"]
  Dash --> Asg["assignments"]
  Dash --> Grd["grades"]
  Dash --> Rost["students<br/>staff"]
  Dash --> Att["attendance<br/>staff"]
```

| Section | Audience | Purpose |
|---------|----------|---------|
| Materials | All enrolled / staff | View-only PDFs & notes |
| Schedules | All / staff manage | Sessions + live join |
| Quizzes | Students take · staff build | MCQ + leaderboard |
| Assignments | Students submit · staff grade | File submissions |
| Grades | Staff (+ student views as designed) | Gradebook / export |
| Students | Staff | Roster, invites, ID cards |
| Attendance | Staff | Mark presence |

Related standalone pages: material viewer, quiz take, quiz result.

---

## 4. Enrollment & payment design

```mermaid
stateDiagram-v2
  [*] --> PendingEnrollment: paid class enroll
  [*] --> ActiveEnrollment: free class enroll

  PendingEnrollment --> PendingPayment: upload bank slip<br/>or PayHere init
  PendingPayment --> PaymentApproved: staff approve / IPN success
  PendingPayment --> PaymentRejected: staff reject

  PaymentApproved --> ActiveEnrollment: enrollment payment
  PaymentRejected --> RejectedEnrollment: enrollment payment

  ActiveEnrollment --> MonthlyPending: monthly fee due
  MonthlyPending --> ActiveEnrollment: monthly payment approved<br/>or within graceDays
```

```mermaid
sequenceDiagram
  participant S as Student
  participant API as payments / classes
  participant Staff as Admin / Teacher

  S->>API: POST /classes/:id/enroll
  alt Free class
    API-->>S: Enrollment active
  else Paid class
    API-->>S: Enrollment pending
    S->>API: POST /enrollments/:id/payment<br/>(slip) or PayHere init
    Staff->>API: POST /payments/:id/approve
    API-->>S: Enrollment active + notification
  end

  Note over S,API: Content access requires active enrollment<br/>+ current month payment (or grace) when monthly fees enabled
```

**Content gate (`studentHasContentAccess`)**

1. Enrollment must be `active`
2. If class is paid and monthly payment is required: approved payment for current `YYYY-MM` **or** day-of-month ≤ `graceDays`

---

## 5. Quiz attempt design

```mermaid
sequenceDiagram
  participant T as Teacher
  participant API as quizzes
  participant S as Student
  participant Q as quiz.ts gradeAttempt

  T->>API: create quiz + questions
  T->>API: publish quiz

  S->>API: POST /quizzes/:id/attempts
  Note over API: checks published · enrollment · window<br/>one attempt per student
  API-->>S: questions without correctIndex

  S->>API: POST /attempts/:id/submit
  API->>Q: gradeAttempt (+ timeLimit grace)
  Q-->>S: score · answers · result
  S->>API: GET /attempts/:id/result
```

**Rules**

- Single attempt: `@@unique([quizId, studentId])`
- Timed quizzes enforce `timeLimitSec` (+ short grace)
- Correct answers withheld until submit / result

---

## 6. Parent Trust Center design

```mermaid
sequenceDiagram
  participant Staff as Admin / Teacher
  participant API as parent-trust / public
  participant Mail as Email
  participant P as Parent browser

  Staff->>API: POST /parent-trust/send-link/:studentId
  Note over API: requires guardianEmail · plan gate parentTrust
  API->>API: create ParentToken (~48h)
  API->>Mail: magic link /:slug/parent?token=...
  Mail-->>P: open link
  P->>API: GET /public/parent-report?token=
  API->>API: resolveParentToken · mark usedAt
  API-->>P: attendance · quiz scores · payments summary
```

**Access model**

- Parent has **no** LMS role/login
- Token is tenant-scoped, time-limited, plan-gated (`parentTrust`)
- Report is read-only (attendance window, quiz performance, payment summary)

---

## 7. Live class design

```mermaid
flowchart TB
  Sch["ClassSchedule"] --> Platform{"meetingPlatform"}
  Platform -->|jitsi| Jitsi["In-app Jitsi room<br/>optional app JWT"]
  Platform -->|zoom / teams / google_meet| Ext["External meeting URL"]

  Staff["Teacher / admin"] -->|"start / end"| Sch
  Student["Student"] -->|"join"| Sch
```

Supporting surfaces: live upcoming list, instant live rooms, email alerts when sessions go live.

---

## 8. AI feature design

```mermaid
flowchart TB
  subgraph StudentAI["AI Study · /:slug/ai · plan aiStudent"]
    Tutor["Tutor chat"]
    Sum["Smart summarizer"]
    MCQ["MCQ generator"]
    Cards["Flashcards"]
    Plan["Study plan"]
  end

  subgraph TeacherAI["AI Copilot · /:slug/ai-copilot · plan aiTeacher"]
    GenQ["Generate quiz"]
    Feedback["Draft feedback"]
    Weak["Weak topics"]
    Interv["Intervention suggestions"]
  end

  Quota["AiUsage monthly quota<br/>history → AiToolHistory"]

  StudentAI --> Quota
  TeacherAI --> Quota
```

| Audience | Constraints |
|----------|-------------|
| Student | Active enrollment; monthly quota |
| Teacher | Own classes only |
| Admin | Any class in tenant |
| Platform | `/api/admin/ai/usage` rollup |

Related ops: Smart Ops at-risk lists, attempt explain, weak-topic analysis, intervention timeline.

---

## 9. Institute product map (nav intent)

```mermaid
mindmap
  root((Mindspark Tenant))
    Learn
      Classes catalog
      Materials viewer
      Quizzes
      AI Study
    Teach
      Class hub
      Roster
      Gradebook
      Attendance
      AI Copilot
      Interventions
    Communicate
      Chat
      Notices
      Events
      Live
    Account
      Payments
      Profile
      Settings branding
    Parent
      Trust Center report
```

---

## 10. End-to-end student journey

```mermaid
journey
  title Typical paid-class student path
  section Join
    Open institute landing: 5: Student
    Register / accept invite: 4: Student
    Browse classes: 5: Student
  section Enroll & pay
    Request enrollment: 4: Student
    Upload slip or PayHere: 3: Student
    Staff approves payment: 5: Admin
  section Learn
    View watermarked materials: 5: Student
    Join live class: 5: Student
    Take quiz: 4: Student
    Use AI Study: 5: Student
  section Home loop
    Parent receives trust link: 4: Parent
    Teacher intervenes if at risk: 5: Teacher
```

---

## Related docs

- [Architecture diagrams](./architecture.md) — system context, tenancy, auth, storage, integrations
- [Client pitch](./mindspark-client-pitch.html) — presentation deck
