"""Entity resolution for star schema - get or create dimension records."""

from sqlalchemy.orm import Session

from app.models import Company, Recruiter, Role


def get_or_create_company(db: Session, user_id: int, name: str) -> Company:
    """Get or create Company by name for user. Uses 'Unknown' if name is empty."""
    name = (name or "").strip() or "Unknown"
    company = (
        db.query(Company)
        .filter(Company.user_id == user_id, Company.name == name)
        .first()
    )
    if company:
        return company
    company = Company(user_id=user_id, name=name)
    db.add(company)
    db.flush()
    return company


def get_or_create_recruiter(
    db: Session, user_id: int, name: str | None
) -> Recruiter | None:
    """Get or create Recruiter by name for user. Returns None if name is empty."""
    name = (name or "").strip()
    if not name:
        return None
    recruiter = (
        db.query(Recruiter)
        .filter(Recruiter.user_id == user_id, Recruiter.name == name)
        .first()
    )
    if recruiter:
        return recruiter
    recruiter = Recruiter(user_id=user_id, name=name)
    db.add(recruiter)
    db.flush()
    return recruiter


def get_or_create_role(db: Session, user_id: int, name: str) -> Role:
    """Get or create Role by name for user. Uses 'Unknown' if name is empty."""
    name = (name or "").strip() or "Unknown"
    role = db.query(Role).filter(Role.user_id == user_id, Role.name == name).first()
    if role:
        return role
    role = Role(user_id=user_id, name=name)
    db.add(role)
    db.flush()
    return role
