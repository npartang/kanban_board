from __future__ import annotations

import sqlite3
from typing import Iterable


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
  CREATE UNIQUE INDEX IF NOT EXISTS idx_boards_user_unique
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
)


def apply_schema(connection: sqlite3.Connection) -> None:
  """Apply the SQLite schema for the application.

  This function is idempotent: it can be run multiple times safely.
  """

  # Ensure foreign key enforcement is on for this connection.
  connection.execute("PRAGMA foreign_keys = ON;")

  for statement in SCHEMA_STATEMENTS:
    connection.executescript(statement)

