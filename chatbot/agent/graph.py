"""LangGraph CMF chatbot — understand question → SQL tools → one accurate answer.

Flow:
  intent_fast (NL → recipe SQL, high confidence) → format → END
  else bootstrap → tool_loop (Groq) → ensure_data → format → END
  On Groq failure: recipe_fallback → format → END

No per-question hardcoded SQL. Join/list recipes are schema knowledge for tools.
Intent router maps NL to those recipes for 90%+ day-to-day accuracy.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, List, Optional, TypedDict

from langgraph.graph import END, StateGraph

from chatbot.agent.column_agent import plan_prompt_for_sql_agent
from chatbot.agent.intent_router import try_high_accuracy_path
from chatbot.agent.relationships import relationship_prompt_block
from chatbot.agent.runner import (
    SYSTEM_PROMPT,
    _fallback_recipe_path,
    _finalize,
    _history_as_messages,
    _parse_tool_args,
)
from chatbot.agent.tools import TOOL_DEFINITIONS, dispatch_tool, dumps_tool_result
from chatbot.groq_client import groq_chat, groq_chat_with_tools, is_groq_enabled
from chatbot.user_context import UserContext, get_role_suggestions

logger = logging.getLogger(__name__)

MAX_ROUNDS = int(os.getenv("CHATBOT_AGENT_MAX_ROUNDS", "8"))


def _schema_block_for_prompt() -> str:
    """Full-app schema knowledge + live columns (truncated for token budget)."""
    from chatbot.schema_knowledge import build_agent_schema_block

    return build_agent_schema_block()


class GraphState(TypedDict, total=False):
    question: str
    session_id: str
    history: List[Dict]
    ctx: Any
    execute_fn: Any
    messages: List[Dict[str, Any]]
    round: int
    last_sql: str
    last_data: List[Dict]
    finish: Optional[Dict[str, Any]]
    answer: str
    sql: str
    data: List[Dict]
    suggestions: List[str]
    display_domain: Optional[str]
    display_columns: List[str]
    column_labels: Dict[str, str]
    error: Optional[str]
    done: bool
    fast_path: bool


def _short_answer(question: str, data: List[Dict], draft: str = "") -> str:
    """One short NL line when a table will be shown — avoid double answers."""
    n = len(data or [])
    draft = (draft or "").strip()
    fail_phrases = (
        "could not determine",
        "could not complete",
        "i don't know",
        "rate limit",
        "not configured",
    )
    draft_l = draft.lower()
    if n:
        if not draft or any(p in draft_l for p in fail_phrases):
            return f"Found **{n}** matching row(s)."
        # Prefer a one-liner; strip markdown tables / bullet dumps
        lines = [
            ln for ln in draft.splitlines()
            if ln.strip()
            and not ln.strip().startswith("|")
            and not ln.strip().startswith("- **")
            and not (ln.strip()[:2].isdigit() and ". " in ln[:4])
        ]
        if lines:
            first = lines[0].strip()
            if len(first) > 220:
                first = first[:217] + "..."
            return first
        return f"Found **{n}** matching row(s)."
    return draft or "No matching rows found for that question."


def node_intent_fast(state: GraphState) -> Dict[str, Any]:
    """High-confidence NL → validated recipe SQL (skips Groq when possible)."""
    question = state["question"]
    exec_sql = state["execute_fn"]
    ctx = state.get("ctx")
    try:
        hit = try_high_accuracy_path(question, exec_sql, ctx=ctx)
    except Exception:
        logger.exception("intent_fast failed")
        return {"fast_path": False, "done": False}

    if not hit:
        # If we already know order/part filters, do NOT call Groq on rate-limit days —
        # force recipe fallback instead of burning TPM
        from chatbot.agent.intent_router import extract_filters_heuristic, resolve_intent

        intent = resolve_intent(question)
        filters = intent.get("filters") or extract_filters_heuristic(question)
        if float(intent.get("confidence") or 0) >= 0.85 or (
            filters.get("order_no") or filters.get("part_term")
        ):
            from chatbot.agent.runner import _fallback_recipe_path

            fb = _fallback_recipe_path(
                question, ctx or UserContext(), exec_sql, reason="rate_limit"
            )
            return {
                "fast_path": True,
                "done": True,
                "answer": fb.get("answer") or "",
                "sql": fb.get("sql") or "",
                "data": fb.get("data") or [],
                "last_data": fb.get("data") or [],
                "last_sql": fb.get("sql") or "",
                "suggestions": fb.get("suggestions") or [],
                "display_domain": fb.get("display_domain"),
                "display_columns": fb.get("display_columns") or [],
                "column_labels": fb.get("column_labels") or {},
                "error": None,
            }
        return {"fast_path": False, "done": False}

    return {
        "fast_path": True,
        "done": True,
        "answer": hit.get("answer") or "",
        "sql": hit.get("sql") or "",
        "data": hit.get("data") or [],
        "last_data": hit.get("data") or [],
        "last_sql": hit.get("sql") or "",
        "suggestions": hit.get("suggestions") or [],
        "error": None,
    }


def node_bootstrap(state: GraphState) -> Dict[str, Any]:
    ctx = state.get("ctx") or UserContext()
    question = state["question"]
    history = state.get("history") or []

    if not is_groq_enabled():
        return {"error": "missing_key", "done": False, "round": 0}

    messages: List[Dict[str, Any]] = [
        {
            "role": "system",
            "content": SYSTEM_PROMPT.format(
                relationships=relationship_prompt_block(),
                column_plans=plan_prompt_for_sql_agent(),
                schema_knowledge=_schema_block_for_prompt(),
            ),
        },
    ]
    messages.extend(_history_as_messages(history))
    user_bits = [question]
    if getattr(ctx, "user_name", None) or getattr(ctx, "role", None):
        user_bits.append(
            f"(Logged-in: {getattr(ctx, 'user_name', None) or 'user'}, "
            f"role={getattr(ctx, 'role', None) or 'unknown'})"
        )
    messages.append({"role": "user", "content": "\n".join(user_bits)})

    return {
        "messages": messages,
        "round": 0,
        "last_sql": "",
        "last_data": [],
        "finish": None,
        "done": False,
        "error": None,
        "ctx": ctx,
    }


def node_tool_loop(state: GraphState) -> Dict[str, Any]:
    """One Groq tool-calling round + tool execution."""
    if state.get("done") or state.get("error"):
        return {}

    messages = list(state.get("messages") or [])
    exec_sql = state["execute_fn"]
    last_sql = state.get("last_sql") or ""
    last_data = list(state.get("last_data") or [])
    finish = state.get("finish")
    rnd = int(state.get("round") or 0)

    msg = groq_chat_with_tools(messages, TOOL_DEFINITIONS, max_tokens=1400)
    if not msg:
        return {"error": "rate_limit", "round": rnd + 1}

    tool_calls = msg.get("tool_calls") or []
    content = (msg.get("content") or "").strip()

    assistant_msg: Dict[str, Any] = {
        "role": "assistant",
        "content": content if content else "",
    }
    if tool_calls:
        assistant_msg["tool_calls"] = tool_calls
    messages.append(assistant_msg)

    # Model answered in plain text — treat as done if we already have data
    if not tool_calls:
        return {
            "messages": messages,
            "answer": content or "I could not determine an answer.",
            "sql": last_sql,
            "data": last_data,
            "done": True,
            "round": rnd + 1,
        }

    for call in tool_calls:
        fn = (call.get("function") or {})
        name = fn.get("name") or ""
        args = _parse_tool_args(fn.get("arguments"))
        tool_id = call.get("id") or name

        result, finish_payload = dispatch_tool(name, args, execute_fn=exec_sql)

        # Promote ANY rows into last_data so UI always gets the table
        if result.get("ok") and isinstance(result.get("rows"), list) and result["rows"]:
            last_data = result["rows"]
            if name == "run_select_sql":
                last_sql = result.get("sql") or last_sql
        elif name == "search_entity" and isinstance(result.get("rows"), list) and result["rows"]:
            # Keep search hits if we don't have SELECT data yet
            if not last_data:
                last_data = result["rows"]

        if finish_payload is not None:
            finish = finish_payload
            if finish.get("sql_used") and not last_sql:
                last_sql = finish["sql_used"]

        messages.append({
            "role": "tool",
            "tool_call_id": tool_id,
            "name": name,
            "content": dumps_tool_result(result),
        })

    # If model tried to finish without data, nudge it to run SQL once more
    if finish is not None and not last_data and rnd < MAX_ROUNDS - 1:
        messages.append({
            "role": "user",
            "content": (
                "You called finish_answer but returned no table rows. "
                "Call get_join_path or inspect_schema, then run_select_sql "
                "with a correct SELECT, THEN finish_answer. Do not invent tools."
            ),
        })
        return {
            "messages": messages,
            "last_sql": last_sql,
            "last_data": last_data,
            "finish": None,
            "done": False,
            "round": rnd + 1,
        }

    if finish is not None:
        return {
            "messages": messages,
            "last_sql": last_sql,
            "last_data": last_data,
            "finish": finish,
            "answer": finish.get("answer") or content or "Done.",
            "sql": finish.get("sql_used") or last_sql,
            "data": last_data,
            "done": True,
            "round": rnd + 1,
        }

    return {
        "messages": messages,
        "last_sql": last_sql,
        "last_data": last_data,
        "finish": finish,
        "done": False,
        "round": rnd + 1,
    }


def node_ensure_data(state: GraphState) -> Dict[str, Any]:
    """If we finished with empty data, try recipe fallback once before giving up."""
    if state.get("error") in ("missing_key", "rate_limit"):
        return {}
    if state.get("data"):
        return {}
    if not state.get("done"):
        return {}

    # Have a text answer but no rows — try schema recipes as safety net
    question = state["question"]
    ctx = state.get("ctx") or UserContext()
    exec_sql = state["execute_fn"]
    fb = _fallback_recipe_path(question, ctx, exec_sql, reason="rate_limit")
    if fb.get("data"):
        return {
            "answer": _short_answer(question, fb["data"], fb.get("answer") or ""),
            "sql": fb.get("sql") or "",
            "data": fb.get("data") or [],
            "display_domain": fb.get("display_domain"),
            "display_columns": fb.get("display_columns") or [],
            "column_labels": fb.get("column_labels") or {},
            "suggestions": fb.get("suggestions") or [],
            "done": True,
        }
    return {}


def node_recipe_fallback(state: GraphState) -> Dict[str, Any]:
    reason = state.get("error") or "rate_limit"
    ctx = state.get("ctx") or UserContext()
    fb = _fallback_recipe_path(state["question"], ctx, state["execute_fn"], reason=reason)
    return {
        "answer": fb.get("answer") or "",
        "sql": fb.get("sql") or "",
        "data": fb.get("data") or [],
        "display_domain": fb.get("display_domain"),
        "display_columns": fb.get("display_columns") or [],
        "column_labels": fb.get("column_labels") or {},
        "suggestions": fb.get("suggestions") or [],
        "done": True,
        "error": None,
    }


def node_format(state: GraphState) -> Dict[str, Any]:
    """Column agent + single short answer. One response only."""
    from chatbot.chatbot import get_follow_up_suggestions
    from chatbot.agent.intent_router import (
        extract_filters_heuristic,
        filter_rows_to_asked_entity,
    )

    question = state["question"]
    ctx = state.get("ctx") or UserContext()
    data = state.get("data") or state.get("last_data") or []
    sql = state.get("sql") or state.get("last_sql") or ""
    draft = state.get("answer") or ""

    # Hard scope: if user named order/part, drop unrelated rows
    filters = extract_filters_heuristic(question)
    if data and (filters.get("order_no") or filters.get("part_term")):
        before = len(data)
        data = filter_rows_to_asked_entity(data, filters)
        if len(data) != before or not draft:
            if filters.get("order_no") and len(data) == 1:
                draft = f"Here is order **{filters['order_no']}**."
            elif filters.get("order_no"):
                draft = (
                    f"Found **{len(data)}** row(s) for order **{filters['order_no']}**."
                    if data
                    else f"No order found matching **{filters['order_no']}**."
                )
            elif filters.get("part_term"):
                draft = (
                    f"Found **{len(data)}** row(s) for part **{filters['part_term']}**."
                    if data
                    else f"No part found matching **{filters['part_term']}**."
                )

    # If we still have data from last_data but answer empty
    if not draft and data:
        draft = f"Found **{len(data)}** matching row(s)."

    # Max rounds without finish — summarize rows without second "answer dump"
    if not state.get("done") and data and not draft:
        draft = groq_chat(
            [
                {
                    "role": "system",
                    "content": "Write ONE short sentence summarizing these CMF rows. No table. No bullets.",
                },
                {
                    "role": "user",
                    "content": f"Q: {question}\nRows: {json.dumps(data[:5], default=str)[:2000]}",
                },
            ],
            max_tokens=120,
        ) or f"Found **{len(data)}** matching row(s)."

    answer = _short_answer(question, data, draft)
    suggestions = state.get("suggestions") or get_follow_up_suggestions(question, data, ctx)
    if not suggestions:
        suggestions = get_role_suggestions(ctx)[:3]

    # Already finalized by recipe path with columns?
    if state.get("display_columns") and state.get("column_labels"):
        return {
            "answer": answer,
            "sql": sql,
            "data": data,
            "suggestions": suggestions,
            "display_domain": state.get("display_domain"),
            "display_columns": state.get("display_columns") or [],
            "column_labels": state.get("column_labels") or {},
            "done": True,
        }

    final = _finalize(
        question,
        answer=answer,
        sql=sql,
        data=data,
        suggestions=suggestions,
        ctx=ctx,
    )
    return {**final, "done": True}


def _route_after_intent(state: GraphState) -> str:
    if state.get("fast_path") and state.get("done"):
        return "format"
    return "bootstrap"


def _route_after_bootstrap(state: GraphState) -> str:
    if state.get("error") == "missing_key":
        return "recipe_fallback"
    return "tool_loop"


def _route_after_tools(state: GraphState) -> str:
    if state.get("error") in ("missing_key", "rate_limit"):
        return "recipe_fallback"
    if state.get("done"):
        return "ensure_data"
    if int(state.get("round") or 0) >= MAX_ROUNDS:
        return "ensure_data"
    return "tool_loop"


def _route_after_ensure(state: GraphState) -> str:
    return "format"


def build_chat_graph():
    g = StateGraph(GraphState)
    g.add_node("intent_fast", node_intent_fast)
    g.add_node("bootstrap", node_bootstrap)
    g.add_node("tool_loop", node_tool_loop)
    g.add_node("ensure_data", node_ensure_data)
    g.add_node("recipe_fallback", node_recipe_fallback)
    g.add_node("format", node_format)

    g.set_entry_point("intent_fast")
    g.add_conditional_edges("intent_fast", _route_after_intent, {
        "format": "format",
        "bootstrap": "bootstrap",
    })
    g.add_conditional_edges("bootstrap", _route_after_bootstrap, {
        "tool_loop": "tool_loop",
        "recipe_fallback": "recipe_fallback",
    })
    g.add_conditional_edges("tool_loop", _route_after_tools, {
        "tool_loop": "tool_loop",
        "ensure_data": "ensure_data",
        "recipe_fallback": "recipe_fallback",
    })
    g.add_edge("ensure_data", "format")
    g.add_edge("recipe_fallback", "format")
    g.add_edge("format", END)
    return g.compile()


_GRAPH = None


def get_chat_graph():
    global _GRAPH
    if _GRAPH is None:
        _GRAPH = build_chat_graph()
    return _GRAPH


def reset_chat_graph():
    """Force rebuild after code changes (dev / tests)."""
    global _GRAPH
    _GRAPH = None


def run_chat_graph(
    question: str,
    *,
    session_id: str,
    history: Optional[List[Dict]] = None,
    ctx: Optional[UserContext] = None,
    execute_fn=None,
) -> Dict[str, Any]:
    """Public entry used by ChatService — LangGraph-orchestrated agent."""
    from chatbot.chatbot import execute_sql

    ctx = ctx or UserContext()
    exec_sql = execute_fn or execute_sql
    graph = get_chat_graph()

    initial: GraphState = {
        "question": question,
        "session_id": session_id or "",
        "history": history or [],
        "ctx": ctx,
        "execute_fn": exec_sql,
        "messages": [],
        "round": 0,
        "last_sql": "",
        "last_data": [],
        "finish": None,
        "answer": "",
        "sql": "",
        "data": [],
        "suggestions": [],
        "display_columns": [],
        "column_labels": {},
        "done": False,
        "error": None,
        "fast_path": False,
    }

    try:
        out = graph.invoke(initial)
    except Exception:
        logger.exception("LangGraph chat failed; using recipe fallback")
        return _fallback_recipe_path(question, ctx, exec_sql, reason="rate_limit")

    return {
        "answer": out.get("answer") or "",
        "sql": out.get("sql") or "",
        "data": out.get("data") or [],
        "suggestions": out.get("suggestions") or get_role_suggestions(ctx)[:3],
        "display_domain": out.get("display_domain"),
        "display_columns": out.get("display_columns") or [],
        "column_labels": out.get("column_labels") or {},
    }
