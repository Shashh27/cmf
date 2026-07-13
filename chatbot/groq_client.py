"""Groq API client — primary AI for question understanding, SQL, and follow-ups."""

from __future__ import annotations

import json
import os
import re
from typing import Any, Dict, List, Optional

import requests

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"


def is_groq_enabled() -> bool:
    return bool(os.getenv("GROQ_API_KEY", "").strip())


def _groq_model() -> str:
    return os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")


def _timeout() -> int:
    return int(os.getenv("GROQ_TIMEOUT_SEC", os.getenv("CLASSIFIER_TIMEOUT_SEC", "8")))


def groq_chat(
    messages: List[Dict[str, str]],
    *,
    max_tokens: int = 512,
    temperature: float = 0,
) -> Optional[str]:
    api_key = os.getenv("GROQ_API_KEY", "").strip()
    if not api_key:
        return None
    try:
        resp = requests.post(
            GROQ_URL,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": _groq_model(),
                "temperature": temperature,
                "max_tokens": max_tokens,
                "messages": messages,
            },
            timeout=_timeout(),
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"].strip()
    except Exception:
        return None


def parse_json_object(raw: str) -> Optional[dict]:
    if not raw:
        return None
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end <= start:
        return None
    try:
        return json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return None


FOLLOW_UP_PROMPT = """You suggest 3 short follow-up questions for a CMF manufacturing chatbot.
Return ONLY a JSON array of 3 strings, no markdown.
Questions must relate to the user's last question and the data returned.
Use CMF terms: orders, parts, stock, machines, tools, operations, notifications.
Do NOT repeat the user's exact question.

User asked: {question}
Result columns: {columns}
Sample values: {samples}

JSON array:"""


def groq_follow_ups(
    question: str,
    data: List[Dict],
    limit: int = 3,
) -> List[str]:
    if not is_groq_enabled() or not data:
        return []
    cols = list(data[0].keys())[:8] if data else []
    samples = []
    for row in data[:2]:
        samples.append({k: row.get(k) for k in cols[:4]})
    raw = groq_chat(
        [{"role": "user", "content": FOLLOW_UP_PROMPT.format(
            question=question,
            columns=", ".join(cols),
            samples=json.dumps(samples, default=str)[:400],
        )}],
        max_tokens=120,
    )
    if not raw:
        return []
    text = raw.strip()
    start = text.find("[")
    end = text.rfind("]")
    if start < 0 or end <= start:
        return []
    try:
        items = json.loads(text[start : end + 1])
        out = []
        for item in items:
            s = str(item).strip()
            if s and s.lower() != (question or "").lower():
                out.append(s)
            if len(out) >= limit:
                break
        return out
    except (json.JSONDecodeError, TypeError):
        return []
