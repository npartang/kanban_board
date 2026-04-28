from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_login_success_sets_cookie() -> None:
  response = client.post(
    "/api/login",
    json={"username": "user", "password": "password"},
  )
  assert response.status_code == 200
  assert response.json() == {"message": "Logged in"}
  # Cookie should be present
  cookies = response.cookies
  assert "pm_session" in cookies


def test_login_failure_returns_401() -> None:
  response = client.post(
    "/api/login",
    json={"username": "wrong", "password": "credentials"},
  )
  assert response.status_code == 401


def test_logout_clears_cookie_and_invalidates_session() -> None:
  # Log in first
  login_response = client.post(
    "/api/login",
    json={"username": "user", "password": "password"},
  )
  assert login_response.status_code == 200

  # Then log out
  logout_response = client.post("/api/logout")
  assert logout_response.status_code == 200
  assert logout_response.json() == {"message": "Logged out"}

  # After logout, accessing a protected endpoint should fail
  board_response = client.get("/api/board")
  assert board_response.status_code == 401

