import sqlite3

from app.db_schema import apply_schema


def create_in_memory_db() -> sqlite3.Connection:
  connection = sqlite3.connect(":memory:")
  apply_schema(connection)
  return connection


def test_tables_are_created() -> None:
  connection = create_in_memory_db()
  cursor = connection.execute(
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name;"
  )
  table_names = {row[0] for row in cursor.fetchall()}
  assert {"users", "boards", "columns", "cards"}.issubset(table_names)


def test_foreign_keys_are_configured() -> None:
  connection = create_in_memory_db()

  fk_boards = connection.execute("PRAGMA foreign_key_list('boards');").fetchall()
  fk_columns = connection.execute("PRAGMA foreign_key_list('columns');").fetchall()
  fk_cards = connection.execute("PRAGMA foreign_key_list('cards');").fetchall()

  # boards.user_id -> users.id
  assert any(row[2] == "users" and row[3] == "user_id" and row[4] == "id" for row in fk_boards)

  # columns.board_id -> boards.id
  assert any(row[2] == "boards" and row[3] == "board_id" and row[4] == "id" for row in fk_columns)

  # cards.column_id -> columns.id
  assert any(row[2] == "columns" and row[3] == "column_id" and row[4] == "id" for row in fk_cards)


def test_cascade_delete_removes_child_rows() -> None:
  connection = create_in_memory_db()
  cursor = connection.cursor()

  # Insert a user, board, column, card chain
  cursor.execute(
    "INSERT INTO users (username, password_hash) VALUES (?, ?);",
    ("user", "placeholder-hash"),
  )
  user_id = cursor.lastrowid

  cursor.execute(
    "INSERT INTO boards (user_id, name) VALUES (?, ?);",
    (user_id, "Demo board"),
  )
  board_id = cursor.lastrowid

  cursor.execute(
    "INSERT INTO columns (board_id, title, position) VALUES (?, ?, ?);",
    (board_id, "Backlog", 0),
  )
  column_id = cursor.lastrowid

  cursor.execute(
    "INSERT INTO cards (column_id, title, details, position) VALUES (?, ?, ?, ?);",
    (column_id, "Task", "Details", 0),
  )

  # Deleting the user should cascade to boards, columns, and cards
  cursor.execute("DELETE FROM users WHERE id = ?;", (user_id,))
  connection.commit()

  for table in ("boards", "columns", "cards"):
    count = connection.execute(f"SELECT COUNT(*) FROM {table};").fetchone()[0]
    assert count == 0


def test_one_board_per_user_enforced() -> None:
  connection = create_in_memory_db()
  cursor = connection.cursor()

  cursor.execute(
    "INSERT INTO users (username, password_hash) VALUES (?, ?);",
    ("user", "placeholder-hash"),
  )
  user_id = cursor.lastrowid

  cursor.execute(
    "INSERT INTO boards (user_id, name) VALUES (?, ?);",
    (user_id, "First"),
  )

  # Second board for same user should violate the unique index on user_id
  try:
    cursor.execute(
      "INSERT INTO boards (user_id, name) VALUES (?, ?);",
      (user_id, "Second"),
    )
    connection.commit()
  except sqlite3.IntegrityError:
    # Expected: unique constraint prevents a second board
    pass
  else:
    raise AssertionError("Expected IntegrityError when inserting second board for same user")

