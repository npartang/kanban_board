from pathlib import Path

import pytest


@pytest.fixture(autouse=True)
def _isolated_test_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Give each test its own SQLite file and a clean session/rate-limit store."""
    db_path = tmp_path / "test.db"
    monkeypatch.setenv("PM_DB_PATH", str(db_path))

    from app.db import ensure_schema, db_connection, ensure_demo_user
    ensure_schema()

    with db_connection() as connection:
        ensure_demo_user(connection)

    import app.auth as auth_module
    auth_module._sessions.clear()
    auth_module._failed_attempts.clear()
