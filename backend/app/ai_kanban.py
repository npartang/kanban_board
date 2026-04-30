from __future__ import annotations

import json
from typing import Any, List, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ValidationError

from app.ai import call_openrouter
from app.auth import get_current_user_id
from app.board_api import (
  BoardOut,
  CreateCardRequest,
  MoveCardRequest,
  RenameColumnRequest,
  create_card,
  delete_card,
  get_board,
  move_card,
  rename_column,
)


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


def _board_to_prompt_dict(board: BoardOut) -> dict[str, Any]:
  """Convert a BoardOut to the dict shape sent to the AI prompt."""
  return {
    "id": board.id,
    "name": board.name,
    "columns": [
      {"id": col.id, "title": col.title, "position": col.position}
      for col in board.columns
    ],
    "cards": [
      {
        "id": card.id,
        "columnId": card.column_id,
        "title": card.title,
        "details": card.details,
        "position": card.position,
      }
      for card in board.cards
    ],
  }


def _build_prompt(board: BoardOut, body: AIKanbanRequest) -> str:
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
- For createCard: provide columnId, title, and optionally details.
- For updateCard: provide cardId and at least one of title or details.
- For moveCard: provide cardId and targetColumnId. The card will be appended
  to the end of the target column — you cannot specify an exact position.
- For deleteCard: provide cardId.
- For renameColumn: provide columnId and title.
"""

  board_dict = _board_to_prompt_dict(board)

  return (
    instructions
    + "\n\nCurrent board JSON:\n"
    + json.dumps(board_dict, indent=2)
    + "\n\n"
    + history_text
    + f"User message:\n{body.message}\n\n"
    + "Respond only with the JSON object, no extra text."
  )


def _apply_operations(user_id: int, result: AIKanbanResult) -> None:
  from app.db import db_connection

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
        # Always appends to the end of the target column.
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
      continue


@router.post("/api/ai-kanban", response_model=AIKanbanResult)
async def ai_kanban(
  body: AIKanbanRequest,
  user_id: int = Depends(get_current_user_id),
) -> AIKanbanResult:
  board = get_board(user_id=user_id)
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
