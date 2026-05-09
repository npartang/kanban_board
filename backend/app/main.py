from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.auth import router as auth_router
from app.board_api import router as board_router
from app.ai import router as ai_router
from app.ai_kanban import router as ai_kanban_router
from app.db import db_connection, ensure_demo_user, ensure_schema


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None, None]:
    ensure_schema()
    with db_connection() as connection:
        ensure_demo_user(connection)
    yield


app = FastAPI(title="Project Management Backend", lifespan=lifespan)


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
