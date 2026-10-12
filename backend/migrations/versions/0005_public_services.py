"""Historical public-service schema; retained after retiring the feature.

Keep this revision available for databases that already applied it. The application
no longer reads, exposes, or schedules checks for these tables.
"""

import sqlalchemy as sa
from alembic import op

revision = "0005_public_services"
down_revision = "0004_network_health"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "PublicService",
        sa.Column("slug", sa.Text(), primary_key=True),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("consecutiveFailures", sa.Integer(), nullable=False),
        sa.Column("checkedAt", sa.DateTime(), nullable=True),
        sa.Column("nextCheckAt", sa.DateTime(), nullable=False),
        sa.Column("leaseToken", sa.Text(), nullable=True),
        sa.Column("leaseUntil", sa.DateTime(), nullable=True),
        sa.Column("httpStatusCode", sa.Integer(), nullable=True),
        sa.Column("responseTimeMs", sa.Integer(), nullable=True),
        sa.Column("observation", sa.Text(), nullable=True),
        sa.CheckConstraint("status IN ('UP', 'DOWN', 'UNKNOWN')", name="PublicService_status"),
    )
    op.create_index("ix_PublicService_nextCheckAt", "PublicService", ["nextCheckAt"])
    op.create_table(
        "PublicServiceCheck",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column(
            "slug",
            sa.Text(),
            sa.ForeignKey("PublicService.slug", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("checkedAt", sa.DateTime(), nullable=False),
        sa.Column("result", sa.Text(), nullable=False),
        sa.Column("httpStatusCode", sa.Integer(), nullable=True),
        sa.Column("responseTimeMs", sa.Integer(), nullable=True),
        sa.Column("observation", sa.Text(), nullable=False),
        sa.CheckConstraint("result IN ('UP', 'DOWN', 'UNKNOWN')", name="PublicServiceCheck_result"),
    )
    op.create_index("PublicServiceCheck_slug_checked", "PublicServiceCheck", ["slug", "checkedAt"])


def downgrade():
    op.drop_table("PublicServiceCheck")
    op.drop_table("PublicService")
