"""Application prospect API: prospect tab (tailor CV/cover letter, Q&A) per application."""

from datetime import datetime
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
    ApplicationSwotAnalysis,
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


class SwotAnalysisResponse(BaseModel):
    strengths: List[str]
    weaknesses: List[
        dict
    ]  # Each weakness will have 'text' and 'search_terms' (list of phrases to Google)
    opportunities: List[str]
    threats: List[str]


class SaveSwotAnalysisRequest(BaseModel):
    strengths: List[str]
    weaknesses: List[dict]
    opportunities: List[str]
    threats: List[str]


class SavedSwotAnalysisResponse(BaseModel):
    id: int
    strengths: List[str]
    weaknesses: List[dict]
    opportunities: List[str]
    threats: List[str]
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


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


@router.post("/{app_id}/prospect/swot-analysis", response_model=SwotAnalysisResponse)
def generate_swot_analysis(
    app_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate a SWOT analysis comparing the user's CV against the job specification."""
    app = (
        db.query(Application)
        .options(
            joinedload(Application.company_rel),
            joinedload(Application.job_description),
        )
        .filter(Application.id == _resolve_app(db, app_id, current_user.id).id)
        .first()
    )

    if not app:
        raise HTTPException(
            status_code=404,
            detail="Application not found.",
        )

    # Get job spec
    job_spec = (app.job_description.text if app.job_description else None) or ""
    job_spec = (job_spec or "").strip()

    if not job_spec:
        # Try to get from JD document
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
            detail="Job description not available. Please add a job description first.",
        )

    # Get CV content
    profile_data, experiences = _get_profile_and_experiences(db, current_user.id)
    cv_text = cv_experiences_to_text(profile_data, experiences)
    if not cv_text or cv_text == "(No CV content)":
        raise HTTPException(
            status_code=400,
            detail="CV content not available. Please add your CV experiences first.",
        )

    # Create SWOT analysis prompt
    system_prompt = (
        "You are a professional career adviser conducting a detailed SWOT analysis. "
        "Use British English spelling and terminology throughout your response. "
        "Analyse the candidate's CV against the job specification thoroughly and respond with a JSON object. "
        "The JSON must have exactly four keys: strengths, weaknesses, opportunities, threats. "
        "- strengths: array of 4-5 strings highlighting strong matches between CV and job requirements\n"
        "- weaknesses: array of 3-5 objects, each with 'text' (the weakness) and 'search_terms' (array of 2-3 specific Google search phrases)\n"
        "- opportunities: array of 3-5 strings about growth potential and advantages\n"
        "- threats: array of 3-5 strings about potential challenges or concerns\n\n"
        "Be thorough - examine skills, experience, tools, domain knowledge, leadership, technical depth, etc. "
        "For weaknesses, provide specific Google search phrases (not URLs) that will help find articles about addressing that weakness. "
        "Search phrases should be specific and actionable, like 'how to explain short job tenure in interview' or 'transitioning to new industry tips'."
    )

    user_content = (
        "Generate a comprehensive SWOT analysis comparing this CV with the job requirements.\n\n"
        f"Job Specification:\n{job_spec}\n\n---\n\nCandidate's CV:\n{cv_text}\n\n"
        "Example format for weaknesses:\n"
        '{"text": "Limited experience in domain X", "search_terms": ['
        '"how to explain limited domain experience interview", "learning domain X quickly", "addressing experience gaps interview"]}\n\n'
        "Respond with a JSON object only, no markdown or extra text."
    )

    # Call OpenAI with JSON mode
    import json
    import re

    from openai import OpenAI

    from app.config import settings

    if not settings.openai_api_key:
        raise HTTPException(
            status_code=503,
            detail="OpenAI API key is not configured. Set OPENAI_API_KEY in .env to use AI analysis.",
        )

    client = OpenAI(api_key=settings.openai_api_key)

    try:
        # Use JSON mode for reliable JSON output
        response = client.chat.completions.create(
            model=settings.openai_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
            response_format={"type": "json_object"},
            max_tokens=3000,
        )
        response_text = (response.choices[0].message.content or "").strip()

        # Parse the JSON response
        swot_data = json.loads(response_text)

    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to parse JSON response: {str(e)}. Response was: {response_text[:500]}",
        )
    except Exception as e:
        # If JSON mode fails, try without it
        error_msg = str(e)
        if "json_object" in error_msg.lower():
            # JSON mode not supported, try regular mode with explicit instructions
            try:
                response = client.chat.completions.create(
                    model=settings.openai_model,
                    messages=[
                        {
                            "role": "system",
                            "content": system_prompt
                            + " OUTPUT ONLY VALID JSON, NO MARKDOWN OR OTHER TEXT.",
                        },
                        {"role": "user", "content": user_content},
                    ],
                    max_tokens=3000,
                )
                response_text = (response.choices[0].message.content or "").strip()

                # Try to extract JSON from markdown code blocks
                json_match = re.search(
                    r"```(?:json)?\s*(\{[\s\S]*?\})\s*```", response_text
                )
                if json_match:
                    response_text = json_match.group(1)
                else:
                    # Try to find any JSON object
                    json_match = re.search(r"\{[\s\S]*\}", response_text)
                    if json_match:
                        response_text = json_match.group(0)

                swot_data = json.loads(response_text)
            except Exception as inner_e:
                raise HTTPException(
                    status_code=500,
                    detail=f"OpenAI API error: {str(inner_e)}. Response: {response_text[:500]}",
                )
        else:
            raise HTTPException(
                status_code=500,
                detail=f"OpenAI API error: {error_msg}",
            )

    # Validate the structure
    required_keys = ["strengths", "weaknesses", "opportunities", "threats"]
    for key in required_keys:
        if key not in swot_data:
            # Try alternative capitalization
            alt_key = key.capitalize()
            if alt_key in swot_data:
                swot_data[key] = swot_data[alt_key]
            else:
                raise HTTPException(
                    status_code=500,
                    detail=f"Missing required field '{key}' in SWOT analysis. Got keys: {list(swot_data.keys())}",
                )
        if not isinstance(swot_data[key], list):
            raise HTTPException(
                status_code=500,
                detail=f"Field '{key}' must be a list, got {type(swot_data[key])}.",
            )

    # Validate weaknesses structure (should be list of dicts with 'text' and 'search_terms')
    weaknesses = swot_data.get("weaknesses", [])
    for idx, weakness in enumerate(weaknesses):
        if isinstance(weakness, str):
            # Convert old string format to new dict format
            weaknesses[idx] = {"text": weakness, "search_terms": []}
        elif isinstance(weakness, dict):
            if "text" not in weakness:
                raise HTTPException(
                    status_code=500,
                    detail=f"Weakness {idx} missing 'text' field.",
                )
            # Handle both old 'resources' and new 'search_terms' keys
            if "search_terms" not in weakness:
                if "resources" in weakness:
                    # Convert old resources to search terms if present
                    weakness["search_terms"] = weakness.pop("resources", [])
                else:
                    weakness["search_terms"] = []
        else:
            raise HTTPException(
                status_code=500,
                detail=f"Weakness {idx} must be a string or dict.",
            )

    return SwotAnalysisResponse(
        strengths=swot_data.get("strengths", []),
        weaknesses=weaknesses,
        opportunities=swot_data.get("opportunities", []),
        threats=swot_data.get("threats", []),
    )


@router.post(
    "/{app_id}/prospect/swot-analysis/save", response_model=SavedSwotAnalysisResponse
)
def save_swot_analysis(
    app_id: str,
    data: SaveSwotAnalysisRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Save/preserve a SWOT analysis for an application."""
    import json

    app = _resolve_app(db, app_id, current_user.id)

    # Check if analysis already exists for this application
    existing = (
        db.query(ApplicationSwotAnalysis)
        .filter(ApplicationSwotAnalysis.application_id == app.id)
        .first()
    )

    if existing:
        # Update existing analysis
        existing.strengths = json.dumps(data.strengths)
        existing.weaknesses = json.dumps(data.weaknesses)
        existing.opportunities = json.dumps(data.opportunities)
        existing.threats = json.dumps(data.threats)
        existing.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(existing)
        saved_analysis = existing
    else:
        # Create new analysis
        saved_analysis = ApplicationSwotAnalysis(
            application_id=app.id,
            strengths=json.dumps(data.strengths),
            weaknesses=json.dumps(data.weaknesses),
            opportunities=json.dumps(data.opportunities),
            threats=json.dumps(data.threats),
        )
        db.add(saved_analysis)
        db.commit()
        db.refresh(saved_analysis)

    return SavedSwotAnalysisResponse(
        id=saved_analysis.id,
        strengths=json.loads(saved_analysis.strengths),
        weaknesses=json.loads(saved_analysis.weaknesses),
        opportunities=json.loads(saved_analysis.opportunities),
        threats=json.loads(saved_analysis.threats),
        created_at=saved_analysis.created_at.isoformat(),
        updated_at=saved_analysis.updated_at.isoformat(),
    )


@router.get(
    "/{app_id}/prospect/swot-analysis/saved", response_model=SavedSwotAnalysisResponse
)
def get_saved_swot_analysis(
    app_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the saved/preserved SWOT analysis for an application."""
    import json

    app = _resolve_app(db, app_id, current_user.id)

    saved_analysis = (
        db.query(ApplicationSwotAnalysis)
        .filter(ApplicationSwotAnalysis.application_id == app.id)
        .first()
    )

    if not saved_analysis:
        raise HTTPException(
            status_code=404,
            detail="No saved SWOT analysis found for this application.",
        )

    return SavedSwotAnalysisResponse(
        id=saved_analysis.id,
        strengths=json.loads(saved_analysis.strengths),
        weaknesses=json.loads(saved_analysis.weaknesses),
        opportunities=json.loads(saved_analysis.opportunities),
        threats=json.loads(saved_analysis.threats),
        created_at=saved_analysis.created_at.isoformat(),
        updated_at=saved_analysis.updated_at.isoformat(),
    )
