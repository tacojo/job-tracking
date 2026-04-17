"""Reset API - wipe all user data to fresh state."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db import get_db
from app.models import (
    Application,
    Company,
    CoverLetterVersion,
    CVVersion,
    Recruiter,
    Role,
    User,
)
from app.services import app_document_storage, storage

router = APIRouter(prefix="/api", tags=["reset"])


@router.post("/reset", status_code=204)
def reset_all_data(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Wipe all data for the current user: applications, companies, recruiters,
    roles, uploaded files (CVs, application documents). Keeps user account.
    App will look like first-time use.
    """
    user_id = current_user.id

    # 1. Delete all application document files (users/{user_id}/)
    app_document_storage.delete_user_application_files(user_id)

    # 2. Delete all CV upload files (uploads/{user_id}/)
    storage.delete_user_uploads(user_id)

    # 3. Delete applications (cascade: application_events, application_notes, job_descriptions, application_documents)
    db.query(Application).filter(Application.user_id == user_id).delete(
        synchronize_session=False
    )

    # 4. Delete companies (cascade: company_notes)
    db.query(Company).filter(Company.user_id == user_id).delete(
        synchronize_session=False
    )

    # 5. Delete recruiters (cascade: recruiter_notes)
    db.query(Recruiter).filter(Recruiter.user_id == user_id).delete(
        synchronize_session=False
    )

    # 6. Delete roles
    db.query(Role).filter(Role.user_id == user_id).delete(synchronize_session=False)

    # 7. Delete CV and cover letter versions (files already removed in step 2)
    db.query(CVVersion).filter(CVVersion.user_id == user_id).delete(
        synchronize_session=False
    )
    db.query(CoverLetterVersion).filter(CoverLetterVersion.user_id == user_id).delete(
        synchronize_session=False
    )

    db.commit()
    return None
