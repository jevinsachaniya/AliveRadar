from hashlib import sha256
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect, text

from backend.db import engine
from backend.models import Base

ROOT = Path(__file__).resolve().parent.parent
LEGACY_MIGRATIONS = {
    "20261002000000_initial": "initial.sql",
    "20261002001000_constraints": "constraints.sql",
}


def verify_legacy(connection):
    inspector = inspect(connection)
    for table in Base.metadata.sorted_tables:
        # Adoption verifies the immutable pre-Python baseline; later additions are migrated after stamping it.
        if table.name in {"Website", "EmailOtpChallenge"}:
            continue
        if not inspector.has_table(table.name):
            raise RuntimeError(
                f"Existing database lacks required table {table.name}; adoption stopped."
            )
        actual = {column["name"] for column in inspector.get_columns(table.name)}
        additions = {
            "Monitor": {"websiteId"},
            "NotificationDelivery": {"messagePayload"},
            "User": {"emailVerifiedAt"},
            "Session": {"otpVerifiedAt"},
        }
        expected = set(table.columns.keys()) - additions.get(table.name, set())
        if not expected.issubset(actual):
            raise RuntimeError(f"Existing {table.name} columns differ; adoption stopped.")
    if not inspector.has_table("_prisma_migrations"):
        raise RuntimeError("Existing unversioned database cannot be adopted automatically.")
    records = (
        connection.execute(
            text(
                'SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations"'
            )
        )
        .mappings()
        .all()
    )
    for migration, filename in LEGACY_MIGRATIONS.items():
        checksum = sha256((ROOT / "backend/migrations/sql" / filename).read_bytes()).hexdigest()
        if not any(
            record["migration_name"] == migration
            and record["checksum"] == checksum
            and record["finished_at"] is not None
            and record["rolled_back_at"] is None
            for record in records
        ):
            raise RuntimeError(
                f"Legacy migration {migration} is missing, unfinished, or modified; adoption stopped."
            )
    if any(
        record["finished_at"] is None and record["rolled_back_at"] is None for record in records
    ):
        raise RuntimeError("An unfinished legacy migration needs investigation before adoption.")
    indexes = {
        index["name"]
        for table in ["Incident", "NotificationPreference"]
        for index in inspector.get_indexes(table)
    }
    if not {"Incident_one_open_per_monitor", "NotificationPreference_global_unique"}.issubset(
        indexes
    ):
        raise RuntimeError(
            "Existing database lacks required uniqueness constraints; adoption stopped."
        )


def migrate(db_engine=None):
    cfg = Config(str(ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(ROOT / "backend/migrations"))
    with (db_engine or engine()).connect() as connection:
        # Serializes adoption and upgrades across release jobs. Session lock is always released.
        connection.execute(text("SELECT pg_advisory_lock(907234110)"))
        connection.commit()
        try:
            cfg.attributes["connection"] = connection
            inspector = inspect(connection)
            if inspector.has_table("User") and not inspector.has_table("alembic_version"):
                verify_legacy(connection)
                connection.commit()
                command.stamp(cfg, "0001_existing_schema")
                connection.commit()
                print("Adopted verified legacy schema without changing application data.")
            command.upgrade(cfg, "head")
            connection.commit()
        finally:
            connection.rollback()
            connection.execute(text("SELECT pg_advisory_unlock(907234110)"))
            connection.commit()
    print("Alembic migrations are up to date.")


if __name__ == "__main__":
    migrate()
