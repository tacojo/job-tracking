"""FastAPI application entry point."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.sessions import SessionMiddleware

from app.api import (
    ai_settings,
    analytics,
    application_documents,
    application_prospect,
    applications,
    auth,
    companies,
    cover_letters,
    cv_profile,
    cv_versions,
    health,
    learning,
    projects,
    prospect,
    recruiters,
    reset,
    roles,
    stages,
)
from app.config import settings
from app.db import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: initialise DB tables."""
    init_db()
    yield


app = FastAPI(
    title="Job Tracking API",
    description="Manage CV versions and job applications with pipeline stages",
    version="0.1.0",
    lifespan=lifespan,
)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc: RequestValidationError):
    """
    Return a more helpful message than the generic 'Unprocessable Entity'.

    We keep the underlying errors for debugging, but expose a clear summary message
    that the frontend can show directly to the user.
    """
    return JSONResponse(
        status_code=422,
        content={
            "detail": "Some fields have invalid values. For date fields, use formats like 'Oct 2022' or '2022-10'.",
            "errors": exc.errors(),
        },
    )


app.add_middleware(
    SessionMiddleware,
    secret_key=settings.jwt_secret,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.frontend_url,
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth.router, prefix="/api/v1")
app.include_router(analytics.router)
app.include_router(reset.router)
app.include_router(
    applications.router
)  # before application_documents so POST /{id}/notes is matched
app.include_router(application_documents.router)
app.include_router(application_prospect.router)
app.include_router(companies.router)
app.include_router(cv_versions.router)
app.include_router(cv_profile.router)
app.include_router(cover_letters.router)
app.include_router(projects.router)
app.include_router(prospect.router)
app.include_router(ai_settings.router)
app.include_router(learning.router)
app.include_router(recruiters.router)
app.include_router(roles.router)
app.include_router(stages.router)
