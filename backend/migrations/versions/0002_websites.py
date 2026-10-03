"""Group existing independent URL monitors without replacing their history."""

import secrets

import sqlalchemy as sa
from alembic import op

from backend.website_state import website_origin

revision = "0002_websites"
down_revision = "0001_existing_schema"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "NotificationDelivery",
        sa.Column("messagePayload", sa.dialects.postgresql.JSONB(), nullable=True),
    )
    op.create_table(
        "Website",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column(
            "userId", sa.Text(), sa.ForeignKey("User.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("emailEnabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("createdAt", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updatedAt", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("userId", "url", name="Website_user_origin_unique"),
        sa.UniqueConstraint("id", "userId", name="Website_id_user_unique"),
    )
    op.add_column("Monitor", sa.Column("websiteId", sa.Text(), nullable=True))
    op.create_index("ix_Monitor_websiteId", "Monitor", ["websiteId"])
    op.create_foreign_key(
        "Monitor_website_owner_fk",
        "Monitor",
        "Website",
        ["websiteId", "userId"],
        ["id", "userId"],
        ondelete="CASCADE",
    )
    connection = op.get_bind()
    groups = {}
    rows = (
        connection.execute(
            sa.text('SELECT id, "userId", name, url FROM "Monitor" ORDER BY "createdAt", id')
        )
        .mappings()
        .all()
    )
    for row in rows:
        origin = website_origin(row["url"])
        key = (row["userId"], origin)
        if key not in groups:
            identifier = secrets.token_hex(16)
            connection.execute(
                sa.text(
                    'INSERT INTO "Website" (id, "userId", name, url) VALUES (:id, :user, :name, :url)'
                ),
                {"id": identifier, "user": row["userId"], "name": row["name"], "url": origin},
            )
            groups[key] = identifier
        connection.execute(
            sa.text('UPDATE "Monitor" SET "websiteId"=:website WHERE id=:monitor'),
            {"website": groups[key], "monitor": row["id"]},
        )


def downgrade():
    raise RuntimeError(
        "Website grouping downgrade is disabled to preserve grouping and monitoring history."
    )
