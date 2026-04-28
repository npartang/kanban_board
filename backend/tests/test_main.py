from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_health_endpoint() -> None:
  response = client.get("/health")
  assert response.status_code == 200
  assert response.json() == {"status": "ok"}


def test_hello_endpoint() -> None:
  response = client.get("/api/hello")
  assert response.status_code == 200
  assert response.json() == {"message": "hello world"}


def test_root_returns_html() -> None:
  response = client.get("/")
  assert response.status_code == 200
  # Basic sanity checks that we received HTML content
  assert "text/html" in response.headers.get("content-type", "")
  assert "<!doctype html>" in response.text.lower()

