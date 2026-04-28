from __future__ import annotations

import secrets
from typing import Dict

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel

from app.db import db_connection, get_or_create_demo_user_id


SESSION_COOKIE_NAME = "pm_session"


class LoginRequest(BaseModel):
  username: str
  password: str


class MessageResponse(BaseModel):
  message: str


_sessions: Dict[str, int] = {}


router = APIRouter()


def get_current_user_id(request: Request) -> int:
  session_id = request.cookies.get(SESSION_COOKIE_NAME)
  if not session_id or session_id not in _sessions:
    raise HTTPException(
      status_code=status.HTTP_401_UNAUTHORIZED,
      detail="Not authenticated",
    )
  return _sessions[session_id]


@router.post("/api/login", response_model=MessageResponse)
def login(payload: LoginRequest, response: Response) -> MessageResponse:
  if payload.username != "user" or payload.password != "password":
    raise HTTPException(
      status_code=status.HTTP_401_UNAUTHORIZED,
      detail="Invalid credentials",
    )

  with db_connection() as connection:
    user_id = get_or_create_demo_user_id(connection)

  session_id = secrets.token_urlsafe(32)
  _sessions[session_id] = user_id

  response.set_cookie(
    key=SESSION_COOKIE_NAME,
    value=session_id,
    httponly=True,
    samesite="lax",
    secure=False,  # fine for local development
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

