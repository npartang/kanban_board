from __future__ import annotations

import json
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.auth import get_current_user_id
from app.db import (
    create_board_for_user,
    db_connection,
    ensure_board_for_user,
    get_board_for_user,
    list_boards_for_user,
    seed_default_cards_if_empty,
)


router = APIRouter()


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class BoardSummary(BaseModel):
    id: int
    name: str


class ColumnOut(BaseModel):
    id: int
    title: str
    position: int


VALID_PRIORITIES = frozenset({"low", "medium", "high", "urgent"})


class CardOut(BaseModel):
    id: int
    column_id: int
    title: str
    details: str | None = None
    priority: str = "medium"
    due_date: str | None = None
    labels: List[str] = []
    position: int


class BoardOut(BaseModel):
    id: int
    name: str
    columns: List[ColumnOut]
    cards: List[CardOut]


class RenameBoardRequest(BaseModel):
    name: str


class RenameColumnRequest(BaseModel):
    title: str


class CreateColumnRequest(BaseModel):
    title: str


class CreateCardRequest(BaseModel):
    column_id: int
    title: str
    details: str | None = None
    priority: str = "medium"
    due_date: str | None = None
    labels: List[str] = []


class UpdateCardRequest(BaseModel):
    title: str | None = None
    details: str | None = None
    priority: str | None = None
    due_date: str | None = None
    labels: List[str] | None = None


class MoveCardRequest(BaseModel):
    target_column_id: int
    position: int


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _load_board(connection, board_id: int, seed: bool = False) -> BoardOut:
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

    if seed:
        seed_default_cards_if_empty(connection, board_id)

    card_rows = connection.execute(
        """
        SELECT id, column_id, title, details, priority, due_date, labels, position
        FROM cards
        WHERE column_id IN (SELECT id FROM columns WHERE board_id = ?)
        ORDER BY column_id ASC, position ASC;
        """,
        (board_id,),
    ).fetchall()

    return BoardOut(
        id=board_row["id"],
        name=board_row["name"],
        columns=[
            ColumnOut(id=r["id"], title=r["title"], position=r["position"])
            for r in column_rows
        ],
        cards=[
            CardOut(
                id=r["id"],
                column_id=r["column_id"],
                title=r["title"],
                details=r["details"],
                priority=r["priority"] or "medium",
                due_date=r["due_date"],
                labels=_parse_labels(r["labels"]),
                position=r["position"],
            )
            for r in card_rows
        ],
    )


def _parse_labels(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
        return [str(l) for l in parsed] if isinstance(parsed, list) else []
    except (json.JSONDecodeError, TypeError):
        return []


def _verify_column_ownership(connection, column_id: int, user_id: int) -> None:
    row = connection.execute(
        """
        SELECT c.id FROM columns c
        JOIN boards b ON c.board_id = b.id
        WHERE c.id = ? AND b.user_id = ?;
        """,
        (column_id, user_id),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Column not found")


def _verify_card_ownership(connection, card_id: int, user_id: int) -> None:
    row = connection.execute(
        """
        SELECT cards.id FROM cards
        JOIN columns ON cards.column_id = columns.id
        JOIN boards ON columns.board_id = boards.id
        WHERE cards.id = ? AND boards.user_id = ?;
        """,
        (card_id, user_id),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Card not found")


# ---------------------------------------------------------------------------
# Board routes
# ---------------------------------------------------------------------------

@router.get("/api/boards", response_model=List[BoardSummary])
def list_boards(user_id: int = Depends(get_current_user_id)) -> List[BoardSummary]:
    with db_connection() as connection:
        rows = list_boards_for_user(connection, user_id)
    return [BoardSummary(id=int(r["id"]), name=r["name"]) for r in rows]


@router.post("/api/boards", response_model=BoardSummary, status_code=status.HTTP_201_CREATED)
def create_board(
    payload: RenameBoardRequest,
    user_id: int = Depends(get_current_user_id),
) -> BoardSummary:
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Board name cannot be empty")
    with db_connection() as connection:
        board_id = create_board_for_user(connection, user_id, name)
        row = connection.execute("SELECT id, name FROM boards WHERE id = ?;", (board_id,)).fetchone()
    return BoardSummary(id=int(row["id"]), name=row["name"])


@router.get("/api/boards/{board_id}", response_model=BoardOut)
def get_board_by_id(
    board_id: int,
    user_id: int = Depends(get_current_user_id),
) -> BoardOut:
    with db_connection() as connection:
        if get_board_for_user(connection, board_id, user_id) is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Board not found")
        return _load_board(connection, board_id, seed=True)


@router.patch("/api/boards/{board_id}", status_code=status.HTTP_204_NO_CONTENT)
def rename_board(
    board_id: int,
    payload: RenameBoardRequest,
    user_id: int = Depends(get_current_user_id),
) -> None:
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Board name cannot be empty")
    with db_connection() as connection:
        if get_board_for_user(connection, board_id, user_id) is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Board not found")
        connection.execute(
            "UPDATE boards SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?;",
            (name, board_id),
        )
        connection.commit()


@router.delete("/api/boards/{board_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_board(
    board_id: int,
    user_id: int = Depends(get_current_user_id),
) -> None:
    with db_connection() as connection:
        if get_board_for_user(connection, board_id, user_id) is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Board not found")
        connection.execute("DELETE FROM boards WHERE id = ?;", (board_id,))
        connection.commit()


# Backward-compat shortcut: returns the user's first board, creating one if needed.
@router.get("/api/board", response_model=BoardOut)
def get_board(user_id: int = Depends(get_current_user_id)) -> BoardOut:
    with db_connection() as connection:
        board_id = ensure_board_for_user(connection, user_id)
        return _load_board(connection, board_id, seed=True)


# ---------------------------------------------------------------------------
# Column routes
# ---------------------------------------------------------------------------

@router.post("/api/boards/{board_id}/columns", response_model=ColumnOut, status_code=status.HTTP_201_CREATED)
def create_column(
    board_id: int,
    payload: CreateColumnRequest,
    user_id: int = Depends(get_current_user_id),
) -> ColumnOut:
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Column title cannot be empty")
    with db_connection() as connection:
        if get_board_for_user(connection, board_id, user_id) is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Board not found")

        next_pos_row = connection.execute(
            "SELECT COALESCE(MAX(position) + 1, 0) AS next_pos FROM columns WHERE board_id = ?;",
            (board_id,),
        ).fetchone()
        next_pos = int(next_pos_row["next_pos"])

        cursor = connection.execute(
            "INSERT INTO columns (board_id, title, position) VALUES (?, ?, ?);",
            (board_id, title, next_pos),
        )
        col_id = int(cursor.lastrowid)
        connection.commit()

        row = connection.execute(
            "SELECT id, title, position FROM columns WHERE id = ?;", (col_id,)
        ).fetchone()

    return ColumnOut(id=row["id"], title=row["title"], position=row["position"])


@router.post("/api/columns/{column_id}/rename", status_code=status.HTTP_204_NO_CONTENT)
def rename_column(
    column_id: int,
    payload: RenameColumnRequest,
    user_id: int = Depends(get_current_user_id),
) -> None:
    with db_connection() as connection:
        _verify_column_ownership(connection, column_id, user_id)
        connection.execute("UPDATE columns SET title = ? WHERE id = ?;", (payload.title, column_id))
        connection.commit()


@router.delete("/api/columns/{column_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_column(
    column_id: int,
    user_id: int = Depends(get_current_user_id),
) -> None:
    with db_connection() as connection:
        _verify_column_ownership(connection, column_id, user_id)
        connection.execute("DELETE FROM columns WHERE id = ?;", (column_id,))
        connection.commit()


# ---------------------------------------------------------------------------
# Card routes
# ---------------------------------------------------------------------------

@router.post("/api/cards", response_model=CardOut, status_code=status.HTTP_201_CREATED)
def create_card(
    payload: CreateCardRequest,
    user_id: int = Depends(get_current_user_id),
) -> CardOut:
    with db_connection() as connection:
        _verify_column_ownership(connection, payload.column_id, user_id)

        next_pos_row = connection.execute(
            "SELECT COALESCE(MAX(position) + 1, 0) AS next_pos FROM cards WHERE column_id = ?;",
            (payload.column_id,),
        ).fetchone()
        next_position = int(next_pos_row["next_pos"])

        priority = payload.priority if payload.priority in VALID_PRIORITIES else "medium"
        labels_json = json.dumps(payload.labels)
        cursor = connection.execute(
            "INSERT INTO cards (column_id, title, details, priority, due_date, labels, position) VALUES (?, ?, ?, ?, ?, ?, ?);",
            (payload.column_id, payload.title, payload.details, priority, payload.due_date, labels_json, next_position),
        )
        card_id = int(cursor.lastrowid)
        connection.commit()

        card_row = connection.execute(
            "SELECT id, column_id, title, details, priority, due_date, labels, position FROM cards WHERE id = ?;",
            (card_id,),
        ).fetchone()

    return CardOut(
        id=card_row["id"],
        column_id=card_row["column_id"],
        title=card_row["title"],
        details=card_row["details"],
        priority=card_row["priority"] or "medium",
        due_date=card_row["due_date"],
        labels=_parse_labels(card_row["labels"]),
        position=card_row["position"],
    )


@router.patch("/api/cards/{card_id}", response_model=CardOut)
def update_card(
    card_id: int,
    payload: UpdateCardRequest,
    user_id: int = Depends(get_current_user_id),
) -> CardOut:
    with db_connection() as connection:
        _verify_card_ownership(connection, card_id, user_id)

        updates: list[tuple[object, int]] = []
        if payload.title is not None:
            updates.append(("UPDATE cards SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?;", payload.title))
        if payload.details is not None:
            updates.append(("UPDATE cards SET details = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?;", payload.details))
        if payload.priority is not None:
            priority = payload.priority if payload.priority in VALID_PRIORITIES else "medium"
            updates.append(("UPDATE cards SET priority = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?;", priority))
        if payload.due_date is not None:
            # Empty string means "clear the due date"
            due = payload.due_date if payload.due_date else None
            updates.append(("UPDATE cards SET due_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?;", due))
        if payload.labels is not None:
            updates.append(("UPDATE cards SET labels = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?;", json.dumps(payload.labels)))

        for sql, val in updates:
            connection.execute(sql, (val, card_id))  # type: ignore[arg-type]
        connection.commit()

        card_row = connection.execute(
            "SELECT id, column_id, title, details, priority, due_date, labels, position FROM cards WHERE id = ?;",
            (card_id,),
        ).fetchone()

    return CardOut(
        id=card_row["id"],
        column_id=card_row["column_id"],
        title=card_row["title"],
        details=card_row["details"],
        priority=card_row["priority"] or "medium",
        due_date=card_row["due_date"],
        labels=_parse_labels(card_row["labels"]),
        position=card_row["position"],
    )


@router.delete("/api/cards/{card_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_card(card_id: int, user_id: int = Depends(get_current_user_id)) -> None:
    with db_connection() as connection:
        _verify_card_ownership(connection, card_id, user_id)
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
            SELECT cards.id, cards.column_id AS from_column_id
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

        _verify_column_ownership(connection, payload.target_column_id, user_id)

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
            insert_index = max(0, min(payload.position, len(source_ids)))
            source_ids.insert(insert_index, card_id)
            target_ids = source_ids
        else:
            for idx, cid in enumerate(source_ids):
                connection.execute("UPDATE cards SET position = ? WHERE id = ?;", (idx, cid))

            insert_index = max(0, min(payload.position, len(target_ids)))
            target_ids.insert(insert_index, card_id)

        for idx, cid in enumerate(target_ids):
            connection.execute(
                "UPDATE cards SET column_id = ?, position = ? WHERE id = ?;",
                (payload.target_column_id, idx, cid),
            )

        connection.commit()
