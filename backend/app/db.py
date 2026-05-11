from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Generator

from app.db_schema import apply_schema


DB_ENV_VAR = "PM_DB_PATH"
DEFAULT_DB_FILENAME = "pm.db"
BASE_DIR = Path(__file__).resolve().parent

DEMO_USERNAME = "user"
DEMO_PASSWORD = "password"
DEFAULT_COLUMN_TITLES = ["Backlog", "Discovery", "In Progress", "Review", "Done"]


def get_db_path() -> Path:
  configured = os.getenv(DB_ENV_VAR)
  if configured:
    return Path(configured)
  return BASE_DIR / DEFAULT_DB_FILENAME


def _connect() -> sqlite3.Connection:
  connection = sqlite3.connect(get_db_path())
  connection.row_factory = sqlite3.Row
  connection.execute("PRAGMA foreign_keys = ON;")
  return connection


def ensure_schema() -> None:
  """Apply DDL once at startup. Idempotent."""
  with sqlite3.connect(get_db_path()) as conn:
    apply_schema(conn)


@contextmanager
def db_connection() -> Generator[sqlite3.Connection, None, None]:
  connection = _connect()
  try:
    yield connection
  finally:
    connection.close()


# ---------------------------------------------------------------------------
# User helpers
# ---------------------------------------------------------------------------

def create_user(connection: sqlite3.Connection, username: str, password_hash: str) -> int:
  cursor = connection.execute(
    "INSERT INTO users (username, password_hash) VALUES (?, ?);",
    (username, password_hash),
  )
  connection.commit()
  return int(cursor.lastrowid)


def get_user_by_username(connection: sqlite3.Connection, username: str) -> sqlite3.Row | None:
  return connection.execute(
    "SELECT id, username, password_hash, created_at FROM users WHERE username = ?;",
    (username,),
  ).fetchone()


def get_user_by_id(connection: sqlite3.Connection, user_id: int) -> sqlite3.Row | None:
  return connection.execute(
    "SELECT id, username, password_hash, created_at FROM users WHERE id = ?;",
    (user_id,),
  ).fetchone()


def ensure_demo_user(connection: sqlite3.Connection) -> int:
  """Create the demo user with a real bcrypt hash if not present. Returns user_id."""
  import bcrypt  # lazy import to avoid circular deps

  row = get_user_by_username(connection, DEMO_USERNAME)
  if row is not None:
    existing_hash = row["password_hash"]
    # If stored with placeholder hash (old schema), update to real bcrypt hash.
    if not existing_hash.startswith("$2b$") and not existing_hash.startswith("$2a$"):
      new_hash = bcrypt.hashpw(DEMO_PASSWORD.encode(), bcrypt.gensalt()).decode()
      connection.execute(
        "UPDATE users SET password_hash = ? WHERE id = ?;",
        (new_hash, int(row["id"])),
      )
      connection.commit()
    return int(row["id"])

  password_hash = bcrypt.hashpw(DEMO_PASSWORD.encode(), bcrypt.gensalt()).decode()
  return create_user(connection, DEMO_USERNAME, password_hash)


# ---------------------------------------------------------------------------
# Board helpers
# ---------------------------------------------------------------------------

def list_boards_for_user(connection: sqlite3.Connection, user_id: int) -> list[sqlite3.Row]:
  return connection.execute(
    "SELECT id, name, created_at, updated_at FROM boards WHERE user_id = ? AND archived_at IS NULL ORDER BY created_at ASC;",
    (user_id,),
  ).fetchall()


def create_board_for_user(
  connection: sqlite3.Connection,
  user_id: int,
  name: str,
  column_titles: list[str] | None = None,
) -> int:
  """Create a board with default columns. Returns board_id."""
  cursor = connection.execute(
    "INSERT INTO boards (user_id, name) VALUES (?, ?);",
    (user_id, name),
  )
  board_id = int(cursor.lastrowid)

  titles = column_titles if column_titles is not None else DEFAULT_COLUMN_TITLES
  for position, title in enumerate(titles):
    connection.execute(
      "INSERT INTO columns (board_id, title, position) VALUES (?, ?, ?);",
      (board_id, title, position),
    )

  connection.commit()
  return board_id


def get_board_for_user(
  connection: sqlite3.Connection,
  board_id: int,
  user_id: int,
) -> sqlite3.Row | None:
  return connection.execute(
    "SELECT id, name, user_id FROM boards WHERE id = ? AND user_id = ?;",
    (board_id, user_id),
  ).fetchone()


def ensure_board_for_user(connection: sqlite3.Connection, user_id: int) -> int:
  """Return the first board's ID for this user, creating one if none exists."""
  rows = list_boards_for_user(connection, user_id)
  if rows:
    return int(rows[0]["id"])
  return create_board_for_user(connection, user_id, "My Board")


def seed_default_cards_if_empty(connection: sqlite3.Connection, board_id: int) -> None:
  existing = connection.execute(
    """
    SELECT 1
    FROM cards
    JOIN columns ON cards.column_id = columns.id
    WHERE columns.board_id = ?
    LIMIT 1;
    """,
    (board_id,),
  ).fetchone()
  if existing:
    return

  column_rows = connection.execute(
    "SELECT id, title FROM columns WHERE board_id = ? ORDER BY position ASC;",
    (board_id,),
  ).fetchall()
  columns_by_title = {row["title"]: int(row["id"]) for row in column_rows}

  demo_cards: dict[str, list[tuple[str, str]]] = {
    "Backlog": [
      ("Align roadmap themes", "Draft quarterly themes with impact statements and metrics."),
      ("Gather customer signals", "Review support tags, sales notes, and churn feedback."),
    ],
    "Discovery": [
      ("Prototype analytics view", "Sketch initial dashboard layout and key drill-downs."),
    ],
    "In Progress": [
      ("Refine status language", "Standardize column labels and tone across the board."),
      ("Design card layout", "Add hierarchy and spacing for scanning dense lists."),
    ],
    "Review": [
      ("QA micro-interactions", "Verify hover, focus, and loading states."),
    ],
    "Done": [
      ("Ship marketing page", "Final copy approved and asset pack delivered."),
      ("Close onboarding sprint", "Document release notes and share internally."),
    ],
  }

  for title, cards in demo_cards.items():
    column_id = columns_by_title.get(title)
    if column_id is None:
      continue
    for position, (card_title, details) in enumerate(cards):
      connection.execute(
        "INSERT INTO cards (column_id, title, details, position) VALUES (?, ?, ?, ?);",
        (column_id, card_title, details, position),
      )

  connection.commit()


# ---------------------------------------------------------------------------
# Backward-compat alias kept for existing callers
# ---------------------------------------------------------------------------

def get_or_create_demo_user_id(connection: sqlite3.Connection) -> int:
  return ensure_demo_user(connection)
