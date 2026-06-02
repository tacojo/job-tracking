# Job Tracker Project Overview

This document describes the Job Tracker application and how it works today.

## 1) Project goal

The goal is to keep the full job-search workflow in one place:
- applications and pipeline stages
- CV and supporting documents
- prospecting and tailoring support
- progress visibility

The app is local-first: SQLite + local file storage.

---

## 2) High-level architecture

Two main parts:
- **Frontend**: React app (UI)
- **Backend**: FastAPI service (API + data + file operations)

Typical flow:
1. User opens a page in the frontend.
2. Frontend calls backend endpoints.
3. Backend reads/writes database and storage.
4. Backend returns JSON.
5. Frontend renders updated state.

Authentication is required for protected pages (Google OAuth in normal flow, dev-bypass in local testing).

---

## 3) Main user journeys

### A) Application tracking
1. Create application with company, role, optional recruiter, and job URL.
2. Update details and notes.
3. Track progress through stages.
4. Soft-delete when no longer active.

### B) Stage management
1. Add/edit/delete stage events for an application.
2. Backend enforces ordering and stage-flow rules.
3. The latest stage is treated as the current status in list/filter views.

### C) CV and tailoring workflow
1. Build CV source from structured profile/experience data.
2. Provide job description input.
3. Generate tailored output.
4. Review changes, then explicitly save/export files.

---

## 4) Stage system (core business logic)

Stage events are stored in `application_events` (model `Stage`) with:
- `application_id`
- `stage_type`
- `scheduled_at`
- `notes`
- optional interview metadata
- `created_at`

Rules enforced by API include:
- valid first stage
- no duplicate stage type per application at API level
- no additional stages after terminal states (`OFFER`, `REJECTED`, `NO_FEEDBACK`)
- sequential numbered stages (`STAGE_1`, `STAGE_2`, ...)
- chronological consistency for create/update

Current stage is derived from the latest event (by `scheduled_at`, fallback `created_at`).

---

## 5) Data model (functional groups)

Main entities include:
- applications and stage events
- job descriptions, prospect answers, and attachments
- CV profile and CV experience records
- normalized company/recruiter/role references

Files are stored in local storage paths; metadata is stored in database tables.

---

## 6) Repository structure

```text
job_tracking/
├── backend/                # FastAPI app (Poetry)
├── frontend/               # React + Vite app
├── docs/                   # Additional docs
├── scratch/                # Planning and working notes
├── storage/                # Runtime DB/files (kept local, gitignored)
├── docker-compose.yml
├── .env.example
├── README.md
└── JOB_TRACKER_JOURNEY.md  # This file
```

---

## 7) Delivered capabilities

- OAuth-protected app access
- application CRUD
- stage timeline management with validation
- document upload/preview flows
- CV profile and experience management
- tailoring workflow with explicit save/export behavior

---

## 8) Technical notes and next steps

Current known follow-ups:
- add database-level uniqueness for stage type per application
- adopt formal migration tooling for long-term schema evolution
- continue hardening validation/constraints where beneficial

---

## 9) Security backlog (TODO)

Rows are ordered by **practical impact** (top first) for internet-facing or shared deployments. Each row is a TODO to close before treating the stack as production-grade.

| Area | Assessment |
|------|------------|
| **Secrets in production** | `APP_ENV=production` now fails startup on default `JWT_SECRET`, `BYPASS_AUTH=true`, missing OAuth credentials, or missing `SECRETS_ENCRYPTION_KEY`. Keep this enabled for hosted deployments. |
| **OAuth callback token handling** | Production OAuth now sets an HttpOnly cookie and no longer redirects with `?auth_token=`. Legacy URL-token ingestion was removed; Dev login still uses localStorage bearer tokens only when `BYPASS_AUTH=true`. |
| **Cookie auth CSRF** | Cookie sessions use a double-submit CSRF token plus Origin allowlist checks for unsafe methods. Production only allows `FRONTEND_URL`; localhost is dev-only. |
| **HTML preview/XSS** | DOCX preview HTML from Mammoth is sanitized before `dangerouslySetInnerHTML`, and Render static headers include CSP without inline scripts. Long-term option: replace the custom sanitizer with DOMPurify when npm is available. |
| **`BYPASS_AUTH` default `true` in Docker** | Convenient for dev; **easy to ship misconfigured**. Document loudly; consider default `false` and explicit opt-in for a compose “dev” profile. |
| **CORS** | `allow_origins` includes fixed localhost entries plus `settings.frontend_url` (`backend/app/main.py`). For production, **avoid `*`** (not used today — good) and keep the list **minimal**. |
| **Session + JWT same secret** | `SessionMiddleware` uses `settings.jwt_secret` (`main.py`). Works, but **separating** session signing from JWT signing is cleaner. |
| **Container image** | Backend `Dockerfile` runs as **root**, no read-only FS, no non-root user — common gap before production hardening. |

