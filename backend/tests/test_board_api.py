import pytest
from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def login_demo_user() -> None:
    response = client.post("/api/login", json={"username": "user", "password": "password"})
    assert response.status_code == 200


def login_as(username: str, password: str = "testpass1") -> None:
    client.post("/api/register", json={"username": username, "password": password})


# ---------------------------------------------------------------------------
# Auth guards
# ---------------------------------------------------------------------------

def test_unauthenticated_access_to_board_list_is_rejected() -> None:
    assert client.get("/api/boards").status_code == 401


def test_unauthenticated_access_to_board_is_rejected() -> None:
    assert client.get("/api/board").status_code == 401


def test_unauthenticated_create_board_is_rejected() -> None:
    assert client.post("/api/boards", json={"name": "x"}).status_code == 401


# ---------------------------------------------------------------------------
# /api/board (backward-compat shortcut)
# ---------------------------------------------------------------------------

def test_get_board_creates_default_board_for_user() -> None:
    login_demo_user()
    response = client.get("/api/board")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "My Board"
    assert len(data["columns"]) == 5
    assert len(data["cards"]) >= 1


# ---------------------------------------------------------------------------
# List boards
# ---------------------------------------------------------------------------

def test_list_boards_empty_initially() -> None:
    login_as("newuser")
    # After register no board exists yet
    import app.auth as auth_module
    auth_module._sessions.clear()
    client.post("/api/login", json={"username": "newuser", "password": "testpass1"})
    response = client.get("/api/boards")
    assert response.status_code == 200
    assert response.json() == []


def test_list_boards_returns_all_boards() -> None:
    login_demo_user()
    client.post("/api/boards", json={"name": "Board A"})
    client.post("/api/boards", json={"name": "Board B"})
    boards = client.get("/api/boards").json()
    names = [b["name"] for b in boards]
    assert "Board A" in names
    assert "Board B" in names


# ---------------------------------------------------------------------------
# Create board
# ---------------------------------------------------------------------------

def test_create_board_returns_201_with_summary() -> None:
    login_demo_user()
    response = client.post("/api/boards", json={"name": "Sprint 1"})
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Sprint 1"
    assert isinstance(data["id"], int)


def test_create_board_appears_in_list() -> None:
    login_demo_user()
    client.post("/api/boards", json={"name": "My New Board"})
    boards = client.get("/api/boards").json()
    assert any(b["name"] == "My New Board" for b in boards)


def test_create_board_empty_name_returns_422() -> None:
    login_demo_user()
    response = client.post("/api/boards", json={"name": "   "})
    assert response.status_code == 422


def test_create_multiple_boards_for_same_user() -> None:
    login_demo_user()
    for i in range(3):
        resp = client.post("/api/boards", json={"name": f"Board {i}"})
        assert resp.status_code == 201
    boards = client.get("/api/boards").json()
    assert len(boards) >= 3


# ---------------------------------------------------------------------------
# Get board by ID
# ---------------------------------------------------------------------------

def test_get_board_by_id_returns_columns_and_cards() -> None:
    login_demo_user()
    created = client.post("/api/boards", json={"name": "Detail Test"}).json()
    board_id = created["id"]

    response = client.get(f"/api/boards/{board_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == board_id
    assert data["name"] == "Detail Test"
    assert len(data["columns"]) == 5  # default columns


def test_get_board_by_id_owned_by_other_user_returns_404() -> None:
    login_demo_user()
    board = client.post("/api/boards", json={"name": "Private"}).json()
    board_id = board["id"]

    # Register another user and try to access the first user's board
    client.post("/api/register", json={"username": "attacker", "password": "hackerpass"})
    response = client.get(f"/api/boards/{board_id}")
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Rename board
# ---------------------------------------------------------------------------

def test_rename_board() -> None:
    login_demo_user()
    board = client.post("/api/boards", json={"name": "Old Name"}).json()
    board_id = board["id"]

    resp = client.patch(f"/api/boards/{board_id}", json={"name": "New Name"})
    assert resp.status_code == 204

    detail = client.get(f"/api/boards/{board_id}").json()
    assert detail["name"] == "New Name"


def test_rename_board_empty_name_returns_422() -> None:
    login_demo_user()
    board = client.post("/api/boards", json={"name": "Good"}).json()
    resp = client.patch(f"/api/boards/{board['id']}", json={"name": ""})
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Delete board
# ---------------------------------------------------------------------------

def test_delete_board_removes_it() -> None:
    login_demo_user()
    board = client.post("/api/boards", json={"name": "Temporary"}).json()
    board_id = board["id"]

    resp = client.delete(f"/api/boards/{board_id}")
    assert resp.status_code == 204

    boards = client.get("/api/boards").json()
    assert all(b["id"] != board_id for b in boards)


def test_delete_board_also_removes_columns_and_cards() -> None:
    login_demo_user()
    board = client.post("/api/boards", json={"name": "ToDelete"}).json()
    board_id = board["id"]

    # Verify it loaded with default columns and seeded cards
    detail = client.get(f"/api/boards/{board_id}").json()
    col_id = detail["columns"][0]["id"]
    card = client.post("/api/cards", json={"column_id": col_id, "title": "orphan"}).json()

    client.delete(f"/api/boards/{board_id}")

    # Card and column should no longer be accessible via board list
    boards = client.get("/api/boards").json()
    assert all(b["id"] != board_id for b in boards)

    # Move on another card should 404
    move_resp = client.post(f"/api/cards/{card['id']}/move", json={"target_column_id": col_id, "position": 0})
    assert move_resp.status_code == 404


def test_delete_board_owned_by_other_returns_404() -> None:
    login_demo_user()
    board = client.post("/api/boards", json={"name": "Mine"}).json()
    board_id = board["id"]

    client.post("/api/register", json={"username": "thief", "password": "12345678"})
    resp = client.delete(f"/api/boards/{board_id}")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Isolation: users cannot see each other's boards
# ---------------------------------------------------------------------------

def test_users_cannot_see_each_other_boards() -> None:
    # User 1 (demo)
    login_demo_user()
    client.post("/api/boards", json={"name": "Secret Board"})
    u1_boards = client.get("/api/boards").json()
    u1_names = {b["name"] for b in u1_boards}

    # User 2
    client.post("/api/register", json={"username": "user2", "password": "pass12345"})
    u2_boards = client.get("/api/boards").json()

    assert all(b["name"] not in u1_names for b in u2_boards)


# ---------------------------------------------------------------------------
# Column CRUD
# ---------------------------------------------------------------------------

def test_rename_column_persists_title() -> None:
    login_demo_user()
    board = client.get("/api/board").json()
    first_column_id = board["columns"][0]["id"]

    rename_response = client.post(
        f"/api/columns/{first_column_id}/rename",
        json={"title": "Renamed"},
    )
    assert rename_response.status_code == 204

    updated_board = client.get("/api/board").json()
    updated_col = next(c for c in updated_board["columns"] if c["id"] == first_column_id)
    assert updated_col["title"] == "Renamed"


def test_add_column_to_board() -> None:
    login_demo_user()
    board = client.post("/api/boards", json={"name": "Column Test"}).json()
    board_id = board["id"]

    resp = client.post(f"/api/boards/{board_id}/columns", json={"title": "Shipped"})
    assert resp.status_code == 201
    col = resp.json()
    assert col["title"] == "Shipped"
    assert isinstance(col["id"], int)

    detail = client.get(f"/api/boards/{board_id}").json()
    assert any(c["id"] == col["id"] for c in detail["columns"])


def test_add_column_empty_title_returns_422() -> None:
    login_demo_user()
    board = client.post("/api/boards", json={"name": "X"}).json()
    resp = client.post(f"/api/boards/{board['id']}/columns", json={"title": "  "})
    assert resp.status_code == 422


def test_delete_column_removes_it_and_its_cards() -> None:
    login_demo_user()
    board = client.post("/api/boards", json={"name": "Del Col Test"}).json()
    board_id = board["id"]

    col = client.post(f"/api/boards/{board_id}/columns", json={"title": "Temp"}).json()
    col_id = col["id"]

    card = client.post("/api/cards", json={"column_id": col_id, "title": "orphan card"}).json()

    resp = client.delete(f"/api/columns/{col_id}")
    assert resp.status_code == 204

    detail = client.get(f"/api/boards/{board_id}").json()
    assert all(c["id"] != col_id for c in detail["columns"])
    assert all(c["id"] != card["id"] for c in detail["cards"])


def test_delete_column_from_other_user_returns_404() -> None:
    login_demo_user()
    board = client.post("/api/boards", json={"name": "X"}).json()
    col = client.post(f"/api/boards/{board['id']}/columns", json={"title": "Secure"}).json()

    client.post("/api/register", json={"username": "col_thief", "password": "12345678"})
    resp = client.delete(f"/api/columns/{col['id']}")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Card CRUD (existing + update)
# ---------------------------------------------------------------------------

def test_create_and_delete_card() -> None:
    login_demo_user()
    board = client.get("/api/board").json()
    first_column_id = board["columns"][0]["id"]

    create_response = client.post(
        "/api/cards",
        json={"column_id": first_column_id, "title": "Task", "details": "Notes"},
    )
    assert create_response.status_code == 201
    card = create_response.json()

    board_after_create = client.get("/api/board").json()
    assert any(c["id"] == card["id"] for c in board_after_create["cards"])

    delete_response = client.delete(f"/api/cards/{card['id']}")
    assert delete_response.status_code == 204

    board_after_delete = client.get("/api/board").json()
    assert all(c["id"] != card["id"] for c in board_after_delete["cards"])


def test_update_card_title() -> None:
    login_demo_user()
    board = client.get("/api/board").json()
    col_id = board["columns"][0]["id"]

    card = client.post("/api/cards", json={"column_id": col_id, "title": "Original"}).json()

    resp = client.patch(f"/api/cards/{card['id']}", json={"title": "Updated Title"})
    assert resp.status_code == 200
    assert resp.json()["title"] == "Updated Title"


def test_update_card_details() -> None:
    login_demo_user()
    board = client.get("/api/board").json()
    col_id = board["columns"][0]["id"]

    card = client.post("/api/cards", json={"column_id": col_id, "title": "T"}).json()

    resp = client.patch(f"/api/cards/{card['id']}", json={"details": "New details here."})
    assert resp.status_code == 200
    assert resp.json()["details"] == "New details here."


def test_update_card_title_and_details_together() -> None:
    login_demo_user()
    board = client.get("/api/board").json()
    col_id = board["columns"][0]["id"]

    card = client.post("/api/cards", json={"column_id": col_id, "title": "Old"}).json()
    resp = client.patch(
        f"/api/cards/{card['id']}",
        json={"title": "New Title", "details": "New Details"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["title"] == "New Title"
    assert data["details"] == "New Details"


def test_update_card_from_other_user_returns_404() -> None:
    login_demo_user()
    board = client.get("/api/board").json()
    col_id = board["columns"][0]["id"]
    card = client.post("/api/cards", json={"column_id": col_id, "title": "Private"}).json()

    client.post("/api/register", json={"username": "card_thief", "password": "12345678"})
    resp = client.patch(f"/api/cards/{card['id']}", json={"title": "Stolen"})
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Move card
# ---------------------------------------------------------------------------

def test_move_card_between_columns_updates_column_and_order() -> None:
    login_demo_user()
    board = client.get("/api/board").json()
    source_column_id = board["columns"][0]["id"]
    target_column_id = board["columns"][1]["id"]

    first = client.post("/api/cards", json={"column_id": source_column_id, "title": "First"}).json()
    second = client.post("/api/cards", json={"column_id": source_column_id, "title": "Second"}).json()

    move_response = client.post(
        f"/api/cards/{first['id']}/move",
        json={"target_column_id": target_column_id, "position": 0},
    )
    assert move_response.status_code == 204

    updated_board = client.get("/api/board").json()
    target_cards = [c for c in updated_board["cards"] if c["column_id"] == target_column_id]
    source_cards = [c for c in updated_board["cards"] if c["column_id"] == source_column_id]

    assert any(c["id"] == first["id"] for c in target_cards)
    assert all(c["id"] != first["id"] for c in source_cards)

    target_cards_sorted = sorted(target_cards, key=lambda c: c["position"])
    assert target_cards_sorted[0]["id"] == first["id"]
    assert any(c["id"] == second["id"] for c in source_cards)


def test_move_card_within_same_column_reorders() -> None:
    login_demo_user()
    board = client.get("/api/board").json()
    col_id = board["columns"][0]["id"]

    col_cards_before = sorted(
        [c for c in board["cards"] if c["column_id"] == col_id],
        key=lambda c: c["position"],
    )
    last_card = col_cards_before[-1]
    first_card = col_cards_before[0]

    response = client.post(
        f"/api/cards/{last_card['id']}/move",
        json={"target_column_id": col_id, "position": 0},
    )
    assert response.status_code == 204

    updated = client.get("/api/board").json()
    col_cards_after = sorted(
        [c for c in updated["cards"] if c["column_id"] == col_id],
        key=lambda c: c["position"],
    )
    ids_in_order = [c["id"] for c in col_cards_after]
    assert ids_in_order.index(last_card["id"]) < ids_in_order.index(first_card["id"])


# ---------------------------------------------------------------------------
# Card priority and due date
# ---------------------------------------------------------------------------

def test_create_card_with_priority() -> None:
    login_demo_user()
    board = client.get("/api/board").json()
    col_id = board["columns"][0]["id"]

    card = client.post(
        "/api/cards",
        json={"column_id": col_id, "title": "High priority task", "priority": "high"},
    ).json()
    assert card["priority"] == "high"


def test_create_card_with_due_date() -> None:
    login_demo_user()
    board = client.get("/api/board").json()
    col_id = board["columns"][0]["id"]

    card = client.post(
        "/api/cards",
        json={"column_id": col_id, "title": "Deadline task", "due_date": "2026-12-31"},
    ).json()
    assert card["due_date"] == "2026-12-31"


def test_create_card_invalid_priority_defaults_to_medium() -> None:
    login_demo_user()
    board = client.get("/api/board").json()
    col_id = board["columns"][0]["id"]

    card = client.post(
        "/api/cards",
        json={"column_id": col_id, "title": "Task", "priority": "extreme"},
    ).json()
    assert card["priority"] == "medium"


def test_update_card_priority() -> None:
    login_demo_user()
    board = client.get("/api/board").json()
    col_id = board["columns"][0]["id"]

    card = client.post("/api/cards", json={"column_id": col_id, "title": "T"}).json()
    updated = client.patch(f"/api/cards/{card['id']}", json={"priority": "urgent"}).json()
    assert updated["priority"] == "urgent"


def test_update_card_due_date() -> None:
    login_demo_user()
    board = client.get("/api/board").json()
    col_id = board["columns"][0]["id"]

    card = client.post("/api/cards", json={"column_id": col_id, "title": "T"}).json()
    updated = client.patch(f"/api/cards/{card['id']}", json={"due_date": "2026-06-01"}).json()
    assert updated["due_date"] == "2026-06-01"


def test_clear_card_due_date() -> None:
    login_demo_user()
    board = client.get("/api/board").json()
    col_id = board["columns"][0]["id"]

    card = client.post(
        "/api/cards",
        json={"column_id": col_id, "title": "T", "due_date": "2026-06-01"},
    ).json()
    updated = client.patch(f"/api/cards/{card['id']}", json={"due_date": ""}).json()
    assert updated["due_date"] is None


def test_board_cards_include_priority_and_due_date() -> None:
    login_demo_user()
    board_detail = client.get("/api/board").json()
    col_id = board_detail["columns"][0]["id"]

    client.post(
        "/api/cards",
        json={"column_id": col_id, "title": "Tagged", "priority": "low", "due_date": "2026-09-01"},
    )

    board_detail = client.get("/api/board").json()
    tagged = next((c for c in board_detail["cards"] if c["title"] == "Tagged"), None)
    assert tagged is not None
    assert tagged["priority"] == "low"
    assert tagged["due_date"] == "2026-09-01"


# ---------------------------------------------------------------------------
# Labels
# ---------------------------------------------------------------------------

def test_create_card_with_labels() -> None:
    login_demo_user()
    board_detail = client.get("/api/board").json()
    col_id = board_detail["columns"][0]["id"]

    r = client.post(
        "/api/cards",
        json={"column_id": col_id, "title": "Labeled card", "labels": ["Bug", "Urgent"]},
    )
    assert r.status_code == 201
    assert r.json()["labels"] == ["Bug", "Urgent"]


def test_create_card_default_labels_empty() -> None:
    login_demo_user()
    board_detail = client.get("/api/board").json()
    col_id = board_detail["columns"][0]["id"]

    r = client.post("/api/cards", json={"column_id": col_id, "title": "No labels"})
    assert r.status_code == 201
    assert r.json()["labels"] == []


def test_update_card_labels() -> None:
    login_demo_user()
    board_detail = client.get("/api/board").json()
    col_id = board_detail["columns"][0]["id"]
    card_id = client.post(
        "/api/cards", json={"column_id": col_id, "title": "To label"}
    ).json()["id"]

    r = client.patch(f"/api/cards/{card_id}", json={"labels": ["Feature", "Design"]})
    assert r.status_code == 200
    assert r.json()["labels"] == ["Feature", "Design"]


def test_update_card_labels_to_empty() -> None:
    login_demo_user()
    board_detail = client.get("/api/board").json()
    col_id = board_detail["columns"][0]["id"]
    card_id = client.post(
        "/api/cards", json={"column_id": col_id, "title": "Clear labels", "labels": ["Bug"]}
    ).json()["id"]

    r = client.patch(f"/api/cards/{card_id}", json={"labels": []})
    assert r.status_code == 200
    assert r.json()["labels"] == []


def test_board_cards_include_labels() -> None:
    login_demo_user()
    board_detail = client.get("/api/board").json()
    col_id = board_detail["columns"][0]["id"]

    client.post(
        "/api/cards",
        json={"column_id": col_id, "title": "With labels", "labels": ["Testing"]},
    )
    board_detail = client.get("/api/board").json()
    card = next((c for c in board_detail["cards"] if c["title"] == "With labels"), None)
    assert card is not None
    assert card["labels"] == ["Testing"]


# ---------------------------------------------------------------------------
# Column reordering
# ---------------------------------------------------------------------------

def test_reorder_columns_persists_new_order() -> None:
    login_demo_user()
    board_id = client.post("/api/boards", json={"name": "Reorder Test"}).json()["id"]
    cols = client.get(f"/api/boards/{board_id}").json()["columns"]
    reversed_ids = [c["id"] for c in reversed(cols)]

    r = client.post(f"/api/boards/{board_id}/reorder-columns", json={"column_ids": reversed_ids})
    assert r.status_code == 204

    new_cols = client.get(f"/api/boards/{board_id}").json()["columns"]
    assert [c["id"] for c in new_cols] == reversed_ids


def test_reorder_columns_wrong_board_returns_400() -> None:
    login_demo_user()
    board1_id = client.post("/api/boards", json={"name": "Board1"}).json()["id"]
    board2_id = client.post("/api/boards", json={"name": "Board2"}).json()["id"]
    cols1 = client.get(f"/api/boards/{board1_id}").json()["columns"]

    # Use board1's column IDs in board2's reorder request — should fail
    r = client.post(
        f"/api/boards/{board2_id}/reorder-columns",
        json={"column_ids": [c["id"] for c in cols1]},
    )
    assert r.status_code == 400


def test_reorder_columns_requires_auth() -> None:
    client.post("/api/logout")
    r = client.post("/api/boards/1/reorder-columns", json={"column_ids": [1, 2]})
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# WIP limits
# ---------------------------------------------------------------------------

def test_set_wip_limit_on_column() -> None:
    login_demo_user()
    board_detail = client.get("/api/board").json()
    col_id = board_detail["columns"][0]["id"]

    r = client.post(f"/api/columns/{col_id}/wip-limit", json={"wip_limit": 3})
    assert r.status_code == 204

    new_board = client.get("/api/board").json()
    col = next(c for c in new_board["columns"] if c["id"] == col_id)
    assert col["wip_limit"] == 3


def test_clear_wip_limit() -> None:
    login_demo_user()
    board_detail = client.get("/api/board").json()
    col_id = board_detail["columns"][0]["id"]

    client.post(f"/api/columns/{col_id}/wip-limit", json={"wip_limit": 5})
    r = client.post(f"/api/columns/{col_id}/wip-limit", json={"wip_limit": None})
    assert r.status_code == 204

    new_board = client.get("/api/board").json()
    col = next(c for c in new_board["columns"] if c["id"] == col_id)
    assert col["wip_limit"] is None


def test_wip_limit_requires_auth() -> None:
    client.post("/api/logout")
    r = client.post("/api/columns/1/wip-limit", json={"wip_limit": 3})
    assert r.status_code == 401


def test_wip_limit_cross_user_rejected() -> None:
    login_as("wip_user")
    board_detail = client.get("/api/board").json()
    col_id = board_detail["columns"][0]["id"]

    login_as("wip_other_user")
    r = client.post(f"/api/columns/{col_id}/wip-limit", json={"wip_limit": 3})
    assert r.status_code == 404
