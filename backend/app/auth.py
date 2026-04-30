from __future__ import annotations

import os
import secrets
import time
from collections import defaultdict
from typing import Dict, List

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel

from app.db import db_connection, get_or_create_demo_user_id


SESSION_COOKIE_NAME = "pm_session"

_DEMO_USERNAME = "user"
_DEMO_PASSWORD = "password"

# Bcrypt hash of the demo password, computed once at import time.
_DEMO_PASSWORD_HASH: bytes = bcrypt.hashpw(_DEMO_PASSWORD.encode(), bcrypt.gensalt())

# In-memory session store: token → user_id
_sessions: Dict[str, int] = {}

# Per-IP failed login tracking for rate limiting
_failed_attempts: Dict[str, List[float]] = defaultdict(list)
_RATE_LIMIT_WINDOW = 60   # seconds
_RATE_LIMIT_MAX = 5       # max failures before lockout


class LoginRequest(BaseModel):
    username: str
    password: str


class MessageResponse(BaseModel):
    message: str


router = APIRouter()


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _is_rate_limited(ip: str) -> bool:
    now = time.monotonic()
    _failed_attempts[ip] = [t for t in _failed_attempts[ip] if now - t < _RATE_LIMIT_WINDOW]
    return len(_failed_attempts[ip]) >= _RATE_LIMIT_MAX


def _record_failure(ip: str) -> None:
    _failed_attempts[ip].append(time.monotonic())


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

    username_ok = secrets.compare_digest(payload.username, _DEMO_USERNAME)
    password_ok = username_ok and bcrypt.checkpw(payload.password.encode(), _DEMO_PASSWORD_HASH)

    if not (username_ok and password_ok):
        _record_failure(ip)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    with db_connection() as connection:
        user_id = get_or_create_demo_user_id(connection)

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

    return MessageResponse(message="Logged in")


@router.post("/api/logout", response_model=MessageResponse)
def logout(request: Request, response: Response) -> MessageResponse:
    session_id = request.cookies.get(SESSION_COOKIE_NAME)
    if session_id and session_id in _sessions:
        del _sessions[session_id]

    response.delete_cookie(SESSION_COOKIE_NAME, path="/")
    return MessageResponse(message="Logged out")
