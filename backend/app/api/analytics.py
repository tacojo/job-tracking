"""Analytics API - aggregated data for charts with optional filters."""

from collections import defaultdict
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user
from app.db import get_db
from app.models import Application, Stage, User

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

STAGE_ORDER = (
    ["APPLIED", "RECRUITER_CALL"]
    + [f"STAGE_{i}" for i in range(1, 6)]
    + ["OFFER", "REJECTED", "NO_FEEDBACK"]
)
TERMINUS_STAGES = {"OFFER", "REJECTED", "NO_FEEDBACK"}
STAGE_LABELS = {
    "APPLIED": "Applied",
    "RECRUITER_CALL": "Recruiter Call",
    **{f"STAGE_{i}": f"Stage {i}" for i in range(1, 6)},
    "OFFER": "Offer",
    "REJECTED": "Rejected",
    "NO_FEEDBACK": "No Feedback",
}

# Colors for Sankey nodes (frontend uses these)
STAGE_COLORS = {
    "START": "#6c757d",  # bootstrap secondary
    "APPLIED": "#0d6efd",
    "RECRUITER_CALL": "#20c997",
    "OFFER": "#198754",
    "REJECTED": "#dc3545",
    "NO_FEEDBACK": "#adb5bd",
    **{f"STAGE_{i}": "#6f42c1" for i in range(1, 6)},
}


def _app_company(app) -> str:
    return app.company_rel.name if app.company_rel else "Unknown"


def _app_role(app) -> str:
    return app.role_rel.name if app.role_rel else "Unknown"


def _base_query(
    db: Session,
    user_id: int,
    company_id: Optional[int],
    role_id: Optional[int],
    stage: Optional[str],
    date_from: Optional[str],
    date_to: Optional[str],
):
    """Build base query with optional filters. Only apply where param is present."""
    q = (
        db.query(Application)
        .options(
            joinedload(Application.stages),
            joinedload(Application.company_rel),
            joinedload(Application.recruiter_rel),
            joinedload(Application.role_rel),
        )
        .filter(
            Application.user_id == user_id,
            Application.deleted_at.is_(None),
        )
    )
    if company_id is not None:
        q = q.filter(Application.company_id == company_id)
    if role_id is not None:
        q = q.filter(Application.role_id == role_id)
    if date_from:
        q = q.filter(func.date(Application.created_at) >= date_from)
    if date_to:
        q = q.filter(func.date(Application.created_at) <= date_to)
    if stage:
        subq = (
            db.query(Stage.application_id).filter(Stage.stage_type == stage).distinct()
        )
        q = q.filter(Application.id.in_(subq))
    return q


def _compute_analytics(
    db: Session,
    user_id: int,
    company_id: Optional[int] = None,
    role_id: Optional[int] = None,
    stage: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    group_by: str = "day",
) -> dict:
    """Compute analytics data with optional filters."""
    q = _base_query(db, user_id, company_id, role_id, stage, date_from, date_to)
    apps = q.order_by(Application.created_at.asc()).all()

    total = len(apps)
    active_by_stage = defaultdict(int)
    by_role = defaultdict(int)
    by_company = defaultdict(int)
    application_lengths = []
    timeline = []

    offers = 0
    rejected = 0
    no_feedback = 0

    for app in apps:
        stages = sorted(
            app.stages,
            key=lambda s: (
                s.scheduled_at
                or s.created_at
                or datetime.min.replace(tzinfo=timezone.utc)
            ),
        )
        latest = stages[-1] if stages else None
        latest_type = latest.stage_type if latest else None

        if latest_type == "OFFER":
            offers += 1
        elif latest_type == "REJECTED":
            rejected += 1
        elif latest_type == "NO_FEEDBACK":
            no_feedback += 1

        if latest_type and latest_type not in TERMINUS_STAGES:
            active_by_stage[latest_type] += 1

        by_role[_app_role(app)] += 1
        by_company[_app_company(app)] += 1

        created = app.created_at or datetime.now(timezone.utc)
        end = (
            (latest.scheduled_at or latest.created_at)
            if latest
            else datetime.now(timezone.utc)
        )
        if hasattr(created, "tzinfo") and created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        if hasattr(end, "tzinfo") and end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)
        days = (end - created).days
        application_lengths.append(
            {
                "id": app.id,
                "company": _app_company(app),
                "role": _app_role(app),
                "days": days,
            }
        )

        app_stages = []
        for s in stages:
            start = s.scheduled_at or s.created_at
            if not start:
                continue
            if hasattr(start, "tzinfo") and start.tzinfo is None:
                start = start.replace(tzinfo=timezone.utc)
            end_dt = start
            if hasattr(end_dt, "tzinfo") and end_dt.tzinfo is None:
                end_dt = end_dt.replace(tzinfo=timezone.utc)
            app_stages.append(
                {
                    "stage_type": s.stage_type,
                    "stage_label": STAGE_LABELS.get(s.stage_type, s.stage_type),
                    "activity_type": s.activity_type,
                    "start": start.isoformat(),
                    "end": end_dt.isoformat(),
                }
            )
        if app_stages:
            latest_dt = latest.scheduled_at or latest.created_at if latest else None
            latest_iso = latest_dt.isoformat() if latest_dt else None
            timeline.append(
                {
                    "app_id": app.id,
                    "app_uuid": app.uuid,
                    "company": _app_company(app),
                    "role": _app_role(app),
                    "app_updated_at": (
                        app.updated_at.isoformat() if app.updated_at else None
                    ),
                    "latest_stage_at": latest_iso,
                    "stages": app_stages,
                }
            )

    timeline.sort(
        key=lambda t: t["latest_stage_at"] or "",
        reverse=True,
    )

    # Timeseries: applications over time (group by day or week)
    try:
        if group_by == "week":
            group_expr = func.strftime("%Y-W%W", Application.created_at)
        else:
            group_expr = func.date(Application.created_at)

        ts_q = db.query(
            group_expr.label("period"), func.count(Application.id).label("count")
        ).filter(
            Application.user_id == user_id,
            Application.deleted_at.is_(None),
        )
        if company_id is not None:
            ts_q = ts_q.filter(Application.company_id == company_id)
        if role_id is not None:
            ts_q = ts_q.filter(Application.role_id == role_id)
        if date_from:
            ts_q = ts_q.filter(func.date(Application.created_at) >= date_from)
        if date_to:
            ts_q = ts_q.filter(func.date(Application.created_at) <= date_to)
        if stage:
            subq = (
                db.query(Stage.application_id)
                .filter(Stage.stage_type == stage)
                .distinct()
            )
            ts_q = ts_q.filter(Application.id.in_(subq))

        ts_q = ts_q.group_by(group_expr).order_by(group_expr)
        timeseries_rows = ts_q.all()
        applications_over_time = [
            {"period": r.period, "count": r.count} for r in timeseries_rows
        ]
    except Exception:
        applications_over_time = []

    # Pipeline Sankey: transitions between stages (all applications, regardless of terminus)
    transition_counts: dict[tuple[str, str], int] = defaultdict(int)
    for app in apps:
        stages = sorted(
            app.stages,
            key=lambda s: (
                s.scheduled_at
                or s.created_at
                or datetime.min.replace(tzinfo=timezone.utc)
            ),
        )
        if not stages:
            continue

        # Start -> first stage (represents the application entering the pipeline)
        first = stages[0].stage_type
        if first:
            transition_counts[("START", first)] += 1

        if len(stages) < 2:
            continue
        for i in range(len(stages) - 1):
            src = stages[i].stage_type
            dst = stages[i + 1].stage_type
            if not src or not dst:
                continue
            transition_counts[(src, dst)] += 1

    node_names = ["START"] + [s for s in STAGE_ORDER if s]  # keep stable order
    # Add any unknown stage types that appear
    for src, dst in transition_counts.keys():
        if src not in node_names:
            node_names.append(src)
        if dst not in node_names:
            node_names.append(dst)

    name_to_idx = {n: i for i, n in enumerate(node_names)}
    pipeline_sankey = {
        "nodes": [
            {
                "id": n,
                "name": "Start" if n == "START" else STAGE_LABELS.get(n, n),
                "color": STAGE_COLORS.get(n, "#228b22"),
            }
            for n in node_names
        ],
        "links": [
            {"source": name_to_idx[src], "target": name_to_idx[dst], "value": cnt}
            for (src, dst), cnt in sorted(
                transition_counts.items(), key=lambda x: -x[1]
            )
        ],
    }

    # Pipeline funnel: count by latest stage (legacy)
    pipeline_funnel = []
    for st in STAGE_ORDER:
        count = active_by_stage.get(st, 0)
        if st in TERMINUS_STAGES:
            if st == "OFFER":
                count = offers
            elif st == "REJECTED":
                count = rejected
            elif st == "NO_FEEDBACK":
                count = no_feedback
        pipeline_funnel.append(
            {"stage": st, "label": STAGE_LABELS.get(st, st), "count": count}
        )

    # Top companies (sorted by count desc)
    top_companies = sorted(
        [{"name": k, "count": v} for k, v in by_company.items()],
        key=lambda x: -x["count"],
    )[:10]

    # Conversion rate
    offers + rejected + no_feedback
    conversion_rate = (offers / total * 100) if total > 0 else 0
    rejection_rate = (rejected / total * 100) if total > 0 else 0

    return {
        "total_applications": total,
        "active_by_stage": dict(active_by_stage),
        "by_role": dict(by_role),
        "application_lengths": application_lengths,
        "timeline": timeline,
        "applications_over_time": applications_over_time,
        "pipeline_sankey": pipeline_sankey,
        "pipeline_funnel": pipeline_funnel,
        "top_companies": top_companies,
        "conversion_rate": round(conversion_rate, 1),
        "rejection_rate": round(rejection_rate, 1),
        "offers": offers,
        "rejected": rejected,
        "no_feedback": no_feedback,
    }


@router.get("")
def get_analytics(
    company_id: Optional[int] = Query(None, description="Filter by company ID"),
    role_id: Optional[int] = Query(None, description="Filter by role ID"),
    stage: Optional[str] = Query(
        None, description="Filter by stage (e.g. APPLIED, OFFER)"
    ),
    date_from: Optional[str] = Query(None, description="From date YYYY-MM-DD"),
    date_to: Optional[str] = Query(None, description="To date YYYY-MM-DD"),
    group_by: str = Query("day", description="Timeseries group: day or week"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return analytics data for charts. Optional filters applied only when param is present."""
    return _compute_analytics(
        db,
        current_user.id,
        company_id=company_id,
        role_id=role_id,
        stage=stage,
        date_from=date_from,
        date_to=date_to,
        group_by=group_by,
    )


@router.get("/roadmap")
def get_roadmap(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return timeline (Gantt) data for active applications only."""
    apps = (
        db.query(Application)
        .options(
            joinedload(Application.stages),
            joinedload(Application.company_rel),
            joinedload(Application.recruiter_rel),
            joinedload(Application.role_rel),
        )
        .filter(Application.user_id == current_user.id)
        .order_by(Application.created_at.asc())
        .all()
    )

    timeline = []
    for app in apps:
        stages = sorted(
            app.stages,
            key=lambda s: (
                s.scheduled_at
                or s.created_at
                or datetime.min.replace(tzinfo=timezone.utc)
            ),
        )
        latest = stages[-1] if stages else None
        latest_type = latest.stage_type if latest else None

        if latest_type and latest_type in TERMINUS_STAGES:
            continue

        app_stages = []
        for s in stages:
            start = s.scheduled_at or s.created_at
            if not start:
                continue
            if hasattr(start, "tzinfo") and start.tzinfo is None:
                start = start.replace(tzinfo=timezone.utc)
            end_dt = start
            if hasattr(end_dt, "tzinfo") and end_dt.tzinfo is None:
                end_dt = end_dt.replace(tzinfo=timezone.utc)
            app_stages.append(
                {
                    "stage_type": s.stage_type,
                    "stage_label": STAGE_LABELS.get(s.stage_type, s.stage_type),
                    "activity_type": s.activity_type,
                    "start": start.isoformat(),
                    "end": end_dt.isoformat(),
                }
            )
        if app_stages:
            latest_dt = latest.scheduled_at or latest.created_at if latest else None
            latest_iso = latest_dt.isoformat() if latest_dt else None
            timeline.append(
                {
                    "app_id": app.id,
                    "app_uuid": app.uuid,
                    "company": _app_company(app),
                    "role": _app_role(app),
                    "app_updated_at": (
                        app.updated_at.isoformat() if app.updated_at else None
                    ),
                    "latest_stage_at": latest_iso,
                    "stages": app_stages,
                }
            )

    timeline.sort(
        key=lambda t: t["latest_stage_at"] or "",
        reverse=True,
    )
    return {"timeline": timeline}
