from __future__ import annotations

import sqlite3
from typing import Iterable


# Migrations: run before CREATE TABLE statements.
_MIGRATIONS: Iterable[str] = (
  # Drop old single-board-per-user constraint (allows multiple boards per user).
  "DROP INDEX IF EXISTS idx_boards_user_unique;",
)

# Columns added to existing tables in later versions.
# Each entry: (table, column_name, column_definition).
_COLUMN_ADDITIONS: tuple[tuple[str, str, str], ...] = (
  ("cards", "priority", "TEXT NOT NULL DEFAULT 'medium'"),
  ("cards", "due_date", "TEXT"),
  ("cards", "labels", "TEXT NOT NULL DEFAULT '[]'"),
  ("columns", "wip_limit", "INTEGER"),
  ("boards", "archived_at", "DATETIME"),
)

SCHEMA_STATEMENTS: Iterable[str] = (
  """
  PRAGMA foreign_keys = ON;
  """,
  """
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  """,
  """
  CREATE TABLE IF NOT EXISTS boards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  """,
  """
  CREATE INDEX IF NOT EXISTS idx_boards_user_id
  ON boards(user_id);
  """,
  """
  CREATE TABLE IF NOT EXISTS columns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    position INTEGER NOT NULL,
    FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
  );
  """,
  """
  CREATE INDEX IF NOT EXISTS idx_columns_board_position
  ON columns(board_id, position);
  """,
  """
  CREATE TABLE IF NOT EXISTS cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    column_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    details TEXT,
    priority TEXT NOT NULL DEFAULT 'medium',
    due_date TEXT,
    position INTEGER NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (column_id) REFERENCES columns(id) ON DELETE CASCADE
  );
  """,
  """
  CREATE INDEX IF NOT EXISTS idx_cards_column_position
  ON cards(column_id, position);
  """,
  """
  CREATE TABLE IF NOT EXISTS card_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id INTEGER NOT NULL,
    body TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
  );
  """,
  """
  CREATE INDEX IF NOT EXISTS idx_card_comments_card_id
  ON card_comments(card_id, created_at);
  """,
  """
  CREATE TABLE IF NOT EXISTS card_checklist_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    is_checked INTEGER NOT NULL DEFAULT 0,
    position INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
  );
  """,
  """
  CREATE INDEX IF NOT EXISTS idx_checklist_card_position
  ON card_checklist_items(card_id, position);
  """,
)

_VALID_PRIORITIES = frozenset({"low", "medium", "high", "urgent"})


def apply_schema(connection: sqlite3.Connection) -> None:
  """Apply the SQLite schema. Idempotent — safe to call multiple times."""
  connection.execute("PRAGMA foreign_keys = ON;")

  for migration in _MIGRATIONS:
    connection.execute(migration)
  connection.commit()

  for statement in SCHEMA_STATEMENTS:
    connection.executescript(statement)

  # Add new columns to existing tables without breaking idempotency.
  for table, column, definition in _COLUMN_ADDITIONS:
    existing = {row[1] for row in connection.execute(f"PRAGMA table_info({table});").fetchall()}
    if column not in existing:
      connection.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition};")
  connection.commit()
