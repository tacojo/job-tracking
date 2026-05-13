"""Stages CRUD API."""

from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db import get_db
from app.models import Application, Stage, User
from app.schemas import StageCreate, StageRead, StageUpdate

router = APIRouter(prefix="/api", tags=["stages"])

# Pipeline order: APPLIED/RECRUITER_CALL first, then STAGE_1..5, terminus stages (OFFER, REJECTED, NO_FEEDBACK).
STAGE_ORDER = (
    ["APPLIED", "RECRUITER_CALL"]
    + [f"STAGE_{i}" for i in range(1, 6)]
    + ["OFFER", "REJECTED", "NO_FEEDBACK"]
)
TERMINUS_STAGES = {"OFFER", "REJECTED", "NO_FEEDBACK"}
INITIAL_STAGES = {"APPLIED", "RECRUITER_CALL"}
STAGES_REQUIRING_ACTIVITY = {"RECRUITER_CALL"} | {f"STAGE_{i}" for i in range(1, 6)}


def _get_application_or_404(
    db: Session, application_id: int, user_id: int
) -> Application:
    app = (
        db.query(Application)
        .filter(Application.id == application_id, Application.user_id == user_id)
        .first()
    )
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    return app


def _stage_order_idx(stage_type: str) -> int:
    try:
        return STAGE_ORDER.index(stage_type)
    except ValueError:
        return 999


@router.get("/applications/{application_id}/stages", response_model=list[StageRead])
def list_stages(
    application_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List stages for an application, ordered by pipeline lineage."""
    _get_application_or_404(db, application_id, current_user.id)
    stages = db.query(Stage).filter(Stage.application_id == application_id).all()
    return sorted(
        stages,
        key=lambda s: (s.scheduled_at or s.created_at, _stage_order_idx(s.stage_type)),
    )


@router.post(
    "/applications/{application_id}/stages", response_model=StageRead, status_code=201
)
def create_stage(
    application_id: int,
    data: StageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add a stage to an application. Enforces pipeline order and no duplicates."""
    _get_application_or_404(db, application_id, current_user.id)
    existing = (
        db.query(Stage)
        .filter(Stage.application_id == application_id)
        .order_by(Stage.scheduled_at.asc(), Stage.created_at.asc())
        .all()
    )
    existing_types = [s.stage_type for s in existing]
    if data.stage_type in existing_types:
        raise HTTPException(
            status_code=400,
            detail=f"Stage {data.stage_type} already exists. No duplicates allowed.",
        )
    if any(t in existing_types for t in TERMINUS_STAGES):
        raise HTTPException(
            status_code=400,
            detail="Cannot add stages after Offer, Rejected, or No Feedback.",
        )

    has_applied = "APPLIED" in existing_types
    has_recruiter_call = "RECRUITER_CALL" in existing_types
    stage_nums = [
        int(t.replace("STAGE_", ""))
        for t in existing_types
        if t.startswith("STAGE_") and t[6:].isdigit()
    ]
    last_stage_num = max(stage_nums) if stage_nums else 0
    past_initial = has_applied or has_recruiter_call

    if not existing_types:
        if data.stage_type not in INITIAL_STAGES:
            raise HTTPException(
                status_code=400,
                detail="First stage must be Applied or Recruiter Call.",
            )
    elif data.stage_type in ("REJECTED", "NO_FEEDBACK"):
        pass
    elif data.stage_type == "OFFER":
        if last_stage_num < 1:
            raise HTTPException(
                status_code=400,
                detail="Offer is only allowed after at least Stage 1.",
            )
    elif data.stage_type == "APPLIED":
        if has_recruiter_call:
            raise HTTPException(
                status_code=400, detail="Cannot add Applied after Recruiter Call."
            )
        if not has_applied:
            pass
        else:
            raise HTTPException(status_code=400, detail="Applied already exists.")
    elif data.stage_type == "RECRUITER_CALL":
        if not has_recruiter_call:
            pass
        else:
            raise HTTPException(
                status_code=400, detail="Recruiter Call already exists."
            )
    elif data.stage_type.startswith("STAGE_"):
        try:
            new_num = int(data.stage_type.replace("STAGE_", ""))
        except ValueError:
            raise HTTPException(
                status_code=400, detail=f"Invalid stage: {data.stage_type}"
            )
        if new_num < 1 or new_num > 10:
            raise HTTPException(status_code=400, detail="Stage must be 1–10.")
        if not past_initial:
            raise HTTPException(
                status_code=400, detail="Need Applied or Recruiter Call before Stage 1."
            )
        if new_num != last_stage_num + 1:
            raise HTTPException(
                status_code=400,
                detail=f"Stage must follow sequence. Next allowed: Stage {last_stage_num + 1}, Offer, Rejected, or No Feedback.",
            )
    else:
        raise HTTPException(
            status_code=400, detail=f"Invalid stage type: {data.stage_type}"
        )

    if existing:
        sorted_existing = sorted(
            existing,
            key=lambda s: (
                s.scheduled_at or s.created_at,
                _stage_order_idx(s.stage_type),
            ),
        )
        prev = sorted_existing[-1]
        prev_dt = prev.scheduled_at or prev.created_at
        new_dt = data.scheduled_at
        if prev_dt and new_dt:
            prev_ts = _to_datetime(prev_dt)
            new_ts = _to_datetime(new_dt)
            if new_ts <= prev_ts:
                raise HTTPException(
                    status_code=400,
                    detail="Stage date and time must be after the previous stage (same day is allowed if time is later).",
                )

    dump = data.model_dump()
    if (
        dump.get("scheduled_at") is not None
        and isinstance(dump["scheduled_at"], datetime)
        and dump["scheduled_at"].tzinfo is not None
    ):
        dump["scheduled_at"] = dump["scheduled_at"].replace(tzinfo=None)
    stage = Stage(application_id=application_id, **dump)
    db.add(stage)
    db.commit()
    db.refresh(stage)
    return stage


def _to_datetime(dt):
    """Normalize date or datetime to datetime for comparison."""
    if dt is None:
        return datetime.min.replace(tzinfo=timezone.utc)
    if isinstance(dt, date) and not isinstance(dt, datetime):
        return datetime.combine(dt, datetime.min.time(), tzinfo=timezone.utc)
    if hasattr(dt, "tzinfo") and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


@router.put("/stages/{stage_id}", response_model=StageRead)
def update_stage(
    stage_id: int,
    data: StageUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a stage."""
    stage = (
        db.query(Stage)
        .join(Application)
        .filter(Stage.id == stage_id, Application.user_id == current_user.id)
        .first()
    )
    if not stage:
        raise HTTPException(status_code=404, detail="Stage not found")

    update_data = data.model_dump(exclude_unset=True)

    # Validate activity_type is required for RECRUITER_CALL and STAGE_1-5
    if stage.stage_type in STAGES_REQUIRING_ACTIVITY:
        # Get the activity_type value after update
        new_activity_type = update_data.get("activity_type", stage.activity_type)
        if not new_activity_type or not new_activity_type.strip():
            raise HTTPException(
                status_code=400,
                detail=f"Activity type is required for {stage.stage_type}.",
            )
    if (
        "scheduled_at" in update_data
        and update_data["scheduled_at"] is not None
        and isinstance(update_data["scheduled_at"], datetime)
        and update_data["scheduled_at"].tzinfo is not None
    ):
        update_data["scheduled_at"] = update_data["scheduled_at"].replace(tzinfo=None)
    new_scheduled_at = update_data.get("scheduled_at", stage.scheduled_at)
    if new_scheduled_at is not None:
        all_stages = (
            db.query(Stage).filter(Stage.application_id == stage.application_id).all()
        )

        def _get_dt(s):
            dt = (
                new_scheduled_at
                if s.id == stage_id
                else (s.scheduled_at or s.created_at)
            )
            return _to_datetime(dt)

        sorted_all = sorted(
            all_stages,
            key=lambda s: (_get_dt(s), _stage_order_idx(s.stage_type)),
        )
        idx = next(i for i, s in enumerate(sorted_all) if s.id == stage_id)
        prev_stage = sorted_all[idx - 1] if idx > 0 else None
        next_stage = sorted_all[idx + 1] if idx < len(sorted_all) - 1 else None

        new_ts = _to_datetime(new_scheduled_at)

        if prev_stage and new_scheduled_at:
            prev_ts = _to_datetime(prev_stage.scheduled_at or prev_stage.created_at)
            if new_ts <= prev_ts:
                raise HTTPException(
                    status_code=400,
                    detail="Stage date and time must be after the previous stage (same day is allowed if time is later).",
                )
        if next_stage and new_scheduled_at:
            next_ts = _to_datetime(next_stage.scheduled_at or next_stage.created_at)
            if new_ts >= next_ts:
                raise HTTPException(
                    status_code=400,
                    detail="Stage date and time must be before the next stage (same day is allowed if time is earlier).",
                )

    for k, v in update_data.items():
        setattr(stage, k, v)
    db.commit()
    db.refresh(stage)
    return stage


@router.delete("/stages/{stage_id}", status_code=204)
def delete_stage(
    stage_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a stage."""
    stage = (
        db.query(Stage)
        .join(Application)
        .filter(Stage.id == stage_id, Application.user_id == current_user.id)
        .first()
    )
    if not stage:
        raise HTTPException(status_code=404, detail="Stage not found")
    db.delete(stage)
    db.commit()
    return None
