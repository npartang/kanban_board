from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.auth import get_current_user_id
from app.db import db_connection, ensure_board_for_user, seed_default_cards_if_empty


router = APIRouter()


class ColumnOut(BaseModel):
  id: int
  title: str
  position: int


class CardOut(BaseModel):
  id: int
  column_id: int
  title: str
  details: str | None = None
  position: int


class BoardOut(BaseModel):
  id: int
  name: str
  columns: List[ColumnOut]
  cards: List[CardOut]


class RenameColumnRequest(BaseModel):
  title: str


class CreateCardRequest(BaseModel):
  column_id: int
  title: str
  details: str | None = None


class MoveCardRequest(BaseModel):
  target_column_id: int
  position: int


@router.get("/api/board", response_model=BoardOut)
def get_board(user_id: int = Depends(get_current_user_id)) -> BoardOut:
  with db_connection() as connection:
    board_id = ensure_board_for_user(connection, user_id)

    board_row = connection.execute(
      "SELECT id, name FROM boards WHERE id = ?;",
      (board_id,),
    ).fetchone()
    if board_row is None:
      raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Board not found")

    column_rows = connection.execute(
      "SELECT id, title, position FROM columns WHERE board_id = ? ORDER BY position ASC;",
      (board_id,),
    ).fetchall()

    # If the board has no cards yet, seed it with demo cards so the
    # initial experience matches the original in-memory board.
    seed_default_cards_if_empty(connection, board_id)

    card_rows = connection.execute(
      """
      SELECT id, column_id, title, details, position
      FROM cards
      WHERE column_id IN (SELECT id FROM columns WHERE board_id = ?)
      ORDER BY column_id ASC, position ASC;
      """,
      (board_id,),
    ).fetchall()

  columns = [
    ColumnOut(id=row["id"], title=row["title"], position=row["position"])
    for row in column_rows
  ]
  cards = [
    CardOut(
      id=row["id"],
      column_id=row["column_id"],
      title=row["title"],
      details=row["details"],
      position=row["position"],
    )
    for row in card_rows
  ]

  return BoardOut(id=board_row["id"], name=board_row["name"], columns=columns, cards=cards)


@router.post("/api/columns/{column_id}/rename", status_code=status.HTTP_204_NO_CONTENT)
def rename_column(
  column_id: int,
  payload: RenameColumnRequest,
  user_id: int = Depends(get_current_user_id),
) -> None:
  with db_connection() as connection:
    # Ensure the column belongs to the current user's board
    row = connection.execute(
      """
      SELECT c.id
      FROM columns c
      JOIN boards b ON c.board_id = b.id
      WHERE c.id = ? AND b.user_id = ?;
      """,
      (column_id, user_id),
    ).fetchone()
    if row is None:
      raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Column not found")

    connection.execute(
      "UPDATE columns SET title = ? WHERE id = ?;",
      (payload.title, column_id),
    )
    connection.commit()


@router.post("/api/cards", response_model=CardOut, status_code=status.HTTP_201_CREATED)
def create_card(
  payload: CreateCardRequest,
  user_id: int = Depends(get_current_user_id),
) -> CardOut:
  with db_connection() as connection:
    # Ensure the column belongs to the current user's board
    column_row = connection.execute(
      """
      SELECT c.id
      FROM columns c
      JOIN boards b ON c.board_id = b.id
      WHERE c.id = ? AND b.user_id = ?;
      """,
      (payload.column_id, user_id),
    ).fetchone()
    if column_row is None:
      raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Column not found")

    next_position_row = connection.execute(
      "SELECT COALESCE(MAX(position) + 1, 0) AS next_pos FROM cards WHERE column_id = ?;",
      (payload.column_id,),
    ).fetchone()
    next_position = int(next_position_row["next_pos"])

    cursor = connection.execute(
      """
      INSERT INTO cards (column_id, title, details, position)
      VALUES (?, ?, ?, ?);
      """,
      (payload.column_id, payload.title, payload.details, next_position),
    )
    card_id = int(cursor.lastrowid)
    connection.commit()

    card_row = connection.execute(
      "SELECT id, column_id, title, details, position FROM cards WHERE id = ?;",
      (card_id,),
    ).fetchone()

  return CardOut(
    id=card_row["id"],
    column_id=card_row["column_id"],
    title=card_row["title"],
    details=card_row["details"],
    position=card_row["position"],
  )


@router.delete("/api/cards/{card_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_card(card_id: int, user_id: int = Depends(get_current_user_id)) -> None:
  with db_connection() as connection:
    row = connection.execute(
      """
      SELECT cards.id
      FROM cards
      JOIN columns ON cards.column_id = columns.id
      JOIN boards ON columns.board_id = boards.id
      WHERE cards.id = ? AND boards.user_id = ?;
      """,
      (card_id, user_id),
    ).fetchone()
    if row is None:
      raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Card not found")

    connection.execute("DELETE FROM cards WHERE id = ?;", (card_id,))
    connection.commit()


@router.post("/api/cards/{card_id}/move", status_code=status.HTTP_204_NO_CONTENT)
def move_card(
  card_id: int,
  payload: MoveCardRequest,
  user_id: int = Depends(get_current_user_id),
) -> None:
  with db_connection() as connection:
    card_row = connection.execute(
      """
      SELECT cards.id, cards.column_id AS from_column_id, boards.id AS board_id
      FROM cards
      JOIN columns ON cards.column_id = columns.id
      JOIN boards ON columns.board_id = boards.id
      WHERE cards.id = ? AND boards.user_id = ?;
      """,
      (card_id, user_id),
    ).fetchone()
    if card_row is None:
      raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Card not found")

    from_column_id = int(card_row["from_column_id"])

    target_column_row = connection.execute(
      """
      SELECT c.id
      FROM columns c
      JOIN boards b ON c.board_id = b.id
      WHERE c.id = ? AND b.user_id = ?;
      """,
      (payload.target_column_id, user_id),
    ).fetchone()
    if target_column_row is None:
      raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target column not found")

    # Reorder cards in source and target columns.
    # Fetch current ordering for both columns.
    source_ids = [
      row["id"]
      for row in connection.execute(
        "SELECT id FROM cards WHERE column_id = ? ORDER BY position ASC;",
        (from_column_id,),
      ).fetchall()
    ]

    target_ids = [
      row["id"]
      for row in connection.execute(
        "SELECT id FROM cards WHERE column_id = ? ORDER BY position ASC;",
        (payload.target_column_id,),
      ).fetchall()
    ]

    if card_id in source_ids:
      source_ids.remove(card_id)

    if from_column_id == payload.target_column_id:
      # Moving within the same column: just reinsert at the new position.
      insert_index = max(0, min(payload.position, len(source_ids)))
      source_ids.insert(insert_index, card_id)
      target_ids = source_ids
    else:
      # Moving across columns: remove from source, insert into target.
      for idx, cid in enumerate(source_ids):
        connection.execute(
          "UPDATE cards SET position = ? WHERE id = ?;",
          (idx, cid),
        )

      insert_index = max(0, min(payload.position, len(target_ids)))
      target_ids.insert(insert_index, card_id)

    # Apply positions in target column (and column_id if it changed).
    for idx, cid in enumerate(target_ids):
      connection.execute(
        "UPDATE cards SET column_id = ?, position = ? WHERE id = ?;",
        (payload.target_column_id, idx, cid),
      )

    connection.commit()

