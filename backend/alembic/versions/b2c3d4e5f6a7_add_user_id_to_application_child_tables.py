"""add user_id to application child tables

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-05-27 12:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_CHILD_TABLES: tuple[tuple[str, str], ...] = (
    ("application_documents", "fk_application_documents_user_id_users"),
    ("application_events", "fk_application_events_user_id_users"),
    ("application_job_descriptions", "fk_application_job_descriptions_user_id_users"),
    ("application_prospect_answers", "fk_application_prospect_answers_user_id_users"),
    ("application_swot_analyses", "fk_application_swot_analyses_user_id_users"),
)


def _backfill_user_id(conn: sa.Connection, table: str) -> None:
    conn.execute(
        sa.text(
            f"""
            UPDATE {table}
            SET user_id = (
                SELECT applications.user_id
                FROM applications
                WHERE applications.id = {table}.application_id
            )
            """
        )
    )
    conn.execute(sa.text(f"DELETE FROM {table} WHERE user_id IS NULL"))


def upgrade() -> None:
    conn = op.get_bind()
    for table, _ in _CHILD_TABLES:
        op.add_column(table, sa.Column("user_id", sa.Integer(), nullable=True))

    for table, _ in _CHILD_TABLES:
        _backfill_user_id(conn, table)

    for table, fk_name in _CHILD_TABLES:
        op.create_foreign_key(
            fk_name,
            table,
            "users",
            ["user_id"],
            ["id"],
            ondelete="CASCADE",
        )
        op.alter_column(table, "user_id", nullable=False)
        op.create_index(
            op.f(f"ix_{table}_user_id"),
            table,
            ["user_id"],
            unique=False,
        )


def downgrade() -> None:
    for table, fk_name in reversed(_CHILD_TABLES):
        op.drop_index(op.f(f"ix_{table}_user_id"), table_name=table)
        op.drop_constraint(fk_name, table, type_="foreignkey")
        op.drop_column(table, "user_id")
