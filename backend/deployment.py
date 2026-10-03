from functools import lru_cache
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import text

from backend.config import settings
from backend.db import engine
from backend.migrate import ROOT, migrate


@lru_cache
def schema_heads() -> set[str]:
    cfg = Config(str(ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(ROOT / "backend/migrations"))
    return set(ScriptDirectory.from_config(cfg).get_heads())


def schema_current() -> bool:
    try:
        with engine().connect() as connection:
            versions: set[str] = set(
                connection.execute(text("SELECT version_num FROM alembic_version")).scalars()
            )
        return versions == schema_heads()
    except Exception:
        return False


def database_ready() -> bool:
    try:
        with engine().connect() as connection:
            connection.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


def release():
    cfg = settings()
    if cfg.node_env != "production":
        raise RuntimeError("The release command requires NODE_ENV=production.")
    if not cfg.email_configured:
        raise RuntimeError(cfg.email_configuration_issue or "Email delivery is not configured.")
    if cfg.web_dist_dir and not (Path(cfg.web_dist_dir) / "index.html").is_file():
        raise RuntimeError("WEB_DIST_DIR is missing the compiled frontend index.html.")
    if cfg.web_dist_dir:
        from backend.seo import SeoPages

        SeoPages(Path(cfg.web_dist_dir))
    migrate()
    if not schema_current():
        raise RuntimeError("Database schema verification failed after migration.")
    print("Production configuration and database schema verified. No test email was sent.")
