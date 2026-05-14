"""Reset API - wipe all user data to fresh state, purge soft-deleted applications."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user
from app.db import get_db
from app.models import (
    Application,
    Company,
    CoverLetterVersion,
    CvExperience,
    CvProfile,
    CVVersion,
    Project,
    Recruiter,
    Role,
    User,
)
from app.schemas.reset_ops import (
    BackupInfo,
    PurgeSoftDeletedResponse,
    ResetAllResponse,
    SoftDeletedApplicationItem,
    SoftDeletedCountResponse,
    SoftDeletedListResponse,
)
from app.services import app_document_storage, storage
from app.services.db_backup import create_sqlite_backup

router = APIRouter(prefix="/api", tags=["reset"])


@router.get("/reset/soft-deleted-count", response_model=SoftDeletedCountResponse)
def soft_deleted_application_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """How many applications are soft-deleted for the current user."""
    n = (
        db.query(Application)
        .filter(
            Application.user_id == current_user.id,
            Application.deleted_at.isnot(None),
        )
        .count()
    )
    return SoftDeletedCountResponse(count=n)


@router.get("/reset/soft-deleted", response_model=SoftDeletedListResponse)
def list_soft_deleted_applications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List soft-deleted applications (for review before purge)."""
    apps = (
        db.query(Application)
        .options(
            joinedload(Application.company_rel),
            joinedload(Application.role_rel),
        )
        .filter(
            Application.user_id == current_user.id,
            Application.deleted_at.isnot(None),
        )
        .order_by(Application.deleted_at.desc())
        .all()
    )
    items = [
        SoftDeletedApplicationItem(
            uuid=a.uuid,
            company=a.company_rel.name if a.company_rel else "Unknown",
            role=a.role_rel.name if a.role_rel else "Unknown",
            deleted_at=a.deleted_at,
        )
        for a in apps
    ]
    return SoftDeletedListResponse(items=items)


@router.post("/reset/purge-soft-deleted", response_model=PurgeSoftDeletedResponse)
def purge_soft_deleted_applications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Permanently remove soft-deleted applications (deleted_at set) and their files.
    """
    user_id = current_user.id
    uuids = [
        r[0]
        for r in db.query(Application.uuid)
        .filter(
            Application.user_id == user_id,
            Application.deleted_at.isnot(None),
        )
        .all()
    ]
    for app_uuid in uuids:
        app_document_storage.delete_application_folder(user_id, app_uuid)
    if not uuids:
        return PurgeSoftDeletedResponse(purged_count=0)
    db.query(Application).filter(
        Application.user_id == user_id,
        Application.deleted_at.isnot(None),
    ).delete(synchronize_session=False)
    db.commit()
    return PurgeSoftDeletedResponse(purged_count=len(uuids))


@router.post("/reset", response_model=ResetAllResponse)
def reset_all_data(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Wipe all data for the current user: applications (including soft-deleted rows),
    companies, recruiters, roles, CV profile/experience, projects, portfolio, uploads.
    Backs up the SQLite DB file first when applicable. Keeps user account and AI prompts.
    """
    user_id = current_user.id

    backup = create_sqlite_backup()
    backup_model = BackupInfo(**backup) if backup else None

    # 1. Delete all application document files (users/{user_id}/)
    app_document_storage.delete_user_application_files(user_id)

    # 2. Delete all CV upload files (uploads/{user_id}/)
    storage.delete_user_uploads(user_id)

    # 3. Delete applications (CASCADE: stages, notes, job_descriptions, documents, SWOT, prospect)
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

    # 8. Portfolio projects and CV profile (not tied to applications)
    db.query(Project).filter(Project.user_id == user_id).delete(
        synchronize_session=False
    )
    db.query(CvExperience).filter(CvExperience.user_id == user_id).delete(
        synchronize_session=False
    )
    db.query(CvProfile).filter(CvProfile.user_id == user_id).delete(
        synchronize_session=False
    )

    db.commit()
    return ResetAllResponse(
        message="Reset complete. Your account and server-side AI prompts are unchanged.",
        backup=backup_model,
    )
