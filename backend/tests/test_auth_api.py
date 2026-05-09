from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------

def test_login_success_sets_cookie() -> None:
    response = client.post("/api/login", json={"username": "user", "password": "password"})
    assert response.status_code == 200
    assert response.json() == {"message": "Logged in"}
    assert "pm_session" in response.cookies


def test_login_wrong_password_returns_401() -> None:
    response = client.post("/api/login", json={"username": "user", "password": "wrong"})
    assert response.status_code == 401


def test_login_unknown_user_returns_401() -> None:
    response = client.post("/api/login", json={"username": "nobody", "password": "password"})
    assert response.status_code == 401


def test_login_failure_does_not_set_cookie() -> None:
    response = client.post("/api/login", json={"username": "user", "password": "bad"})
    assert "pm_session" not in response.cookies


# ---------------------------------------------------------------------------
# Logout
# ---------------------------------------------------------------------------

def test_logout_clears_cookie_and_invalidates_session() -> None:
    client.post("/api/login", json={"username": "user", "password": "password"})

    logout_response = client.post("/api/logout")
    assert logout_response.status_code == 200
    assert logout_response.json() == {"message": "Logged out"}

    board_response = client.get("/api/board")
    assert board_response.status_code == 401


# ---------------------------------------------------------------------------
# Register
# ---------------------------------------------------------------------------

def test_register_new_user_returns_201() -> None:
    response = client.post(
        "/api/register",
        json={"username": "alice", "password": "secure123"},
    )
    assert response.status_code == 201
    assert response.json() == {"message": "Registered"}
    assert "pm_session" in response.cookies


def test_register_sets_session_so_user_is_logged_in() -> None:
    client.post("/api/register", json={"username": "bob", "password": "secure123"})
    me_response = client.get("/api/me")
    assert me_response.status_code == 200
    assert me_response.json()["username"] == "bob"


def test_register_duplicate_username_returns_409() -> None:
    client.post("/api/register", json={"username": "charlie", "password": "secure123"})
    response = client.post("/api/register", json={"username": "charlie", "password": "other123"})
    assert response.status_code == 409


def test_register_short_username_returns_422() -> None:
    response = client.post("/api/register", json={"username": "ab", "password": "secure123"})
    assert response.status_code == 422


def test_register_invalid_username_characters_returns_422() -> None:
    response = client.post(
        "/api/register", json={"username": "bad user!", "password": "secure123"}
    )
    assert response.status_code == 422


def test_register_short_password_returns_422() -> None:
    response = client.post("/api/register", json={"username": "dave", "password": "short"})
    assert response.status_code == 422


def test_register_cannot_reuse_demo_username() -> None:
    response = client.post("/api/register", json={"username": "user", "password": "newpass123"})
    assert response.status_code == 409


def test_registered_user_can_login_with_correct_password() -> None:
    client.post("/api/register", json={"username": "eve", "password": "mypassword1"})
    import app.auth as auth_module
    auth_module._sessions.clear()

    response = client.post("/api/login", json={"username": "eve", "password": "mypassword1"})
    assert response.status_code == 200


def test_registered_user_wrong_password_returns_401() -> None:
    client.post("/api/register", json={"username": "frank", "password": "mypassword1"})
    import app.auth as auth_module
    auth_module._sessions.clear()

    response = client.post("/api/login", json={"username": "frank", "password": "wrongpass"})
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# /api/me
# ---------------------------------------------------------------------------

def test_me_requires_auth() -> None:
    response = client.get("/api/me")
    assert response.status_code == 401


def test_me_returns_current_user() -> None:
    client.post("/api/login", json={"username": "user", "password": "password"})
    response = client.get("/api/me")
    assert response.status_code == 200
    data = response.json()
    assert data["username"] == "user"
    assert isinstance(data["id"], int)


def test_me_after_register_returns_registered_user() -> None:
    client.post("/api/register", json={"username": "grace", "password": "secure123"})
    response = client.get("/api/me")
    assert response.status_code == 200
    assert response.json()["username"] == "grace"


def test_me_after_logout_returns_401() -> None:
    client.post("/api/login", json={"username": "user", "password": "password"})
    client.post("/api/logout")
    response = client.get("/api/me")
    assert response.status_code == 401
