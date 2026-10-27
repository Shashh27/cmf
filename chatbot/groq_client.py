"""Groq API client — primary AI for question understanding, SQL, and follow-ups."""

from __future__ import annotations

import json
import logging
import os
import re
import time
from typing import Any, Dict, List, Optional, Set

import requests

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
log = logging.getLogger(__name__)

# gpt-oss sometimes invents these instead of finish_answer
_FINISH_TOOL_ALIASES = {
    "commentary",
    "respond",
    "response",
    "final_answer",
    "answer",
    "message",
    "reply",
    "speak",
    "final",
}


def is_groq_enabled() -> bool:
    return bool(os.getenv("GROQ_API_KEY", "").strip())


def _groq_model() -> str:
    return os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")


def _timeout() -> int:
    return int(os.getenv("GROQ_TIMEOUT_SEC", os.getenv("CLASSIFIER_TIMEOUT_SEC", "30")))


def _rate_limit_wait(resp: requests.Response, attempt: int, cap: float = 4.0) -> float:
    wait = min(2 ** attempt, cap)
    try:
        detail = resp.json().get("error", {}).get("message", "")
        m = re.search(r"try again in ([\d.]+)s", detail, re.I)
        if m:
            wait = min(float(m.group(1)) + 0.25, cap)
    except Exception:
        pass
    return wait


def _allowed_tool_names(tools: List[Dict[str, Any]]) -> Set[str]:
    names: Set[str] = set()
    for t in tools or []:
        fn = (t.get("function") or {}) if isinstance(t, dict) else {}
        n = fn.get("name")
        if n:
            names.add(n)
    return names


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
        # Truncated object — common when failed_generation cuts mid-string
        try:
            fragment = text[start:]
            m = re.search(r'"answer"\s*:\s*"(.*)', fragment, re.S)
            if m:
                ans = m.group(1)
                for stop in ('"\n', '",', '"}'):
                    idx = ans.find(stop)
                    if idx > 0:
                        ans = ans[:idx]
                        break
                ans = ans.replace("\\n", "\n").replace('\\"', '"').replace("\\t", "\t")
                name_m = re.search(r'"name"\s*:\s*"([^"]+)"', fragment)
                return {
                    "name": (name_m.group(1) if name_m else "finish_answer"),
                    "arguments": {"answer": ans},
                }
        except Exception:
            pass
        return None


def _parse_failed_generation(raw: str) -> Optional[Dict[str, Any]]:
    """Parse Groq failed_generation payload into {name, arguments}."""
    if not raw:
        return None
    text = raw.strip()
    obj = parse_json_object(text)
    if not obj and "\\" in text:
        try:
            obj = json.loads(text)
        except Exception:
            obj = parse_json_object(text.replace("\\n", "\n"))
    if not isinstance(obj, dict):
        return None
    name = str(obj.get("name") or "").strip()
    args = obj.get("arguments")
    if isinstance(args, str):
        try:
            args = json.loads(args)
        except Exception:
            m = re.search(r'"answer"\s*:\s*"(.*)', args, re.S)
            if m:
                ans = m.group(1)
                for stop in ('"\n', '",', '"}'):
                    idx = ans.find(stop)
                    if idx > 0:
                        ans = ans[:idx]
                        break
                ans = ans.replace("\\n", "\n").replace('\\"', '"')
                args = {"answer": ans}
            else:
                args = {"answer": args}
    if not isinstance(args, dict):
        args = {}
    if not name:
        return None
    return {"name": name, "arguments": args}


def recover_tool_use_failed(
    resp_text: str,
    allowed_tools: Set[str],
) -> Optional[Dict[str, Any]]:
    """
    When Groq returns tool_use_failed (e.g. invented tool 'commentary'),
    rebuild a valid assistant message using finish_answer or a real tool.
    """
    try:
        payload = json.loads(resp_text)
    except Exception:
        return None
    err = payload.get("error") or {}
    failed = err.get("failed_generation") or ""
    parsed = _parse_failed_generation(failed)
    if not parsed:
        return None

    name = parsed["name"]
    args = parsed["arguments"]

    if name in _FINISH_TOOL_ALIASES or name == "finish_answer":
        answer = (
            args.get("answer")
            or args.get("content")
            or args.get("text")
            or args.get("message")
            or ""
        )
        answer = str(answer).strip()
        if not answer:
            return None
        finish_args = {
            "answer": answer,
            "sql_used": str(args.get("sql_used") or "").strip(),
        }
        log.info("Recovered invalid tool '%s' -> finish_answer", name)
        return {
            "role": "assistant",
            "content": "",
            "tool_calls": [
                {
                    "id": "recovered_finish",
                    "type": "function",
                    "function": {
                        "name": "finish_answer",
                        "arguments": json.dumps(finish_args),
                    },
                }
            ],
        }

    if name in allowed_tools:
        log.info("Recovered malformed tool call for '%s'", name)
        return {
            "role": "assistant",
            "content": "",
            "tool_calls": [
                {
                    "id": f"recovered_{name}",
                    "type": "function",
                    "function": {
                        "name": name,
                        "arguments": json.dumps(args),
                    },
                }
            ],
        }

    for key in ("answer", "content", "text", "message"):
        if args.get(key):
            log.info("Recovered unknown tool '%s' as plain content", name)
            return {"role": "assistant", "content": str(args[key]).strip()}
    return None


def _parse_tool_args_loose(raw: Any) -> Dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except Exception:
        parsed = _parse_failed_generation(str(raw))
        return (parsed or {}).get("arguments") or {}


def groq_chat(
    messages: List[Dict[str, str]],
    *,
    max_tokens: int = 512,
    temperature: float = 0,
) -> Optional[str]:
    api_key = os.getenv("GROQ_API_KEY", "").strip()
    if not api_key:
        return None
    payload = {
        "model": _groq_model(),
        "temperature": temperature,
        "max_tokens": max_tokens,
        "messages": messages,
    }
    for attempt in range(2):
        try:
            resp = requests.post(
                GROQ_URL,
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json=payload,
                timeout=_timeout(),
            )
            if resp.status_code == 429:
                # Fail fast — do not burn 4–8s sleeping; SQL fallback handles module lists
                log.warning("groq_chat rate limit; skipping retries")
                return None
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"].strip()
        except Exception as e:
            log.warning("groq_chat failed: %s", e)
            return None
    return None


def groq_chat_with_tools(
    messages: List[Dict[str, Any]],
    tools: List[Dict[str, Any]],
    *,
    max_tokens: int = 1200,
    temperature: float = 0,
    tool_choice: str = "auto",
) -> Optional[Dict[str, Any]]:
    """
    Groq OpenAI-compatible tool calling.
    Returns the assistant message dict: {role, content, tool_calls?}.
    """
    api_key = os.getenv("GROQ_API_KEY", "").strip()
    if not api_key:
        return None

    allowed = _allowed_tool_names(tools)
    clean_messages = []
    for m in messages:
        cm = {"role": m["role"]}
        if m.get("content") is not None:
            cm["content"] = m["content"]
        if m.get("tool_calls"):
            cm["tool_calls"] = m["tool_calls"]
        if m.get("tool_call_id"):
            cm["tool_call_id"] = m["tool_call_id"]
        if m.get("name"):
            cm["name"] = m["name"]
        clean_messages.append(cm)

    payload: Dict[str, Any] = {
        "model": _groq_model(),
        "temperature": temperature,
        "max_tokens": max_tokens,
        "messages": clean_messages,
        "tools": tools,
        "tool_choice": tool_choice,
    }

    for attempt in range(2):
        try:
            resp = requests.post(
                GROQ_URL,
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json=payload,
                timeout=max(_timeout(), 45),
            )
            if resp.status_code == 429:
                # Fail fast to SQL / heuristic fallback instead of sleeping
                log.warning("groq rate limit; skipping retries (use SQL fallback)")
                return None
            if resp.status_code >= 400:
                recovered = recover_tool_use_failed(resp.text, allowed)
                if recovered:
                    return recovered
                log.warning(
                    "groq_chat_with_tools HTTP %s: %s", resp.status_code, resp.text[:500]
                )
                return None
            choice = resp.json()["choices"][0]
            msg = choice.get("message") or {}
            tcs = msg.get("tool_calls") or []
            fixed = []
            for tc in tcs:
                fn = (tc.get("function") or {})
                name = fn.get("name") or ""
                if name in _FINISH_TOOL_ALIASES:
                    args = _parse_tool_args_loose(fn.get("arguments"))
                    answer = str(
                        args.get("answer") or args.get("content") or args.get("text") or ""
                    ).strip()
                    if answer:
                        fixed.append({
                            "id": tc.get("id") or "norm_finish",
                            "type": "function",
                            "function": {
                                "name": "finish_answer",
                                "arguments": json.dumps({
                                    "answer": answer,
                                    "sql_used": str(args.get("sql_used") or ""),
                                }),
                            },
                        })
                        continue
                fixed.append(tc)
            if fixed:
                msg = dict(msg)
                msg["tool_calls"] = fixed
            return msg
        except Exception as e:
            log.warning("groq_chat_with_tools failed: %s", e)
            return None
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
    # Off by default — burns TPM and causes 429s after chat answers
    if os.getenv("CHATBOT_GROQ_FOLLOWUPS", "0").strip().lower() not in ("1", "true", "yes"):
        return []
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
