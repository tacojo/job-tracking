"""add user_secrets table

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-05-27 14:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, None] = "b2c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user_secrets",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("secret_encrypted", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id", "provider", name="uq_user_secrets_user_provider"
        ),
    )
    op.create_index(op.f("ix_user_secrets_id"), "user_secrets", ["id"], unique=False)
    op.create_index(
        op.f("ix_user_secrets_provider"), "user_secrets", ["provider"], unique=False
    )
    op.create_index(
        op.f("ix_user_secrets_user_id"), "user_secrets", ["user_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_user_secrets_user_id"), table_name="user_secrets")
    op.drop_index(op.f("ix_user_secrets_provider"), table_name="user_secrets")
    op.drop_index(op.f("ix_user_secrets_id"), table_name="user_secrets")
    op.drop_table("user_secrets")
