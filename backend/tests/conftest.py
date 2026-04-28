import os
from pathlib import Path

import pytest


@pytest.fixture(autouse=True)
def _temporary_db_path(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
  """Ensure each test uses its own SQLite file, not the real development DB."""
  db_path = tmp_path / "test.db"
  monkeypatch.setenv("PM_DB_PATH", str(db_path))

