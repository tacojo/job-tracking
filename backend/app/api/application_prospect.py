"""Application prospect API: prospect tab (tailor CV/cover letter, Q&A) per application."""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user
from app.api.prospect import do_tailor
from app.db import get_db
from app.models import (
    Application,
    ApplicationDocument,
    ApplicationProspectAnswer,
    CvExperience,
    CvProfile,
    JobDescription,
    User,
)
from app.schemas import ApplicationDocumentRead
from app.services import app_document_storage
from app.services.cv_export import (
    cv_experiences_to_text,
    export_tailored_cv_docx,
    list_tailored_cv_templates,
)
from app.services.docx_from_text import create_docx_from_text
from app.services.text_extract import extract_text

router = APIRouter(prefix="/api/applications", tags=["application-prospect"])


def _resolve_app(db: Session, app_id: str, user_id: int) -> Application:
    """Get application by uuid or id, ensure user owns it."""
    q = db.query(Application).filter(Application.user_id == user_id)
    if app_id.isdigit():
        app = q.filter(Application.id == int(app_id)).first()
    else:
        app = q.filter(Application.uuid == app_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    return app


class ProspectAnswerItem(BaseModel):
    id: Optional[int] = None
    question: str
    answer: Optional[str] = None


class ProspectAnswersList(BaseModel):
    items: List[ProspectAnswerItem]


class ProspectAnswerRead(BaseModel):
    id: int
    question: str
    answer: Optional[str] = None

    class Config:
        from_attributes = True


class TailorRequest(BaseModel):
    cover_letter_id: Optional[int] = None


class TailorResponse(BaseModel):
    original_cv: Optional[str] = None
    tailored_cv: Optional[str] = None
    tailored_cover_letter: Optional[str] = None
    documents: List[ApplicationDocumentRead] = []


class SaveDocxRequest(BaseModel):
    tailored_cv: Optional[str] = None
    tailored_cover_letter: Optional[str] = None
    cv_template: str = "default"


class JobSpecRequest(BaseModel):
    text: str


@router.get("/{app_id}/prospect/answers", response_model=List[ProspectAnswerRead])
def list_prospect_answers(
    app_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List prospect Q&A rows for this application (question, answer per row)."""
    app = _resolve_app(db, app_id, current_user.id)
    rows = (
        db.query(ApplicationProspectAnswer)
        .filter(ApplicationProspectAnswer.application_id == app.id)
        .order_by(ApplicationProspectAnswer.sort_order, ApplicationProspectAnswer.id)
        .all()
    )
    return [
        ProspectAnswerRead(id=r.id, question=r.question, answer=r.answer) for r in rows
    ]


@router.put("/{app_id}/prospect/answers", response_model=List[ProspectAnswerRead])
def save_prospect_answers(
    app_id: str,
    data: ProspectAnswersList,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Replace all prospect answers for this application. Each item: question, answer."""
    app = _resolve_app(db, app_id, current_user.id)
    # Delete existing
    db.query(ApplicationProspectAnswer).filter(
        ApplicationProspectAnswer.application_id == app.id
    ).delete()
    # Insert new rows
    result = []
    for i, item in enumerate(data.items):
        row = ApplicationProspectAnswer(
            application_id=app.id,
            question=(item.question or "").strip() or "(Question)",
            answer=(item.answer or "").strip() or None,
            sort_order=i,
        )
        db.add(row)
        result.append(row)
    db.commit()
    for r in result:
        db.refresh(r)
    return [
        ProspectAnswerRead(id=r.id, question=r.question, answer=r.answer)
        for r in result
    ]


def _next_version_for_doc_type(db: Session, application_id: int, doc_type: str) -> int:
    max_ver = (
        db.query(ApplicationDocument.version)
        .filter(
            ApplicationDocument.application_id == application_id,
            ApplicationDocument.doc_type == doc_type,
        )
        .order_by(ApplicationDocument.version.desc())
        .first()
    )
    return (max_ver[0] + 1) if max_ver else 1


def _get_profile_and_experiences(db: Session, user_id: int) -> tuple[dict, list]:
    """Return (profile_dict, experiences_list) for cv_experiences_to_text."""
    prof = db.query(CvProfile).filter(CvProfile.user_id == user_id).first()
    profile_data = (
        {
            "full_name": prof.full_name or "",
            "tagline": prof.tagline or "",
            "summary": prof.summary or "",
        }
        if prof
        else {"full_name": "", "tagline": "", "summary": ""}
    )
    rows = db.query(CvExperience).filter(CvExperience.user_id == user_id).all()
    from app.api.cv_profile import (
        _experience_sort_key,
    )  # avoid circular import at module import time

    sorted_rows = sorted(rows, key=_experience_sort_key, reverse=True)
    experiences = [
        {
            "employer": e.employer or "",
            "employer_link": e.employer_link or "",
            "role": e.role or "",
            "start_date": e.start_date or "",
            "end_date": e.end_date or "",
            "flag": e.flag or "gb",
            "location": e.location or "",
            "employment_type": e.employment_type or "Full time",
            "duration": e.duration or "Permanent",
            "level": e.level or "Mid level",
            "skills": e.skills or [],
            "details": e.details or [],
        }
        for e in sorted_rows
    ]
    return profile_data, experiences


@router.post("/{app_id}/prospect/tailor", response_model=TailorResponse)
def tailor_for_application(
    app_id: str,
    data: TailorRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Tailor CV (from cv_experiences) and/or cover letter to job spec. Returns original + tailored text; does not save."""
    app = (
        db.query(Application)
        .options(
            joinedload(Application.company_rel),
            joinedload(Application.job_description),
        )
        .filter(Application.id == _resolve_app(db, app_id, current_user.id).id)
        .first()
    )
    job_spec = (app.job_description.text if app.job_description else None) or ""
    job_spec = (job_spec or "").strip()

    if not job_spec:
        jd_doc = (
            db.query(ApplicationDocument)
            .filter(
                ApplicationDocument.application_id == app.id,
                ApplicationDocument.doc_type == "jd",
            )
            .order_by(ApplicationDocument.version.desc())
            .first()
        )
        if jd_doc:
            content = app_document_storage.read_document(jd_doc.storage_path)
            job_spec = (extract_text(content, jd_doc.format or "") or "").strip()

    if not job_spec:
        raise HTTPException(
            status_code=400,
            detail="Add a job description: paste the text in Application Details, or upload a JD document.",
        )
    company = (app.company_rel.name if app.company_rel else "") or ""

    profile_data, experiences = _get_profile_and_experiences(db, current_user.id)
    original_cv = cv_experiences_to_text(profile_data, experiences)
    if not original_cv or original_cv == "(No CV content)":
        raise HTTPException(
            status_code=400,
            detail="Add your CV content: go to My CVs / CV profile and add experiences (or parse from an uploaded CV).",
        )

    response = do_tailor(
        db,
        current_user,
        company,
        job_spec,
        cv_id=None,
        cover_letter_id=data.cover_letter_id,
        cv_text=original_cv,
    )

    return TailorResponse(
        original_cv=original_cv,
        tailored_cv=response.tailored_cv,
        tailored_cover_letter=response.tailored_cover_letter,
        documents=[],
    )


@router.get("/{app_id}/prospect/templates")
def get_tailored_cv_templates(app_id: str):
    """List template names for tailored CV DOCX (default, modern, minimal)."""
    return {"templates": list_tailored_cv_templates()}


@router.post("/{app_id}/prospect/save-docx", response_model=TailorResponse)
def save_tailored_docx(
    app_id: str,
    data: SaveDocxRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Save tailored CV and/or cover letter as DOCX (on request). Uses profile for header; optional template."""
    app = _resolve_app(db, app_id, current_user.id)
    if not data.tailored_cv and not data.tailored_cover_letter:
        raise HTTPException(
            status_code=400,
            detail="Provide at least one of tailored_cv or tailored_cover_letter.",
        )
    if data.cv_template not in list_tailored_cv_templates():
        data.cv_template = "default"
    profile_data, _ = _get_profile_and_experiences(db, current_user.id)
    created_docs: List[ApplicationDocumentRead] = []

    docs_to_add: List[ApplicationDocument] = []
    if data.tailored_cv:
        docx_bytes = export_tailored_cv_docx(
            profile_data, (data.tailored_cv or "").strip(), data.cv_template
        )
        filename = "tailored_cv.docx"
        version = _next_version_for_doc_type(db, app.id, "tailored_cv")
        storage_path = app_document_storage.save_document(
            user_id=current_user.id,
            app_uuid=app.uuid,
            doc_type="tailored_cv",
            filename=filename,
            content=docx_bytes,
        )
        doc = ApplicationDocument(
            application_id=app.id,
            doc_type="tailored_cv",
            version=version,
            filename=filename,
            storage_path=storage_path,
            format="docx",
            mime_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            size_bytes=len(docx_bytes),
            storage_provider="local",
            created_by=current_user.id,
        )
        db.add(doc)
        docs_to_add.append(doc)

    if data.tailored_cover_letter:
        docx_bytes = create_docx_from_text((data.tailored_cover_letter or "").strip())
        filename = "tailored_cover_letter.docx"
        version = _next_version_for_doc_type(db, app.id, "tailored_cover_letter")
        storage_path = app_document_storage.save_document(
            user_id=current_user.id,
            app_uuid=app.uuid,
            doc_type="tailored_cover_letter",
            filename=filename,
            content=docx_bytes,
        )
        doc = ApplicationDocument(
            application_id=app.id,
            doc_type="tailored_cover_letter",
            version=version,
            filename=filename,
            storage_path=storage_path,
            format="docx",
            mime_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            size_bytes=len(docx_bytes),
            storage_provider="local",
            created_by=current_user.id,
        )
        db.add(doc)
        docs_to_add.append(doc)

    if docs_to_add:
        db.commit()
        for doc in docs_to_add:
            db.refresh(doc)
            created_docs.append(ApplicationDocumentRead.model_validate(doc))

    return TailorResponse(
        original_cv=None,
        tailored_cv=data.tailored_cv,
        tailored_cover_letter=data.tailored_cover_letter,
        documents=created_docs,
    )


@router.post("/{app_id}/prospect/job-spec", response_model=ApplicationDocumentRead)
def set_job_spec_from_text(
    app_id: str,
    data: JobSpecRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Save job spec text into JobDescription and create a JD document for preview in attachments."""
    app = (
        db.query(Application)
        .options(joinedload(Application.job_description))
        .filter(Application.id == _resolve_app(db, app_id, current_user.id).id)
        .first()
    )
    text = (data.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Job spec text is required.")

    # Update or create JobDescription row
    if app.job_description:
        app.job_description.text = text
    else:
        jd = JobDescription(
            application_id=app.id,
            text=text,
            source_url=None,
            created_by=current_user.id,
        )
        db.add(jd)

    # Create a JD ApplicationDocument (txt) so it shows in attachments
    version = _next_version_for_doc_type(db, app.id, "jd")
    content_bytes = text.encode("utf-8")
    storage_path = app_document_storage.save_document(
        user_id=current_user.id,
        app_uuid=app.uuid,
        doc_type="jd",
        filename="job_spec.txt",
        content=content_bytes,
    )
    doc = ApplicationDocument(
        application_id=app.id,
        doc_type="jd",
        version=version,
        filename="job_spec.txt",
        storage_path=storage_path,
        format="txt",
        mime_type="text/plain",
        size_bytes=len(content_bytes),
        storage_provider="local",
        created_by=current_user.id,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return ApplicationDocumentRead.model_validate(doc)
