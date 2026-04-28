from __future__ import annotations

import os
from typing import Any, Dict

import httpx
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel


router = APIRouter()


OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_MODEL = "openai/gpt-oss-120b"


class AIResponse(BaseModel):
  message: str


async def call_openrouter(prompt: str) -> str:
  api_key = os.getenv("OPENROUTER_API_KEY")
  if not api_key:
    raise HTTPException(
      status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
      detail="OPENROUTER_API_KEY is not configured",
    )

  headers = {
    "Authorization": f"Bearer {api_key}",
    "Content-Type": "application/json",
  }
  body: Dict[str, Any] = {
    "model": OPENROUTER_MODEL,
    "messages": [
      {
        "role": "user",
        "content": prompt,
      }
    ],
  }

  async with httpx.AsyncClient(timeout=20) as client:
    response = await client.post(OPENROUTER_API_URL, headers=headers, json=body)

  if response.status_code >= 400:
    raise HTTPException(
      status_code=status.HTTP_502_BAD_GATEWAY,
      detail="AI provider request failed",
    )

  data = response.json()
  try:
    content = data["choices"][0]["message"]["content"]
  except (KeyError, IndexError, TypeError):
    raise HTTPException(
      status_code=status.HTTP_502_BAD_GATEWAY,
      detail="Unexpected AI response format",
    )

  if not isinstance(content, str) or not content.strip():
    raise HTTPException(
      status_code=status.HTTP_502_BAD_GATEWAY,
      detail="Empty AI response",
    )

  return content.strip()


@router.get("/api/ai-test", response_model=AIResponse)
async def ai_test() -> AIResponse:
  """Simple connectivity test against OpenRouter.

  Sends a \"2+2\" style question and returns the model's answer.
  """

  message = await call_openrouter("What is 2+2? Answer using only the number.")
  return AIResponse(message=message)

