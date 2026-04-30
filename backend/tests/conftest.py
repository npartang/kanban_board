from pathlib import Path

import pytest


@pytest.fixture(autouse=True)
def _isolated_test_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Give each test its own SQLite file and a clean session store."""
    db_path = tmp_path / "test.db"
    monkeypatch.setenv("PM_DB_PATH", str(db_path))

    # Apply schema to the fresh temp DB (lifespan doesn't run for module-level TestClient).
    from app.db import ensure_schema
    ensure_schema()

    # Clear in-memory sessions so tests don't bleed auth state into each other.
    import app.auth as auth_module
    auth_module._sessions.clear()
    auth_module._failed_attempts.clear()
