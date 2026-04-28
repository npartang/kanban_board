from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.auth import router as auth_router
from app.board_api import router as board_router
from app.ai import router as ai_router
from app.ai_kanban import router as ai_kanban_router


app = FastAPI(title="Project Management MVP Backend")


@app.get("/health")
async def health() -> dict[str, str]:
  return {"status": "ok"}


@app.get("/api/hello")
async def hello() -> dict[str, str]:
  return {"message": "hello world"}


BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"

app.include_router(auth_router)
app.include_router(board_router)
app.include_router(ai_router)
app.include_router(ai_kanban_router)

app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="frontend")

