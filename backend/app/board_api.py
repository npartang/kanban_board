from __future__ import annotations

import json
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, status
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
    archived_at: str | None = None


class ColumnOut(BaseModel):
    id: int
    title: str
    position: int
    wip_limit: int | None = None


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
    checklist_total: int = 0
    checklist_done: int = 0


class BoardOut(BaseModel):
    id: int
    name: str
    columns: List[ColumnOut]
    cards: List[CardOut]


class RenameBoardRequest(BaseModel):
    name: str


class RenameColumnRequest(BaseModel):
    title: str


class SetWipLimitRequest(BaseModel):
    wip_limit: int | None = None


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


class ReorderColumnsRequest(BaseModel):
    column_ids: List[int]


class CommentOut(BaseModel):
    id: int
    card_id: int
    body: str
    created_at: str


class CreateCommentRequest(BaseModel):
    body: str


class ChecklistItemOut(BaseModel):
    id: int
    card_id: int
    text: str
    is_checked: bool
    position: int


class CreateChecklistItemRequest(BaseModel):
    text: str


class UpdateChecklistItemRequest(BaseModel):
    text: str | None = None
    is_checked: bool | None = None


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
        "SELECT id, title, position, wip_limit FROM columns WHERE board_id = ? ORDER BY position ASC;",
        (board_id,),
    ).fetchall()

    if seed:
        seed_default_cards_if_empty(connection, board_id)

    card_rows = connection.execute(
        """
        SELECT
            cards.id, cards.column_id, cards.title, cards.details,
            cards.priority, cards.due_date, cards.labels, cards.position,
            (SELECT COUNT(*) FROM card_checklist_items WHERE card_id = cards.id) AS checklist_total,
            (SELECT COUNT(*) FROM card_checklist_items WHERE card_id = cards.id AND is_checked = 1) AS checklist_done
        FROM cards
        WHERE cards.column_id IN (SELECT id FROM columns WHERE board_id = ?)
        ORDER BY cards.column_id ASC, cards.position ASC;
        """,
        (board_id,),
    ).fetchall()

    return BoardOut(
        id=board_row["id"],
        name=board_row["name"],
        columns=[
            ColumnOut(id=r["id"], title=r["title"], position=r["position"], wip_limit=r["wip_limit"])
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
                checklist_total=r["checklist_total"] or 0,
                checklist_done=r["checklist_done"] or 0,
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
def list_boards(
    archived: bool = Query(default=False),
    user_id: int = Depends(get_current_user_id),
) -> List[BoardSummary]:
    with db_connection() as connection:
        if archived:
            rows = connection.execute(
                "SELECT id, name, archived_at FROM boards WHERE user_id = ? AND archived_at IS NOT NULL ORDER BY archived_at DESC;",
                (user_id,),
            ).fetchall()
        else:
            rows = connection.execute(
                "SELECT id, name, archived_at FROM boards WHERE user_id = ? AND archived_at IS NULL ORDER BY id ASC;",
                (user_id,),
            ).fetchall()
    return [BoardSummary(id=int(r["id"]), name=r["name"], archived_at=r["archived_at"]) for r in rows]


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
        row = connection.execute(
            "SELECT id FROM boards WHERE id = ? AND user_id = ? AND archived_at IS NULL;",
            (board_id, user_id),
        ).fetchone()
        if row is None:
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
def archive_board(
    board_id: int,
    user_id: int = Depends(get_current_user_id),
) -> None:
    with db_connection() as connection:
        row = connection.execute(
            "SELECT id FROM boards WHERE id = ? AND user_id = ?;",
            (board_id, user_id),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Board not found")
        connection.execute(
            "UPDATE boards SET archived_at = CURRENT_TIMESTAMP WHERE id = ?;",
            (board_id,),
        )
        connection.commit()


@router.post("/api/boards/{board_id}/restore", status_code=status.HTTP_204_NO_CONTENT)
def restore_board(
    board_id: int,
    user_id: int = Depends(get_current_user_id),
) -> None:
    with db_connection() as connection:
        row = connection.execute(
            "SELECT id FROM boards WHERE id = ? AND user_id = ? AND archived_at IS NOT NULL;",
            (board_id, user_id),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Archived board not found")
        connection.execute("UPDATE boards SET archived_at = NULL WHERE id = ?;", (board_id,))
        connection.commit()


@router.delete("/api/boards/{board_id}/permanent", status_code=status.HTTP_204_NO_CONTENT)
def permanently_delete_board(
    board_id: int,
    user_id: int = Depends(get_current_user_id),
) -> None:
    with db_connection() as connection:
        row = connection.execute(
            "SELECT id FROM boards WHERE id = ? AND user_id = ?;",
            (board_id, user_id),
        ).fetchone()
        if row is None:
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
            "SELECT id, title, position, wip_limit FROM columns WHERE id = ?;", (col_id,)
        ).fetchone()

    return ColumnOut(id=row["id"], title=row["title"], position=row["position"], wip_limit=row["wip_limit"])


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


@router.post("/api/columns/{column_id}/wip-limit", status_code=status.HTTP_204_NO_CONTENT)
def set_wip_limit(
    column_id: int,
    payload: SetWipLimitRequest,
    user_id: int = Depends(get_current_user_id),
) -> None:
    with db_connection() as connection:
        _verify_column_ownership(connection, column_id, user_id)
        connection.execute(
            "UPDATE columns SET wip_limit = ? WHERE id = ?;",
            (payload.wip_limit, column_id),
        )
        connection.commit()


@router.post("/api/boards/{board_id}/reorder-columns", status_code=status.HTTP_204_NO_CONTENT)
def reorder_columns(
    board_id: int,
    payload: ReorderColumnsRequest,
    user_id: int = Depends(get_current_user_id),
) -> None:
    with db_connection() as connection:
        if get_board_for_user(connection, board_id, user_id) is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Board not found")
        for position, column_id in enumerate(payload.column_ids):
            row = connection.execute(
                "SELECT id FROM columns WHERE id = ? AND board_id = ?;",
                (column_id, board_id),
            ).fetchone()
            if row is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Column {column_id} not found in this board",
                )
            connection.execute(
                "UPDATE columns SET position = ? WHERE id = ?;",
                (position, column_id),
            )
        connection.commit()


# ---------------------------------------------------------------------------
# Comment routes
# ---------------------------------------------------------------------------

@router.get("/api/cards/{card_id}/comments", response_model=List[CommentOut])
def list_comments(
    card_id: int,
    user_id: int = Depends(get_current_user_id),
) -> List[CommentOut]:
    with db_connection() as connection:
        _verify_card_ownership(connection, card_id, user_id)
        rows = connection.execute(
            "SELECT id, card_id, body, created_at FROM card_comments WHERE card_id = ? ORDER BY created_at ASC;",
            (card_id,),
        ).fetchall()
    return [
        CommentOut(id=r["id"], card_id=r["card_id"], body=r["body"], created_at=r["created_at"])
        for r in rows
    ]


@router.post("/api/cards/{card_id}/comments", response_model=CommentOut, status_code=status.HTTP_201_CREATED)
def add_comment(
    card_id: int,
    payload: CreateCommentRequest,
    user_id: int = Depends(get_current_user_id),
) -> CommentOut:
    body = payload.body.strip()
    if not body:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Comment body cannot be empty")
    with db_connection() as connection:
        _verify_card_ownership(connection, card_id, user_id)
        cursor = connection.execute(
            "INSERT INTO card_comments (card_id, body) VALUES (?, ?);",
            (card_id, body),
        )
        comment_id = int(cursor.lastrowid)
        connection.commit()
        row = connection.execute(
            "SELECT id, card_id, body, created_at FROM card_comments WHERE id = ?;",
            (comment_id,),
        ).fetchone()
    return CommentOut(id=row["id"], card_id=row["card_id"], body=row["body"], created_at=row["created_at"])


@router.delete("/api/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_comment(
    comment_id: int,
    user_id: int = Depends(get_current_user_id),
) -> None:
    with db_connection() as connection:
        row = connection.execute(
            """
            SELECT cc.id FROM card_comments cc
            JOIN cards ON cc.card_id = cards.id
            JOIN columns ON cards.column_id = columns.id
            JOIN boards ON columns.board_id = boards.id
            WHERE cc.id = ? AND boards.user_id = ?;
            """,
            (comment_id, user_id),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
        connection.execute("DELETE FROM card_comments WHERE id = ?;", (comment_id,))
        connection.commit()


# ---------------------------------------------------------------------------
# Checklist routes
# ---------------------------------------------------------------------------

@router.get("/api/cards/{card_id}/checklist", response_model=List[ChecklistItemOut])
def list_checklist(
    card_id: int,
    user_id: int = Depends(get_current_user_id),
) -> List[ChecklistItemOut]:
    with db_connection() as connection:
        _verify_card_ownership(connection, card_id, user_id)
        rows = connection.execute(
            "SELECT id, card_id, text, is_checked, position FROM card_checklist_items WHERE card_id = ? ORDER BY position ASC;",
            (card_id,),
        ).fetchall()
    return [
        ChecklistItemOut(id=r["id"], card_id=r["card_id"], text=r["text"], is_checked=bool(r["is_checked"]), position=r["position"])
        for r in rows
    ]


@router.post("/api/cards/{card_id}/checklist", response_model=ChecklistItemOut, status_code=status.HTTP_201_CREATED)
def add_checklist_item(
    card_id: int,
    payload: CreateChecklistItemRequest,
    user_id: int = Depends(get_current_user_id),
) -> ChecklistItemOut:
    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Checklist item text cannot be empty")
    with db_connection() as connection:
        _verify_card_ownership(connection, card_id, user_id)
        next_pos_row = connection.execute(
            "SELECT COALESCE(MAX(position) + 1, 0) AS next_pos FROM card_checklist_items WHERE card_id = ?;",
            (card_id,),
        ).fetchone()
        next_pos = int(next_pos_row["next_pos"])
        cursor = connection.execute(
            "INSERT INTO card_checklist_items (card_id, text, position) VALUES (?, ?, ?);",
            (card_id, text, next_pos),
        )
        item_id = int(cursor.lastrowid)
        connection.commit()
        row = connection.execute(
            "SELECT id, card_id, text, is_checked, position FROM card_checklist_items WHERE id = ?;",
            (item_id,),
        ).fetchone()
    return ChecklistItemOut(id=row["id"], card_id=row["card_id"], text=row["text"], is_checked=bool(row["is_checked"]), position=row["position"])


@router.patch("/api/checklist/{item_id}", response_model=ChecklistItemOut)
def update_checklist_item(
    item_id: int,
    payload: UpdateChecklistItemRequest,
    user_id: int = Depends(get_current_user_id),
) -> ChecklistItemOut:
    with db_connection() as connection:
        ownership = connection.execute(
            """
            SELECT ci.id FROM card_checklist_items ci
            JOIN cards ON ci.card_id = cards.id
            JOIN columns ON cards.column_id = columns.id
            JOIN boards ON columns.board_id = boards.id
            WHERE ci.id = ? AND boards.user_id = ?;
            """,
            (item_id, user_id),
        ).fetchone()
        if ownership is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Checklist item not found")

        if payload.text is not None:
            connection.execute(
                "UPDATE card_checklist_items SET text = ? WHERE id = ?;",
                (payload.text.strip(), item_id),
            )
        if payload.is_checked is not None:
            connection.execute(
                "UPDATE card_checklist_items SET is_checked = ? WHERE id = ?;",
                (1 if payload.is_checked else 0, item_id),
            )
        connection.commit()

        row = connection.execute(
            "SELECT id, card_id, text, is_checked, position FROM card_checklist_items WHERE id = ?;",
            (item_id,),
        ).fetchone()
    return ChecklistItemOut(id=row["id"], card_id=row["card_id"], text=row["text"], is_checked=bool(row["is_checked"]), position=row["position"])


@router.delete("/api/checklist/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_checklist_item(
    item_id: int,
    user_id: int = Depends(get_current_user_id),
) -> None:
    with db_connection() as connection:
        ownership = connection.execute(
            """
            SELECT ci.id FROM card_checklist_items ci
            JOIN cards ON ci.card_id = cards.id
            JOIN columns ON cards.column_id = columns.id
            JOIN boards ON columns.board_id = boards.id
            WHERE ci.id = ? AND boards.user_id = ?;
            """,
            (item_id, user_id),
        ).fetchone()
        if ownership is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Checklist item not found")
        connection.execute("DELETE FROM card_checklist_items WHERE id = ?;", (item_id,))
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
