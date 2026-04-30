import os
from typing import Any, Dict

import pytest
from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


class FakeResponse:
  def __init__(self, status_code: int, payload: Dict[str, Any]):
    self.status_code = status_code
    self._payload = payload

  def json(self) -> Dict[str, Any]:
    return self._payload


def login_demo_user() -> None:
  response = client.post("/api/login", json={"username": "user", "password": "password"})
  assert response.status_code == 200


@pytest.mark.anyio
async def test_ai_test_returns_message_when_provider_succeeds(monkeypatch: pytest.MonkeyPatch) -> None:
  login_demo_user()
  monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")

  import app.ai as ai_module

  class DummyClient:
    def __init__(self, *args: Any, **kwargs: Any) -> None:
      pass
    async def __aenter__(self) -> "DummyClient":
      return self
    async def __aexit__(self, *args: Any, **kwargs: Any) -> None:
      return None
    async def post(self, *args: Any, **kwargs: Any) -> FakeResponse:
      return FakeResponse(200, {"choices": [{"message": {"content": "4"}}]})

  monkeypatch.setattr(ai_module, "httpx", type("H", (), {"AsyncClient": DummyClient}))

  response = client.get("/api/ai-test")
  assert response.status_code == 200
  assert response.json()["message"] == "4"


def test_ai_test_returns_401_when_not_logged_in() -> None:
  response = client.get("/api/ai-test")
  assert response.status_code == 401


def test_ai_test_fails_when_api_key_missing(monkeypatch: pytest.MonkeyPatch) -> None:
  login_demo_user()
  monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)

  response = client.get("/api/ai-test")
  assert response.status_code == 500
  assert "OPENROUTER_API_KEY is not configured" in response.text
