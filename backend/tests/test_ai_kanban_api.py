import json
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def login_demo_user() -> None:
  response = client.post(
    "/api/login",
    json={"username": "user", "password": "password"},
  )
  assert response.status_code == 200


def build_ai_response(payload: dict[str, Any]) -> str:
  return json.dumps(payload)


def _get_board() -> dict[str, Any]:
  return client.get("/api/board").json()


def test_ai_kanban_unauthenticated_returns_401() -> None:
  response = client.post("/api/ai-kanban", json={"message": "Hello"})
  assert response.status_code == 401


def test_ai_kanban_applies_rename_column_and_create_card(monkeypatch: pytest.MonkeyPatch) -> None:
  login_demo_user()

  import app.ai_kanban as ai_kanban_module

  async def fake_call(prompt: str) -> str:
    return build_ai_response(
      {
        "reply": "Here is an updated plan.",
        "operations": [
          {"type": "renameColumn", "columnId": 1, "title": "Backlog (AI)"},
          {"type": "createCard", "columnId": 1, "title": "AI-created card", "details": "Added by the assistant."},
        ],
      }
    )

  monkeypatch.setattr(ai_kanban_module, "call_openrouter", fake_call)

  response = client.post("/api/ai-kanban", json={"message": "Help me plan."})
  assert response.status_code == 200
  data = response.json()
  assert data["reply"] == "Here is an updated plan."

  board = _get_board()
  first_col = next(c for c in board["columns"] if c["id"] == 1)
  assert first_col["title"] == "Backlog (AI)"
  assert any(c["title"] == "AI-created card" for c in board["cards"] if c["column_id"] == 1)


def test_ai_kanban_applies_update_card(monkeypatch: pytest.MonkeyPatch) -> None:
  login_demo_user()
  board = _get_board()
  card_id = board["cards"][0]["id"]

  import app.ai_kanban as ai_kanban_module

  async def fake_call(prompt: str) -> str:
    return build_ai_response(
      {
        "reply": "Updated.",
        "operations": [
          {"type": "updateCard", "cardId": card_id, "title": "Retitled card", "details": "New details."},
        ],
      }
    )

  monkeypatch.setattr(ai_kanban_module, "call_openrouter", fake_call)

  response = client.post("/api/ai-kanban", json={"message": "Rename that card."})
  assert response.status_code == 200

  board_after = _get_board()
  updated = next(c for c in board_after["cards"] if c["id"] == card_id)
  assert updated["title"] == "Retitled card"
  assert updated["details"] == "New details."


def test_ai_kanban_applies_move_card(monkeypatch: pytest.MonkeyPatch) -> None:
  login_demo_user()
  board = _get_board()
  source_card_id = board["cards"][0]["id"]
  target_col_id = board["columns"][1]["id"]

  import app.ai_kanban as ai_kanban_module

  async def fake_call(prompt: str) -> str:
    return build_ai_response(
      {
        "reply": "Moved.",
        "operations": [
          {"type": "moveCard", "cardId": source_card_id, "targetColumnId": target_col_id},
        ],
      }
    )

  monkeypatch.setattr(ai_kanban_module, "call_openrouter", fake_call)

  response = client.post("/api/ai-kanban", json={"message": "Move that card."})
  assert response.status_code == 200

  board_after = _get_board()
  moved = next(c for c in board_after["cards"] if c["id"] == source_card_id)
  assert moved["column_id"] == target_col_id


def test_ai_kanban_applies_delete_card(monkeypatch: pytest.MonkeyPatch) -> None:
  login_demo_user()
  board = _get_board()
  card_id = board["cards"][0]["id"]

  import app.ai_kanban as ai_kanban_module

  async def fake_call(prompt: str) -> str:
    return build_ai_response(
      {
        "reply": "Deleted.",
        "operations": [
          {"type": "deleteCard", "cardId": card_id},
        ],
      }
    )

  monkeypatch.setattr(ai_kanban_module, "call_openrouter", fake_call)

  response = client.post("/api/ai-kanban", json={"message": "Remove it."})
  assert response.status_code == 200

  board_after = _get_board()
  assert all(c["id"] != card_id for c in board_after["cards"])


def test_ai_kanban_handles_invalid_json_from_ai(monkeypatch: pytest.MonkeyPatch) -> None:
  login_demo_user()

  import app.ai_kanban as ai_kanban_module

  async def bad_call(prompt: str) -> str:
    return "not-json"

  monkeypatch.setattr(ai_kanban_module, "call_openrouter", bad_call)

  response = client.post("/api/ai-kanban", json={"message": "Test bad JSON."})
  assert response.status_code == 502
  assert "AI did not return valid JSON" in response.text


def test_ai_kanban_ignores_invalid_operation_ids(monkeypatch: pytest.MonkeyPatch) -> None:
  login_demo_user()

  import app.ai_kanban as ai_kanban_module

  async def fake_call(prompt: str) -> str:
    return build_ai_response(
      {
        "reply": "Tried.",
        "operations": [
          {"type": "deleteCard", "cardId": 99999},
        ],
      }
    )

  monkeypatch.setattr(ai_kanban_module, "call_openrouter", fake_call)

  response = client.post("/api/ai-kanban", json={"message": "Delete a ghost card."})
  # Should succeed (200) despite the invalid card id being silently ignored.
  assert response.status_code == 200
