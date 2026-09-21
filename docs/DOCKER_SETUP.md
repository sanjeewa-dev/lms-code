# Local Docker setup (Mac + Windows)

Run the full Mindspark LMS stack with **Docker Desktop only** — no local Node.js or PostgreSQL install. The app is available at **http://localhost:8080**.

## Prerequisites

### Both Mac and Windows

1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/).
2. Allocate enough memory to Docker (Settings → Resources): **≥ 6 GB RAM** recommended.
3. Confirm Compose works:

```bash
docker compose version
```

### Windows-specific

- Use the **WSL2** backend (Docker Desktop → Settings → General → “Use the WSL 2 based engine”).
- Run commands in **PowerShell**, **Command Prompt**, or a **WSL** terminal from the repo root.
- First build can take several minutes while images download.

### Mac-specific (including Apple Silicon)

- Stock `node` and `postgres` images are multi-arch — no special `--platform` flags needed.
- Grant Docker Desktop enough CPU/RAM if builds feel slow.

## First-time setup

1. Clone the repository and open a terminal in the repo root.

2. Create a local env file from the example:

```bash
# macOS / Linux / Git Bash
cp .env.docker.example .env
```

```powershell
# Windows PowerShell
Copy-Item .env.docker.example .env
```

Edit `.env` only if you need different secrets or port. Defaults are fine for local team use. Do not commit `.env`.

3. Build and start:

```bash
docker compose up --build -d
```

4. Wait until the backend is healthy:

```bash
docker compose ps
docker compose logs -f backend
```

Look for lines like schema sync, optional seed, then “Starting API…”. Press `Ctrl+C` to stop following logs (containers keep running).

5. Open the app: [http://localhost:8080](http://localhost:8080)

6. Sign in with seeded demo accounts (password for all: `1234`):

| Role | Email |
|------|--------|
| Super-admin | `superadmin@lms.test` |
| Institute admin | `admin@ictpasidu.lms` / `admin@topmaths.lms` |
| Teacher | `teacher@ictpasidu.lms` / `teacher@topmaths.lms` |
| Student | `student@ictpasidu.lms` / `student@topmaths.lms` |

`SEED_ON_START=true` (default in `.env.docker.example`) runs the seed on backend start. It is mostly idempotent (find-or-create).

**NMS:** Default Docker env leaves `NMS_BASE_URL` empty so the LMS does not call a separate notification service. Email/invite links without SMTP are logged in the backend container.

## Daily use

```bash
# Start (uses existing images)
docker compose up -d

# Stop containers (keeps DB + uploads volumes)
docker compose down

# Follow logs
docker compose logs -f
docker compose logs -f backend

# Rebuild after pulling code changes
docker compose up --build -d
```

### Reset database (wipe local data)

```bash
docker compose down -v
docker compose up --build -d
```

`-v` removes the Postgres volume; the next start re-pushes the schema and re-seeds when `SEED_ON_START=true`.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Port 8080 already in use | Set `HOST_PORT=8081` (or another free port) in `.env`, then `docker compose up -d` again. Open `http://localhost:8081`. |
| Entrypoint error like `set: illegal option` / `\r` | Windows CRLF on shell scripts. Pull latest (Dockerfile strips `\r`), then `docker compose build --no-cache backend && docker compose up -d`. |
| Frontend loads but API fails / 502 | Check `docker compose logs backend`. Wait until Postgres is healthy and schema push finishes. Confirm nginx proxies `/api` (see `frontend/nginx.conf`). |
| Empty login / no demo users | Ensure `SEED_ON_START=true` in `.env`, then restart backend: `docker compose up -d --force-recreate backend` or reset with `down -v`. |
| Build fails on low memory | Increase Docker Desktop RAM (≥6 GB) and retry. |
| JWT / CRON secret errors on start | Secrets in `.env` must be ≥32 characters (see `.env.docker.example`). |

## Architecture (local)

```
Browser  →  http://localhost:8080
              │
              ├─ /        → frontend (nginx SPA)
              └─ /api/*   → frontend nginx proxies to backend:4000
                              └─ postgres (internal network)
```

Postgres is not published to the host by default (only needed inside the Compose network).
