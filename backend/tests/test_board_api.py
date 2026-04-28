from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def login_demo_user() -> None:
  response = client.post(
    "/api/login",
    json={"username": "user", "password": "password"},
  )
  assert response.status_code == 200


def test_unauthenticated_access_is_rejected() -> None:
  response = client.get("/api/board")
  assert response.status_code == 401


def test_get_board_creates_default_board_for_user() -> None:
  login_demo_user()
  response = client.get("/api/board")
  assert response.status_code == 200
  data = response.json()

  assert data["name"] == "My board"
  # There should be five default columns and a seeded set of demo cards.
  assert len(data["columns"]) == 5
  assert len(data["cards"]) >= 1


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
  updated_first_column = next(
    col for col in updated_board["columns"] if col["id"] == first_column_id
  )
  assert updated_first_column["title"] == "Renamed"


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

  # Card should appear when re-fetching the board
  board_after_create = client.get("/api/board").json()
  assert any(c["id"] == card["id"] for c in board_after_create["cards"])

  delete_response = client.delete(f"/api/cards/{card['id']}")
  assert delete_response.status_code == 204

  board_after_delete = client.get("/api/board").json()
  assert all(c["id"] != card["id"] for c in board_after_delete["cards"])


def test_move_card_between_columns_updates_column_and_order() -> None:
  login_demo_user()
  board = client.get("/api/board").json()
  source_column_id = board["columns"][0]["id"]
  target_column_id = board["columns"][1]["id"]

  # Create two cards in the source column
  first = client.post(
    "/api/cards",
    json={"column_id": source_column_id, "title": "First", "details": ""},
  ).json()
  second = client.post(
    "/api/cards",
    json={"column_id": source_column_id, "title": "Second", "details": ""},
  ).json()

  # Move the first card to the target column at position 0
  move_response = client.post(
    f"/api/cards/{first['id']}/move",
    json={"target_column_id": target_column_id, "position": 0},
  )
  assert move_response.status_code == 204

  updated_board = client.get("/api/board").json()

  # Verify card column assignments
  target_cards = [
    c for c in updated_board["cards"] if c["column_id"] == target_column_id
  ]
  source_cards = [
    c for c in updated_board["cards"] if c["column_id"] == source_column_id
  ]

  assert any(c["id"] == first["id"] for c in target_cards)
  assert all(c["id"] != first["id"] for c in source_cards)

  # Verify ordering within target column (moved card should be first)
  target_cards_sorted = sorted(target_cards, key=lambda c: c["position"])
  assert target_cards_sorted[0]["id"] == first["id"]

