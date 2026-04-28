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


def test_ai_kanban_applies_operations_and_returns_reply(monkeypatch: pytest.MonkeyPatch) -> None:
  login_demo_user()

  # Patch call_openrouter so we don't hit the real API.
  import app.ai_kanban as ai_kanban_module

  async def fake_call_openrouter(prompt: str) -> str:
    # We don't inspect the prompt here; we just return a fixed JSON payload.
    return build_ai_response(
      {
        "reply": "Here is an updated plan.",
        "operations": [
          {
            "type": "renameColumn",
            "columnId": 1,
            "title": "Backlog (AI)",
          },
          {
            "type": "createCard",
            "columnId": 1,
            "title": "AI-created card",
            "details": "Added by the assistant.",
          },
        ],
      }
    )

  monkeypatch.setattr(ai_kanban_module, "call_openrouter", fake_call_openrouter)

  response = client.post(
    "/api/ai-kanban",
    json={"message": "Help me plan my next steps."},
  )
  assert response.status_code == 200
  data = response.json()

  assert data["reply"] == "Here is an updated plan."
  assert isinstance(data["operations"], list)
  assert len(data["operations"]) == 2

  # Verify that operations were applied to the board.
  board = client.get("/api/board").json()

  first_column = next(col for col in board["columns"] if col["id"] == 1)
  assert first_column["title"] == "Backlog (AI)"

  cards_in_first_column = [
    card for card in board["cards"] if card["column_id"] == 1
  ]
  assert any(card["title"] == "AI-created card" for card in cards_in_first_column)


def test_ai_kanban_handles_invalid_json_from_ai(monkeypatch: pytest.MonkeyPatch) -> None:
  login_demo_user()

  import app.ai_kanban as ai_kanban_module

  async def bad_call_openrouter(prompt: str) -> str:
    return "not-json"

  monkeypatch.setattr(ai_kanban_module, "call_openrouter", bad_call_openrouter)

  response = client.post(
    "/api/ai-kanban",
    json={"message": "Test bad JSON."},
  )
  assert response.status_code == 502
  assert "AI did not return valid JSON" in response.text

