"""Initial schema, preserving PostgreSQL tables originally created with Prisma."""

from pathlib import Path

from alembic import op

revision = "0001_existing_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    sql_dir = Path(__file__).parent.parent / "sql"
    # The checked-in files contain trusted SQL only; no user input is interpolated.
    for name in ["initial.sql", "constraints.sql"]:
        op.get_bind().exec_driver_sql((sql_dir / name).read_text(encoding="utf-8"))


def downgrade():
    raise RuntimeError(
        "Destructive baseline downgrade is disabled. Restore a verified backup instead."
    )
