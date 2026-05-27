"""add user_id to ai_prompts and prospect_questions

Revision ID: a1b2c3d4e5f6
Revises: 47530de69031
Create Date: 2026-05-27 10:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "47530de69031"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _copy_legacy_rows_to_users(conn: sa.Connection) -> None:
    user_ids = [
        row[0] for row in conn.execute(sa.text("SELECT id FROM users")).fetchall()
    ]
    legacy_prompts = [
        (row[0], row[1])
        for row in conn.execute(sa.text("SELECT key, value FROM ai_prompts")).fetchall()
    ]
    legacy_questions = [
        (row[0], row[1])
        for row in conn.execute(
            sa.text("SELECT question_text, sort_order FROM prospect_questions")
        ).fetchall()
    ]

    conn.execute(sa.text("DELETE FROM ai_prompts"))
    conn.execute(sa.text("DELETE FROM prospect_questions"))

    if not user_ids:
        return

    for user_id in user_ids:
        for key, value in legacy_prompts:
            conn.execute(
                sa.text(
                    "INSERT INTO ai_prompts (key, value, user_id) VALUES (:key, :value, :user_id)"
                ),
                {"key": key, "value": value, "user_id": user_id},
            )
        for question_text, sort_order in legacy_questions:
            conn.execute(
                sa.text(
                    "INSERT INTO prospect_questions (question_text, sort_order, user_id) "
                    "VALUES (:question_text, :sort_order, :user_id)"
                ),
                {
                    "question_text": question_text,
                    "sort_order": sort_order,
                    "user_id": user_id,
                },
            )


def upgrade() -> None:
    op.add_column("ai_prompts", sa.Column("user_id", sa.Integer(), nullable=True))
    op.add_column(
        "prospect_questions", sa.Column("user_id", sa.Integer(), nullable=True)
    )

    conn = op.get_bind()
    _copy_legacy_rows_to_users(conn)

    op.drop_index(op.f("ix_ai_prompts_key"), table_name="ai_prompts")

    op.create_foreign_key(
        "fk_ai_prompts_user_id_users",
        "ai_prompts",
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_prospect_questions_user_id_users",
        "prospect_questions",
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )

    op.alter_column("ai_prompts", "user_id", nullable=False)
    op.alter_column("prospect_questions", "user_id", nullable=False)

    op.create_index(
        op.f("ix_ai_prompts_user_id"), "ai_prompts", ["user_id"], unique=False
    )
    op.create_index(op.f("ix_ai_prompts_key"), "ai_prompts", ["key"], unique=False)
    op.create_unique_constraint(
        "uq_ai_prompts_user_key", "ai_prompts", ["user_id", "key"]
    )

    op.create_index(
        op.f("ix_prospect_questions_user_id"),
        "prospect_questions",
        ["user_id"],
        unique=False,
    )


def downgrade() -> None:
    conn = op.get_bind()
    prompts = [
        (row[0], row[1])
        for row in conn.execute(
            sa.text(
                "SELECT key, value FROM ai_prompts "
                "WHERE user_id = (SELECT MIN(id) FROM users) "
                "OR user_id IS NULL"
            )
        ).fetchall()
    ]
    questions = [
        (row[0], row[1])
        for row in conn.execute(
            sa.text(
                "SELECT question_text, sort_order FROM prospect_questions "
                "WHERE user_id = (SELECT MIN(id) FROM users) "
                "OR user_id IS NULL"
            )
        ).fetchall()
    ]

    op.drop_index(
        op.f("ix_prospect_questions_user_id"), table_name="prospect_questions"
    )
    op.drop_constraint(
        "fk_prospect_questions_user_id_users", "prospect_questions", type_="foreignkey"
    )
    op.drop_column("prospect_questions", "user_id")

    op.drop_constraint("uq_ai_prompts_user_key", "ai_prompts", type_="unique")
    op.drop_index(op.f("ix_ai_prompts_key"), table_name="ai_prompts")
    op.drop_index(op.f("ix_ai_prompts_user_id"), table_name="ai_prompts")
    op.drop_constraint("fk_ai_prompts_user_id_users", "ai_prompts", type_="foreignkey")
    op.drop_column("ai_prompts", "user_id")

    conn.execute(sa.text("DELETE FROM ai_prompts"))
    conn.execute(sa.text("DELETE FROM prospect_questions"))
    for key, value in prompts:
        conn.execute(
            sa.text("INSERT INTO ai_prompts (key, value) VALUES (:key, :value)"),
            {"key": key, "value": value},
        )
    for question_text, sort_order in questions:
        conn.execute(
            sa.text(
                "INSERT INTO prospect_questions (question_text, sort_order) "
                "VALUES (:question_text, :sort_order)"
            ),
            {"question_text": question_text, "sort_order": sort_order},
        )

    op.create_index(op.f("ix_ai_prompts_key"), "ai_prompts", ["key"], unique=True)
