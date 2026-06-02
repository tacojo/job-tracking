# Job Tracker

Manage CV versions and job applications with pipeline stages. Prospect answers, tailor CV and cover letters from job descriptions, and parse CVs with optional **OpenAI** when each user adds their API key in **Settings → AI settings**.

## How To Run It

The app has three separate pieces of configuration:

- `DATABASE_URL` controls application data: users, applications, stages, CV profiles, notes, learning data, and AI settings.
- `STORAGE_BACKEND` controls uploaded files only: CV uploads, cover letters, job description files, and application documents.
- `BYPASS_AUTH` controls whether local Dev login is available instead of Google OAuth.

Setting `STORAGE_BACKEND=supabase` does **not** move applications to Supabase. To use Supabase for the application list, set `DATABASE_URL` to your Supabase Postgres connection string.

You do **not** need to create a `storage/` folder by hand. The backend creates `./storage` (database directory, files root, and uploads as needed) when it starts.

### Mode 1 — Fully Local

Use this when you want to clone the repo and run the app without Supabase.

- Database: local SQLite under `./storage/db/job_tracking.db`
- Uploaded files: local `./storage`
- Auth: Dev login (`BYPASS_AUTH=true`)

1. Install [Docker](https://docs.docker.com/get-docker/) and Docker Compose.
2. Clone this repository and open a terminal in the project root (the folder that contains `docker-compose.yml`).
3. Create your environment file:

   ```bash
   cp .env.example .env
   ```

4. Keep these local defaults in `.env`:

   ```env
   DATABASE_URL=sqlite:///./storage/db/job_tracking.db
   STORAGE_BACKEND=local
   STORAGE_PATH=./storage
   BYPASS_AUTH=true
   BACKEND_URL=http://localhost:8000
   FRONTEND_URL=http://localhost:5173
   ```

5. Start everything:

   ```bash
   docker compose up --build
   ```

6. Open **http://localhost:5173**.

Data persists under `./storage/` across restarts and `docker compose down`.

### Mode 2 — Local App With Your Own Supabase

Use this when you want to run the frontend and backend locally, but store app data and uploads in your own Supabase project.

- Database: Supabase Postgres
- Uploaded files: Supabase Storage
- Auth: Dev login locally, or Google OAuth if you configure it

1. Create a Supabase project.
2. Copy the **direct** database connection string from Supabase. Use the direct connection on port `5432` with `sslmode=require`, not the pooler, for migrations/startup schema creation.
3. Create a private Supabase Storage bucket, for example `job-tracker-files`.
4. Update `.env` in the project root:

   ```env
   DATABASE_URL=postgresql+psycopg2://postgres.[ref]:[PASSWORD]@db.[ref].supabase.co:5432/postgres?sslmode=require
   DATABASE_URL_POSTGRES=postgresql+psycopg2://postgres.[ref]:[PASSWORD]@db.[ref].supabase.co:5432/postgres?sslmode=require
   STORAGE_BACKEND=supabase
   STORAGE_PATH=./storage
   SUPABASE_URL=https://[ref].supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   SUPABASE_STORAGE_BUCKET=job-tracker-files
   BYPASS_AUTH=true
   BACKEND_URL=http://localhost:8000
   FRONTEND_URL=http://localhost:5173
   JWT_SECRET=change-me-to-a-local-random-string
   ```

5. Start the app:

   ```bash
   docker compose up --build
   ```

On startup, the backend runs Alembic migrations when `DATABASE_URL` points to Postgres, so a fresh Supabase database gets the application tables automatically. The Storage bucket still needs to be created manually in Supabase.

### Mode 3 — Online Deployment

Use this when you want the app available from any device.

- Backend: Render Docker web service
- Frontend: Render static site
- Database: Supabase Postgres
- Uploaded files: Supabase Storage
- Auth: Google OAuth (`BYPASS_AUTH=false`)

Deploy from `render.yaml` or follow the full runbook in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Set the Render backend `DATABASE_URL` to your Supabase Postgres direct connection string, set `STORAGE_BACKEND=supabase`, and provide the Supabase service role key and bucket name.

### Local Without Docker

1. Install **Python 3.11+**, **Poetry**, and **Node.js** (18+).
2. Clone the repository and go to the project root.
3. Backend terminal:

   ```bash
   cd backend
   poetry install
   cp .env.example .env
   poetry run uvicorn app.main:app --reload
   ```

   The backend reads `.env` from the current working directory (`backend/`), so keep `backend/.env` there. You can copy from `backend/.env.example` or from the project root’s `.env.example` (they match).

4. Frontend terminal:

   ```bash
   cd frontend
   npm ci
   npm run dev
   ```

5. Open **http://localhost:5173**.

API docs: **http://localhost:8000/docs**. Database readiness: **http://localhost:8000/ready**.

`npm run dev` and the Docker frontend entrypoint create `docs/tickets.json`, `docs/adrs.json`, and `docs/activity-log.json` from `docs/*.sample.json` when those files are missing. Log JSON is gitignored.

`package-lock.json` is committed so `npm ci` matches CI and Docker. After changing frontend dependencies, run `npm install`, update the lockfile, and commit it.

**Hot-reload:** Docker mounts `backend/app/` and `frontend/src/`, so app code edits reload without rebuilding the image. Rebuild when you change `requirements.txt`, `package.json`, or a Dockerfile.

### Optional Next Steps

| If you want… | Do this |
|--------------|---------|
| **Google sign-in** instead of Dev login | Set `BYPASS_AUTH=false` in `.env`, add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, and follow [Google OAuth setup](#google-oauth-setup) for the redirect URI. |
| **OpenAI** (prospect answers, tailoring, optional CV parsing) | Set `SECRETS_ENCRYPTION_KEY` in `.env`, then add a **dedicated test API key** under **Settings → AI settings**. Revoke it on [OpenAI](https://platform.openai.com/api-keys) when you are done and remove it in Settings. |
| **Git hooks** for Poetry → `requirements.txt` | See [Development Hooks](#development-hooks-optional-but-recommended). |

Auth routes use `/api/v1` (for example `/api/v1/auth/callback`). Most REST APIs are under `/api/...` (for example `/api/applications`). Open `/docs` on the backend for the full list.

## Google OAuth Setup

Google OAuth is used when `BYPASS_AUTH` is false.

When `BYPASS_AUTH=true`, the Login page shows a **Dev login** button and you do not need `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a project (or select existing)
3. Create **OAuth 2.0 Client ID** (Application type: Web application)
4. Add **Authorised redirect URI**: `http://localhost:8000/api/v1/auth/callback`
5. Copy Client ID and Client Secret into `.env` (project root for Docker; `backend/.env` for local backend)

## Development Hooks (optional but recommended)

This repo uses `pre-commit` to keep `backend/requirements.txt` in sync when `backend/pyproject.toml` or `backend/poetry.lock` changes.

The Poetry export hook runs under `bash`; on Windows, install [Git for Windows](https://git-scm.com/download/win) (Git Bash) or use WSL if you do not already have `bash` available.

After cloning, run once:

```bash
pip install pre-commit
pre-commit install
```

If a commit updates `backend/requirements.txt`, re-stage it and commit again:

```bash
git add backend/requirements.txt
git commit
```

**When to run `pre-commit run --all-files` (optional):**  
`pre-commit install` is enough for hooks to run on future commits. Use `pre-commit run --all-files` when you want to run every configured hook on the whole repo **without** making a commit—for example:

- **Smoke-test** your setup after installing hooks or changing `.pre-commit-config.yaml`.
- **Regenerate** `backend/requirements.txt` from the current Poetry lockfile in one go (useful if `requirements.txt` drifted or you pulled dependency changes).
- **Catch** hook failures before you commit (CI-style check on your machine).

```bash
pre-commit run --all-files
```

## Project Structure

```
job_tracking/
├── backend/          # FastAPI app (Poetry)
│   ├── app/
│   │   ├── api/      # Routers (e.g. auth, applications, stages, documents, prospect, cv-profile, health)
│   │   ├── models/   # SQLAlchemy models
│   │   ├── schemas/  # Pydantic schemas
│   │   └── services/ # Storage, documents, CV parsing, etc.
│   └── pyproject.toml
├── frontend/         # React + Vite + Bootstrap
├── docker-compose.yml
└── README.md
```

## Features

- **Authentication** — Google OAuth when `BYPASS_AUTH` is false; **Dev login** when `BYPASS_AUTH` is true (no Google keys needed).
- **CV upload & preview** — upload PDF or DOCX, preview inline without opening.
- **CV Profile** — parse a DOCX CV to extract experience (optional OpenAI-assisted parsing), edit in a table, export to DOCX or PDF with templates.
- **Applications** — CRUD with company, role, recruiter, job URL, JD text, notes — per user (soft delete).
- **Pipeline stages** — timeline per application with validation: Applied → Recruiter Call → Stage 1–5 → Offer, Rejected, or No Feedback (terminal stages block further pipeline stages).
- **Prospect & tailoring** — AI-assisted answers and tailored CV/cover letter flows when the user has saved an OpenAI API key in Settings.
- **Analytics, CV versions, cover letters, application documents** — supporting APIs and UI.
- **Health** — `GET /health` (liveness), `GET /ready` (database readiness); Bootstrap UI.

## Project log

Tickets (`JAT-*`), architectural decisions (`ADR-*`), and a minimal session log live under **`docs/`** and are browsable in the app at **http://localhost:5173/project-log** (header: **Project log**). See [docs/TICKETS.md](docs/TICKETS.md) and [docs/LOGGING.md](docs/LOGGING.md) for how to update them.

**Git:** `docs/tickets.json`, `docs/adrs.json`, and `docs/activity-log.json` are **not committed** (local/agent history). Committed **`docs/*.sample.json`** files bootstrap an empty log on first run (Docker entrypoint or `npm run dev` predev).

## Roadmap (examples)

- Deeper doc import/export and calendar views
- Linked folders and further polish

## Online deployment (Supabase + Render)

Use the app from any device by hosting the API on **Render**, the database on **Supabase Postgres**, and uploads on **Supabase Storage**. Local `./storage` stays as backup after cutover.

Full runbook: **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** (schema prep, migration scripts, cutover checklist).

## Configuration

Environment variables are documented in **`.env.example`** (same content at the **project root** and under **`backend/`**). Copy to **`.env` in the project root** when using Docker Compose; copy to **`backend/.env`** when running `uvicorn` from the `backend/` folder (see [How To Run It](#how-to-run-it)).

| Variable              | Default                    | Description |
|-----------------------|----------------------------|-------------|
| APP_ENV               | development                | Set to `production` on hosted deployments to fail startup on unsafe auth/secrets config. |
| BYPASS_AUTH           | `false`                    | Skip Google OAuth and show Dev login when `true`. Root `.env.example` sets `true`; Docker Compose defaults to `true` if the variable is unset. |
| GOOGLE_CLIENT_ID      | (empty)                    | Required when `BYPASS_AUTH` is false |
| GOOGLE_CLIENT_SECRET  | (empty)                    | Required when `BYPASS_AUTH` is false |
| JWT_SECRET            | change-me-in-production    | Secret for JWT signing and session middleware |
| BACKEND_URL           | http://localhost:8000      | Backend URL (OAuth `redirect_uri`) |
| FRONTEND_URL          | http://localhost:5173      | Frontend URL (post-login redirect) |
| DATABASE_URL          | sqlite:///./storage/db/job_tracking.db | Database for application records. Use SQLite locally or a Supabase/Postgres URL for cloud data. |
| DATABASE_URL_POSTGRES | (empty)                    | Optional explicit Postgres URL for migration/schema scripts; often the same as Supabase `DATABASE_URL`. |
| STORAGE_BACKEND       | local                      | File/blob storage only: `local` writes to disk, `supabase` writes uploads to Supabase Storage. |
| SUPABASE_URL          | (empty)                    | Required when `STORAGE_BACKEND=supabase`. |
| SUPABASE_SERVICE_ROLE_KEY | (empty)                | Backend only; never expose to frontend |
| SUPABASE_STORAGE_BUCKET | job-tracker-files        | Private bucket for CVs, JDs, etc. |
| STORAGE_PATH          | ./storage                  | Base path for file storage |
| FILES_ROOT            | (STORAGE_PATH)/files       | Application documents root; optional override |
| VITE_API_URL          | (empty)                    | Render static site build; backend URL |
| SECRETS_ENCRYPTION_KEY | (empty)                    | Fernet key for encrypting per-user OpenAI keys at rest; required to save keys in Settings |
