# Mindspark LMS (Multi-Tenant SaaS)

A multi-tenant Learning Management System built with **Node.js + Express + TypeScript** (backend), **React + Vite + TypeScript + Tailwind** (frontend), and **PostgreSQL** via **Prisma**.

One platform hosts many **institutes/tutors (tenants)**, each with their own students, classes, branding and fully isolated data. A platform **super-admin** provisions tenants manually.

## Run with Docker

For Mac or Windows teammates with **Docker Desktop** only (no local Node/Postgres):

1. `cp .env.docker.example .env` (PowerShell: `Copy-Item .env.docker.example .env`)
2. `docker compose up --build -d`
3. Open [http://localhost:8080](http://localhost:8080)

Full steps, demo logins, and OS notes: **[docs/DOCKER_SETUP.md](docs/DOCKER_SETUP.md)**.

## Features

### Platform (super-admin)
- Create institutes (tenants) and their first admin in one step.
- Activate / deactivate institutes.
- View per-institute stats (users, classes, students, pending payments).

### Per institute (tenant)
- Role-based access: `admin`, `teacher`, `student` (JWT auth with access + refresh tokens).
- Create classes (optionally assigned to a batch), publish, set a price.
- Student self-registration and enrollment.
- Paid enrollment with manual payment verification: student uploads a bank transfer slip, admin/teacher approves to unlock the class.
- Teacher **view-only** assessments/materials: PDFs and images are rendered server-side into watermarked page images and streamed to enrolled students. The original file is never exposed and downloads/right-click/drag are disabled in the viewer.
- Student assignment submissions (uploaded files the teacher can download and grade).
- Online MCQ exams: quiz builder, timed attempts, single attempt per student, automatic grading, and per-question result review.
- **Video lessons** (YouTube / Vimeo / URL embeds) with visibility control (all / class / batch).
- **Notices** and **events**, plus a public institute landing page.

## Multi-tenancy architecture

- **Isolation:** shared database with a row-level `tenantId` on every tenant-owned table.
- **Request context:** an `AsyncLocalStorage` holds the current request's `tenantId`.
- **Auto-scoping:** a Prisma client extension (`$extends`) injects `where.tenantId` on reads/bulk writes and stamps `tenantId` on creates for the scoped client. A separate **unscoped** client is used only for platform/auth queries. This is the core guard against cross-tenant leakage.
- **Routing:** path-based. Tenant API lives under `/api/t/:slug/...`; platform API under `/api/admin/...`. A tenant-guard middleware rejects any token whose `tenantId` doesn't match the requested slug.

```
frontend (React SPA, Vite dev server on :5173)
   |  proxies /api ->
backend (Express API on :4000)
   |-> resolveTenant -> authenticate -> requireTenantMatch -> enterTenantContext
   |-> PostgreSQL (via Prisma, tenant-scoped client)
   |-> uploads/ (local disk, outside web root, behind a StorageService interface)
```

## Prerequisites

- Node.js 18+ (tested on Node 24)
- A locally installed and running **PostgreSQL** server

## Backend setup

```bash
cd backend
npm install
cp .env.example .env        # then edit DATABASE_URL to match your local PostgreSQL
```

Edit `backend/.env` and set `DATABASE_URL`, e.g.:

```
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/mindspark_saas?schema=public"
```

Create the schema and seed demo data:

```bash
npm run prisma:push        # creates the database + tables (non-interactive)
npm run seed               # creates the super-admin + 2 demo tenants with full sample data
npm run dev                # starts API on http://localhost:4000
```

## Frontend setup

```bash
cd frontend
npm install
npm run dev                # starts app on http://localhost:5173
```

The Vite dev server proxies `/api` to the backend, so just open http://localhost:5173.

## URLs

- `/login` - single unified sign-in for everyone (super-admin and all institute roles). `/` redirects here.
- `/admin` - platform super-admin app (protected).
- `/:slug` - public institute landing (notices, events, public videos).
- `/:slug/register` - student self-registration into that institute.
- `/:slug/dashboard`, `/:slug/students`, `/:slug/classes`, ... - authenticated institute app. A route guard blocks access to any institute other than the signed-in user's.

> Note: the browser paths are `/:slug/...`; the backend API stays under `/api/t/:slug/...`. Slugs `login` and `admin` are reserved.

## Demo accounts (after seeding)

Password for **all** accounts: `1234`

**Platform super-admin** — sign in at `/login`
- `superadmin@lms.test`

**Demo institutes** (each institute has its own separate admin/teacher/student accounts):

| Institute | URL | Admin | Teacher | Student |
|-----------|-----|-------|---------|---------|
| Top Maths | `/topmaths` | `admin@topmaths.lms` | `teacher@topmaths.lms` | `student@topmaths.lms` |
| ICT With Pasidu | `/ictpasidu` | `admin@ictpasidu.lms` | `teacher@ictpasidu.lms` | `student@ictpasidu.lms` |

Sign in from the home page (`/`) with just email + password — the account (super-admin or a specific institute role) is detected automatically.

## Notes

- View-only protection is a strong practical deterrent (server-rendered, watermarked images, no direct file URL, disabled download/right-click). Browser-based viewing can never be 100% download-proof.
- Free classes (price = 0) activate enrollment instantly; paid classes stay pending until a payment slip is approved.
- File storage uses the local `uploads/` folder via a `StorageService` interface that can be swapped for S3 later without changing callers.
- Email uniqueness is per-tenant (`@@unique([tenantId, email])`), so different institutes can reuse the same email addresses.
