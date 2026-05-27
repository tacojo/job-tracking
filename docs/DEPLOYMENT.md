# Deployment: Supabase + Render

This guide covers putting your job tracker **online** so you can use it from any device, with:

- **Supabase Postgres** — applications, CV profile, learning data
- **Supabase Storage** — uploaded CVs, job descriptions, cover letters (private bucket)
- **Render** — backend (Docker) + frontend (static site)

Local Docker development stays on **SQLite + local `./storage`** until you run the cutover.

---

## Prerequisites

- [Supabase](https://supabase.com) project
- [Render](https://render.com) account
- [Google OAuth](https://console.cloud.google.com/apis/credentials) credentials (production)
- This repo cloned locally with existing data under `./storage`

---

## Phase A — Prepare Supabase (no downtime)

### A1. Create Supabase project

Note your **project URL**, **database password**, and **service role key** (Settings → API).

### A2. Create Storage bucket

1. Supabase Dashboard → **Storage** → **New bucket**
2. Name: `job-tracker-files` (or match `SUPABASE_STORAGE_BUCKET`)
3. **Private** bucket (files served only through your authenticated API)

### A3. Create Postgres schema (empty tables)

From your machine, with Poetry installed:

```bash
cd backend
poetry install
export DATABASE_URL_POSTGRES="postgresql+psycopg2://postgres.[ref]:[PASSWORD]@db.[ref].supabase.co:5432/postgres?sslmode=require"
poetry run python scripts/create_postgres_schema.py
```

Use the **direct** connection (port **5432**), not the pooler, for migrations.

### A4. Dry-run data migration (optional)

```bash
cp ../storage/db/job_tracking.db ../storage/backups/test_migrate.db
export DATABASE_URL_POSTGRES="postgresql+psycopg2://..."
poetry run python scripts/migrate_sqlite_to_postgres.py --sqlite ../storage/backups/test_migrate.db --dry-run
poetry run python scripts/verify_migration.py --sqlite ../storage/backups/test_migrate.db
```

Fix any errors before the real cutover.

---

## Phase B — Deploy Render (can be done before cutover)

### B1. Backend (Web Service)

- **Root directory:** `backend`
- **Runtime:** Docker
- **Health check:** `/ready`

**Environment variables:**

| Variable | Value |
|----------|--------|
| `DATABASE_URL` | Supabase Postgres URL (`postgresql+psycopg2://...?sslmode=require`) |
| `STORAGE_BACKEND` | `supabase` |
| `SUPABASE_URL` | `https://[ref].supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | service role (secret) |
| `SUPABASE_STORAGE_BUCKET` | `job-tracker-files` |
| `STORAGE_PATH` | `/app/storage` |
| `BYPASS_AUTH` | `false` |
| `JWT_SECRET` | long random secret |
| `BACKEND_URL` | `https://your-api.onrender.com` |
| `FRONTEND_URL` | `https://your-app.onrender.com` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | production OAuth |
| `SECRETS_ENCRYPTION_KEY` | Fernet key — required for per-user OpenAI keys (generate with `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`) |
| `SUPERUSER_EMAILS` | Comma-separated Google account emails allowed to use **Settings → Danger zone** (`/api/reset/*`) |

Each user adds their own OpenAI key in the app under **Settings → AI settings**. Recommend a **dedicated test key** ([platform.openai.com/api-keys](https://platform.openai.com/api-keys)) that they revoke on OpenAI and remove in Settings when finished — not a long-lived production key.

Or deploy from [`render.yaml`](../render.yaml) (Blueprint).

### B2. Google OAuth

Add **Authorised redirect URI**:

```text
https://your-api.onrender.com/api/v1/auth/callback
```

### B3. Frontend (Static Site)

- **Build command:** `node scripts/ensure-project-log-docs.mjs && cd frontend && npm ci && npm run build`
- **Publish directory:** `frontend/dist`
- **Rewrite rule:** `/*` → `/index.html`
- **Build env:** `VITE_API_URL=https://your-api.onrender.com`

---

## Phase C — Cutover (downtime window)

Stop local writes, migrate, verify, switch to online.

| Step | Action |
|------|--------|
| 1 | `docker compose stop backend` |
| 2 | Backup SQLite: `storage/backups/job_tracking_PRE_CUTOVER_<timestamp>.db` |
| 3 | Tarball `./storage/files` and `./storage/uploads` (off-machine copy) |
| 4 | `poetry run python scripts/migrate_sqlite_to_postgres.py --sqlite ../storage/db/job_tracking.db` |
| 5 | Set `STORAGE_BACKEND=supabase` + Supabase env vars; run `poetry run python scripts/upload_storage_to_supabase.py` |
| 6 | `poetry run python scripts/verify_migration.py` — must pass row counts |
| 7 | Deploy / restart Render backend + frontend with production env |
| 8 | From phone: sign in, open an application, **preview/download an existing JD/CV**, upload a new file |

**Success:** you can use the Render frontend URL without your PC running Docker.

### Rollback

Restore local `.env` to SQLite, restore DB from step 2 backup, `docker compose up`. Data created only on Supabase after cutover may be lost unless you reverse-export.

---

## Clone-your-own (others)

Each person who clones this repo needs:

- Their own Supabase project (Postgres + Storage bucket)
- Their own Render services
- Their own Google OAuth client
- Fresh migration from their SQLite or empty start

Do **not** share production database URLs or service role keys.

---

## Scripts reference

| Script | Purpose |
|--------|---------|
| `backend/scripts/create_postgres_schema.py` | Alembic `upgrade head` on empty Supabase |
| `backend/scripts/migrate_sqlite_to_postgres.py` | Copy all rows preserving IDs |
| `backend/scripts/verify_migration.py` | Row count parity + local file checks |
| `backend/scripts/upload_storage_to_supabase.py` | Bulk upload `./storage/files` and `./storage/uploads` |

---

## Local development (unchanged)

```bash
docker compose up
```

Defaults: `DATABASE_URL=sqlite://...`, `STORAGE_BACKEND=local`, `BYPASS_AUTH=true`.

---

## Security notes

- Never commit `SUPABASE_SERVICE_ROLE_KEY` or `JWT_SECRET`
- Use `BYPASS_AUTH=false` on Render
- Change default `JWT_SECRET` before going online
- Bucket is private; downloads go through JWT-protected API routes
