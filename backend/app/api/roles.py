"""Roles list API - for filter dropdowns."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db import get_db
from app.models import Role, User
from app.schemas import RoleRead

router = APIRouter(prefix="/api/roles", tags=["roles"])


@router.get("", response_model=list[RoleRead])
def list_roles(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List roles (job titles) for the current user."""
    roles = (
        db.query(Role).filter(Role.user_id == current_user.id).order_by(Role.name).all()
    )
    return [RoleRead(id=r.id, name=r.name) for r in roles]
