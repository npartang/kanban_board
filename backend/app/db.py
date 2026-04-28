from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

from app.db_schema import apply_schema


DB_ENV_VAR = "PM_DB_PATH"
DEFAULT_DB_FILENAME = "pm.db"
BASE_DIR = Path(__file__).resolve().parent


def get_db_path() -> Path:
  """Return the path to the SQLite database file."""
  configured = os.getenv(DB_ENV_VAR)
  if configured:
    return Path(configured)
  return BASE_DIR / DEFAULT_DB_FILENAME


def _connect() -> sqlite3.Connection:
  connection = sqlite3.connect(get_db_path())
  connection.row_factory = sqlite3.Row
  apply_schema(connection)
  return connection


@contextmanager
def db_connection() -> sqlite3.Connection:
  """Context manager yielding a SQLite connection with schema applied."""
  connection = _connect()
  try:
    yield connection
  finally:
    connection.close()


def get_or_create_demo_user_id(connection: sqlite3.Connection) -> int:
  """Return the ID of the demo user, creating it if necessary."""
  cursor = connection.execute(
    "SELECT id FROM users WHERE username = ?;",
    ("user",),
  )
  row = cursor.fetchone()
  if row is not None:
    return int(row["id"])

  cursor = connection.execute(
    "INSERT INTO users (username, password_hash) VALUES (?, ?);",
    ("user", "placeholder-hash"),
  )
  connection.commit()
  return int(cursor.lastrowid)


def ensure_board_for_user(connection: sqlite3.Connection, user_id: int) -> int:
  """Ensure the given user has a board and default columns, returning the board ID."""
  cursor = connection.execute(
    "SELECT id FROM boards WHERE user_id = ?;",
    (user_id,),
  )
  row = cursor.fetchone()
  if row is not None:
    return int(row["id"])

  cursor = connection.execute(
    "INSERT INTO boards (user_id, name) VALUES (?, ?);",
    (user_id, "My board"),
  )
  board_id = int(cursor.lastrowid)

  default_titles = ["Backlog", "Discovery", "In Progress", "Review", "Done"]
  for position, title in enumerate(default_titles):
    connection.execute(
      "INSERT INTO columns (board_id, title, position) VALUES (?, ?, ?);",
      (board_id, title, position),
    )

  connection.commit()
  return board_id


def seed_default_cards_if_empty(connection: sqlite3.Connection, board_id: int) -> None:
  """Populate a new board with a set of demo cards if it has none.

  This mirrors the initial in-memory demo data so that the UI
  still feels populated after moving to a persistent backend.
  """
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

  demo_cards = {
    "Backlog": [
      (
        "Align roadmap themes",
        "Draft quarterly themes with impact statements and metrics.",
      ),
      (
        "Gather customer signals",
        "Review support tags, sales notes, and churn feedback.",
      ),
    ],
    "Discovery": [
      (
        "Prototype analytics view",
        "Sketch initial dashboard layout and key drill-downs.",
      )
    ],
    "In Progress": [
      (
        "Refine status language",
        "Standardize column labels and tone across the board.",
      ),
      (
        "Design card layout",
        "Add hierarchy and spacing for scanning dense lists.",
      ),
    ],
    "Review": [
      ("QA micro-interactions", "Verify hover, focus, and loading states."),
    ],
    "Done": [
      ("Ship marketing page", "Final copy approved and asset pack delivered."),
      (
        "Close onboarding sprint",
        "Document release notes and share internally.",
      ),
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

