from __future__ import annotations

import os
import re
import secrets
import time
from collections import defaultdict
from typing import Dict, List

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel

from app.db import create_user, db_connection, get_user_by_id, get_user_by_username


SESSION_COOKIE_NAME = "pm_session"

_RATE_LIMIT_WINDOW = 60
_RATE_LIMIT_MAX = 5

# In-memory session store: token → user_id
_sessions: Dict[str, int] = {}

# Per-IP failed login tracking
_failed_attempts: Dict[str, List[float]] = defaultdict(list)

_USERNAME_RE = re.compile(r"^[a-zA-Z0-9_-]{3,32}$")


class LoginRequest(BaseModel):
    username: str
    password: str


class RegisterRequest(BaseModel):
    username: str
    password: str


class MessageResponse(BaseModel):
    message: str


class UserResponse(BaseModel):
    id: int
    username: str


router = APIRouter()


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _is_rate_limited(ip: str) -> bool:
    now = time.monotonic()
    _failed_attempts[ip] = [t for t in _failed_attempts[ip] if now - t < _RATE_LIMIT_WINDOW]
    return len(_failed_attempts[ip]) >= _RATE_LIMIT_MAX


def _record_failure(ip: str) -> None:
    _failed_attempts[ip].append(time.monotonic())


def _set_session_cookie(response: Response, user_id: int) -> str:
    session_id = secrets.token_urlsafe(32)
    _sessions[session_id] = user_id
    _cookie_secure = os.getenv("COOKIE_SECURE", "false").lower() == "true"
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=session_id,
        httponly=True,
        samesite="lax",
        secure=_cookie_secure,
        path="/",
    )
    return session_id


def get_current_user_id(request: Request) -> int:
    session_id = request.cookies.get(SESSION_COOKIE_NAME)
    if not session_id or session_id not in _sessions:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )
    return _sessions[session_id]


@router.post("/api/login", response_model=MessageResponse)
def login(payload: LoginRequest, request: Request, response: Response) -> MessageResponse:
    ip = _client_ip(request)

    if _is_rate_limited(ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed login attempts. Try again later.",
        )

    with db_connection() as connection:
        user_row = get_user_by_username(connection, payload.username)

    if user_row is None:
        _record_failure(ip)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    stored_hash = user_row["password_hash"]
    try:
        password_ok = bcrypt.checkpw(payload.password.encode(), stored_hash.encode())
    except Exception:
        password_ok = False

    if not password_ok:
        _record_failure(ip)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    _set_session_cookie(response, int(user_row["id"]))
    return MessageResponse(message="Logged in")


@router.post("/api/register", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, request: Request, response: Response) -> MessageResponse:
    ip = _client_ip(request)

    if _is_rate_limited(ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Try again later.",
        )

    if not _USERNAME_RE.match(payload.username):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Username must be 3–32 characters: letters, digits, _ or -",
        )

    if len(payload.password) < 8:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Password must be at least 8 characters",
        )

    with db_connection() as connection:
        if get_user_by_username(connection, payload.username) is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Username already taken",
            )
        password_hash = bcrypt.hashpw(payload.password.encode(), bcrypt.gensalt()).decode()
        user_id = create_user(connection, payload.username, password_hash)

    _set_session_cookie(response, user_id)
    return MessageResponse(message="Registered")


@router.post("/api/logout", response_model=MessageResponse)
def logout(request: Request, response: Response) -> MessageResponse:
    session_id = request.cookies.get(SESSION_COOKIE_NAME)
    if session_id and session_id in _sessions:
        del _sessions[session_id]
    response.delete_cookie(SESSION_COOKIE_NAME, path="/")
    return MessageResponse(message="Logged out")


@router.get("/api/me", response_model=UserResponse)
def me(user_id: int = Depends(get_current_user_id)) -> UserResponse:
    with db_connection() as connection:
        user_row = get_user_by_id(connection, user_id)
    if user_row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return UserResponse(id=int(user_row["id"]), username=user_row["username"])
