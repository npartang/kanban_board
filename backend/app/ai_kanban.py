from __future__ import annotations

import json
from typing import Any, List, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ValidationError

from app.ai import call_openrouter
from app.auth import get_current_user_id
from app.board_api import (
  CreateCardRequest,
  MoveCardRequest,
  RenameColumnRequest,
  create_card,
  delete_card,
  move_card,
  rename_column,
)
from app.db import db_connection, ensure_board_for_user, seed_default_cards_if_empty


router = APIRouter()


class ChatTurn(BaseModel):
  role: Literal["user", "assistant"]
  content: str


class KanbanOperation(BaseModel):
  type: Literal["createCard", "updateCard", "moveCard", "deleteCard", "renameColumn"]
  cardId: int | None = None
  columnId: int | None = None
  targetColumnId: int | None = None
  title: str | None = None
  details: str | None = None


class AIKanbanRequest(BaseModel):
  message: str
  history: List[ChatTurn] = []


class AIKanbanResult(BaseModel):
  reply: str
  operations: List[KanbanOperation]


def _load_board_for_user(user_id: int) -> dict[str, Any]:
  with db_connection() as connection:
    board_id = ensure_board_for_user(connection, user_id)

    board_row = connection.execute(
      "SELECT id, name FROM boards WHERE id = ?;",
      (board_id,),
    ).fetchone()
    if board_row is None:
      raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Board not found",
      )

    column_rows = connection.execute(
      "SELECT id, title, position FROM columns WHERE board_id = ? ORDER BY position ASC;",
      (board_id,),
    ).fetchall()

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

  return {
    "id": board_row["id"],
    "name": board_row["name"],
    "columns": [
      {
        "id": row["id"],
        "title": row["title"],
        "position": row["position"],
      }
      for row in column_rows
    ],
    "cards": [
      {
        "id": row["id"],
        "columnId": row["column_id"],
        "title": row["title"],
        "details": row["details"],
        "position": row["position"],
      }
      for row in card_rows
    ],
  }


def _build_prompt(board: dict[str, Any], body: AIKanbanRequest) -> str:
  history_text = ""
  if body.history:
    joined = "\n".join(f"{turn.role}: {turn.content}" for turn in body.history)
    history_text = f"Conversation so far:\n{joined}\n\n"

  instructions = """
You are an assistant helping manage a kanban board.

You will receive:
- The current board as JSON.
- The recent conversation.
- The user's latest message.

You must respond ONLY with JSON in this exact shape:
{
  "reply": "text for the user",
  "operations": [
    {
      "type": "createCard" | "updateCard" | "moveCard" | "deleteCard" | "renameColumn",
      "cardId": number | null,
      "columnId": number | null,
      "targetColumnId": number | null,
      "title": string | null,
      "details": string | null
    },
    ...
  ]
}

Rules:
- Use numeric ids from the board JSON for cardId, columnId, and targetColumnId.
- Omit operations you don't need; an empty array is allowed.
- For createCard, provide columnId, title, and optionally details.
- For updateCard, provide cardId and at least one of title or details.
- For moveCard, provide cardId, targetColumnId, and position via the list order;
  this backend will choose the insert position based on your intent.
- For deleteCard, provide cardId.
- For renameColumn, provide columnId and title.
"""

  return (
    instructions
    + "\n\nCurrent board JSON:\n"
    + json.dumps(board, indent=2)
    + "\n\n"
    + history_text
    + f"User message:\n{body.message}\n\n"
    + "Respond only with the JSON object, no extra text."
  )


def _apply_operations(user_id: int, result: AIKanbanResult) -> None:
  for op in result.operations:
    try:
      if op.type == "createCard":
        if op.columnId is None or not op.title:
          continue
        create_card(
          CreateCardRequest(
            column_id=op.columnId,
            title=op.title,
            details=op.details,
          ),
          user_id=user_id,
        )
      elif op.type == "updateCard":
        if op.cardId is None or (op.title is None and op.details is None):
          continue
        # Simple in-place update using SQL; reuse db_connection.
        with db_connection() as connection:
          connection.execute(
            """
            UPDATE cards
            SET title = COALESCE(?, title),
                details = COALESCE(?, details)
            WHERE id IN (
              SELECT cards.id
              FROM cards
              JOIN columns ON cards.column_id = columns.id
              JOIN boards ON columns.board_id = boards.id
              WHERE cards.id = ? AND boards.user_id = ?
            );
            """,
            (op.title, op.details, op.cardId, user_id),
          )
          connection.commit()
      elif op.type == "moveCard":
        if op.cardId is None or op.targetColumnId is None:
          continue
        # Position is interpreted by backend; default to appending.
        move_card(
          op.cardId,
          MoveCardRequest(target_column_id=op.targetColumnId, position=10**9),
          user_id=user_id,
        )
      elif op.type == "deleteCard":
        if op.cardId is None:
          continue
        delete_card(op.cardId, user_id=user_id)
      elif op.type == "renameColumn":
        if op.columnId is None or not op.title:
          continue
        rename_column(
          op.columnId,
          RenameColumnRequest(title=op.title),
          user_id=user_id,
        )
    except HTTPException:
      # Ignore invalid operations (wrong ids, forbidden access, etc.).
      continue


@router.post("/api/ai-kanban", response_model=AIKanbanResult)
async def ai_kanban(
  body: AIKanbanRequest,
  user_id: int = Depends(get_current_user_id),
) -> AIKanbanResult:
  board = _load_board_for_user(user_id)
  prompt = _build_prompt(board, body)

  raw = await call_openrouter(prompt)
  try:
    data = json.loads(raw)
  except json.JSONDecodeError:
    raise HTTPException(
      status_code=status.HTTP_502_BAD_GATEWAY,
      detail="AI did not return valid JSON",
    )

  try:
    result = AIKanbanResult.model_validate(data)
  except ValidationError:
    raise HTTPException(
      status_code=status.HTTP_502_BAD_GATEWAY,
      detail="AI JSON did not match expected schema",
    )

  _apply_operations(user_id, result)
  return result

