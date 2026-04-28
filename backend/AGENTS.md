This directory contains the Python FastAPI backend for the
Project Management MVP.

Current layout:
- `pyproject.toml` – backend project definition and dependencies.
- `app/main.py` – FastAPI application entrypoint. Mounts:
  - Core health/hello endpoints.
  - Auth routes from `app/auth.py`.
  - Board persistence routes from `app/board_api.py`.
  - Static frontend assets at `/` using `StaticFiles`.
- `app/db_schema.py` – centralized SQLite schema definition.
- `app/db.py` – lightweight DB helpers for connecting to the
  SQLite database, applying the schema, and creating the demo
  user and default board/columns.
- `app/auth.py` – backend authentication with a simple
  cookie-based session for the demo user (`user` / `password`).
- `app/board_api.py` – API routes for reading and mutating the
  kanban board stored in SQLite.
- `tests/` – pytest-based tests for:
  - Core endpoints (`tests/test_main.py`).
  - Schema and constraints (`tests/test_db_schema.py`).
  - Auth behavior (`tests/test_auth_api.py`).
  - Board persistence and operations (`tests/test_board_api.py`).

Agents should:
- Keep the FastAPI app in `app/main.py` as the main entrypoint.
- Prefer adding new routes in `app/` alongside the existing
  modules, keeping the structure simple and avoiding
  unnecessary layers.
- Use the existing DB helpers in `app/db.py` instead of
  introducing an ORM.
- Extend or add tests in `tests/` whenever backend behavior
  changes, favoring high-value coverage over test count.