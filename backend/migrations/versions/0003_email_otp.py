"""Require email verification before creating accounts or authorizing sessions."""

import sqlalchemy as sa
from alembic import op

revision = "0003_email_otp"
down_revision = "0002_websites"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("User", sa.Column("emailVerifiedAt", sa.DateTime(), nullable=True))
    op.add_column("Session", sa.Column("otpVerifiedAt", sa.DateTime(), nullable=True))
    op.create_table(
        "EmailOtpChallenge",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("purpose", sa.Text(), nullable=False),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("userId", sa.Text(), sa.ForeignKey("User.id", ondelete="CASCADE"), nullable=True),
        sa.Column("name", sa.Text(), nullable=True),
        sa.Column("passwordHash", sa.Text(), nullable=False),
        sa.Column("codeHash", sa.Text(), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("sendCount", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("createdAt", sa.DateTime(), nullable=False),
        sa.Column("lastSentAt", sa.DateTime(), nullable=False),
        sa.Column("expiresAt", sa.DateTime(), nullable=False),
        sa.Column("consumedAt", sa.DateTime(), nullable=True),
        sa.CheckConstraint("purpose IN ('login', 'register')", name="EmailOtpChallenge_purpose"),
    )
    op.create_index(
        "EmailOtpChallenge_email_purpose_created",
        "EmailOtpChallenge",
        ["email", "purpose", "createdAt"],
    )
    op.create_index("ix_EmailOtpChallenge_expiresAt", "EmailOtpChallenge", ["expiresAt"])


def downgrade():
    op.drop_table("EmailOtpChallenge")
    op.drop_column("Session", "otpVerifiedAt")
    op.drop_column("User", "emailVerifiedAt")
