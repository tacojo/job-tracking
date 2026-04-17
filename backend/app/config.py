"""Application configuration from environment."""

from pathlib import Path
from typing import Self

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Settings loaded from .env and environment."""

    database_url: str = "sqlite:///./storage/db/job_tracking.db"
    storage_path: Path = Path("./storage")
    # Root for application documents (per-app uploads). Empty = STORAGE_PATH/files.
    files_root: str = Field(
        default="", description="Override; default is STORAGE_PATH/files"
    )
    debug: bool = False

    @model_validator(mode="after")
    def derive_files_root(self) -> Self:
        if not self.files_root or not str(self.files_root).strip():
            object.__setattr__(
                self,
                "files_root",
                str(Path(self.storage_path) / "files"),
            )
        return self

    # Google OAuth (required for auth)
    google_client_id: str = ""
    google_client_secret: str = ""

    # JWT
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7  # 7 days

    # URLs (for OAuth redirect_uri and frontend redirect)
    backend_url: str = "http://localhost:8000"
    frontend_url: str = "http://localhost:5173"

    # Dev: bypass Google auth for local testing
    bypass_auth: bool = False

    # OpenAI (for prospect / tailor CV and cover letter)
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"  # Displayed in AI settings (not editable)

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
