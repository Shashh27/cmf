"""Groq tool-calling agent — understands NL, then queries via tools.

Architecture (no per-module hardcoded Q→SQL routes):
1. Column agent — which MAIN columns to show for this module/question
2. Data agent (Groq tools) — understand question → search / join / SELECT → answer
3. Fallback — only if Groq unavailable/rate-limited: use the SAME join/list recipes
   via get_join_path (schema knowledge), not endless screen-specific regex SQL
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any, Dict, List, Optional, Tuple

from chatbot.agent.relationships import get_join_recipe, relationship_prompt_block
from chatbot.agent.tools import TOOL_DEFINITIONS, dispatch_tool, dumps_tool_result, tool_run_select_sql
from chatbot.groq_client import groq_chat, groq_chat_with_tools, is_groq_enabled
from chatbot.user_context import UserContext, get_role_suggestions

logger = logging.getLogger(__name__)

MAX_AGENT_ROUNDS = int(os.getenv("CHATBOT_AGENT_MAX_ROUNDS", "6"))

SYSTEM_PROMPT = """You are the CMF Assistant for the FULL CMF Digitization application
(Admin and Manufacturing Coordinator users).

You answer questions across the ENTIRE system — not only tools/inventory:
- OMS: orders, products, parts, assemblies, operations, documents, outsource
- Scheduling: planned schedule / Gantt, production logs, downtimes, shifts
- Inventory: raw materials, stock, tools, tool issues, requests, returns, vendors
- Configuration: customers, machines, work centers, PM
- Quality: stage inspection, FTP, BOC
- Maintenance: breakdowns, component issues, help/support
- Production monitoring: live machine status, OEE / shift summary
- EMS: energy / power
- Notifications & access: users, operator leaves, alerts

{relationships}

{column_plans}

{schema_knowledge}

HOW YOU WORK (intelligent agent — never memorize one fixed question):
1. Understand the user's natural-language question (typos OK). Pick the domain yourself.
2. Call plan_display_columns for MAIN columns for that domain.
3. If they named an id (order/part/material/tool/machine/customer), call search_entity first.
4. For joins: get_join_path(from, to) e.g. part→raw_material, order→schedule, order→part.
5. For list/show/give-me screens: get_join_path('list', entity) where entity can be:
   order, part, product, customer, machine, work_center, vendor, operator, tool,
   tool_issue, inventory_request, return_request, raw_material_stock, schedule,
   production_log, machine_live, quality, breakdown, pm, notification, assembly,
   outsource, downtime, oee, energy, leave
6. If unsure of columns/tables, call inspect_schema on the live DB (oms, scheduling,
   inventory, configuration, quality, maintenance, production_monitoring, ems,
   notifications, accesscontrol, documents).
7. Write ONE accurate SELECT (adapt sql_hint; add WHERE from the question). Never SELECT *.
8. Call finish_answer with a SHORT summary (1–2 sentences). UI shows the table — do not
   paste markdown tables or long bullet row lists.

CRITICAL ACCURACY:
- Never invent tables/columns. Prefer get_join_path + inspect_schema.
- Parts ≠ raw material stock ≠ tools.
- Never finish_answer until run_select_sql (or search) returned rows, unless DB is empty.
- If search_entity finds matches, still run a proper SELECT for answer columns.
- One question → one finish_answer only.
- You may ONLY call: inspect_schema, get_join_path, search_entity, plan_display_columns,
  run_select_sql, finish_answer. Never invent tools (commentary, etc.).
"""


def _history_as_messages(history: List[Dict], limit: int = 6) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for h in (history or [])[-limit:]:
        role = h.get("role")
        content = (h.get("content") or "").strip()
        if not content:
            continue
        if role in ("user", "human"):
            out.append({"role": "user", "content": content})
        elif role in ("assistant", "bot", "ai"):
            out.append({"role": "assistant", "content": content[:1500]})
    return out


def _parse_tool_args(raw: Any) -> Dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except Exception:
        return {}


def _finalize(
    question: str,
    *,
    answer: str,
    sql: str = "",
    data: Optional[List[Dict]] = None,
    suggestions: Optional[List[str]] = None,
    ctx: Optional[UserContext] = None,
) -> Dict[str, Any]:
    """Apply column planner agent — keep only main display columns."""
    from chatbot.agent.column_agent import apply_column_plan

    ctx = ctx or UserContext()
    data = data or []
    planned = apply_column_plan(question, data, max_cols=10)
    return {
        "answer": answer,
        "sql": sql or "",
        "data": planned["data"],
        "suggestions": suggestions or get_role_suggestions(ctx)[:3],
        "display_domain": planned.get("domain"),
        "display_columns": planned.get("columns") or [],
        "column_labels": planned.get("labels") or {},
    }


def run_agent(
    question: str,
    *,
    session_id: str,
    history: Optional[List[Dict]] = None,
    ctx: Optional[UserContext] = None,
    execute_fn=None,
) -> Dict[str, Any]:
    """
    Primary path: Groq tool-calling agent understands the question and runs SQL tools.
    Fallback: same relationship recipes if Groq is down / rate-limited.
    """
    from chatbot.chatbot import execute_sql, get_follow_up_suggestions
    from chatbot.agent.column_agent import plan_prompt_for_sql_agent

    ctx = ctx or UserContext()
    exec_sql = execute_fn or execute_sql

    if not is_groq_enabled():
        return _fallback_recipe_path(question, ctx, exec_sql, reason="missing_key")

    from chatbot.agent.column_agent import plan_prompt_for_sql_agent
    from chatbot.schema_knowledge import build_agent_schema_block

    messages: List[Dict[str, Any]] = [
        {
            "role": "system",
            "content": SYSTEM_PROMPT.format(
                relationships=relationship_prompt_block(),
                column_plans=plan_prompt_for_sql_agent(),
                schema_knowledge=build_agent_schema_block(),
            ),
        },
    ]
    messages.extend(_history_as_messages(history or []))
    user_bits = [question]
    if ctx.user_name or ctx.role:
        user_bits.append(
            f"(Logged-in: {ctx.user_name or 'user'}, role={ctx.role or 'unknown'})"
        )
    messages.append({"role": "user", "content": "\n".join(user_bits)})

    last_sql = ""
    last_data: List[Dict] = []
    finish: Optional[Dict[str, Any]] = None

    for _round in range(MAX_AGENT_ROUNDS):
        msg = groq_chat_with_tools(messages, TOOL_DEFINITIONS, max_tokens=1400)
        if not msg:
            if not last_data:
                return _fallback_recipe_path(question, ctx, exec_sql, reason="rate_limit")
            break

        tool_calls = msg.get("tool_calls") or []
        content = (msg.get("content") or "").strip()

        assistant_msg: Dict[str, Any] = {
            "role": "assistant",
            "content": content if content else "",
        }
        if tool_calls:
            assistant_msg["tool_calls"] = tool_calls
        messages.append(assistant_msg)

        if not tool_calls:
            answer = content or "I could not determine an answer."
            suggestions = get_follow_up_suggestions(question, last_data, ctx)
            return _finalize(
                question,
                answer=answer,
                sql=last_sql,
                data=last_data,
                suggestions=suggestions,
                ctx=ctx,
            )

        for call in tool_calls:
            fn = (call.get("function") or {})
            name = fn.get("name") or ""
            args = _parse_tool_args(fn.get("arguments"))
            tool_id = call.get("id") or name

            result, finish_payload = dispatch_tool(name, args, execute_fn=exec_sql)

            if name == "run_select_sql" and result.get("ok"):
                last_sql = result.get("sql") or last_sql
                last_data = result.get("rows") or []

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

        if finish is not None:
            answer = finish.get("answer") or content or "Done."
            sql_used = finish.get("sql_used") or last_sql
            suggestions = get_follow_up_suggestions(question, last_data, ctx)
            if not suggestions:
                suggestions = get_role_suggestions(ctx)[:3]
            return _finalize(
                question,
                answer=answer,
                sql=sql_used,
                data=last_data,
                suggestions=suggestions,
                ctx=ctx,
            )

    if last_data:
        answer = groq_chat(
            [
                {"role": "system", "content": "Summarize these CMF DB rows for the user in 2-4 sentences."},
                {"role": "user", "content": f"Question: {question}\nRows: {json.dumps(last_data[:8], default=str)[:3000]}"},
            ],
            max_tokens=400,
        ) or f"Found **{len(last_data)}** matching row(s)."
        return _finalize(
            question,
            answer=answer,
            sql=last_sql,
            data=last_data,
            suggestions=get_follow_up_suggestions(question, last_data, ctx),
            ctx=ctx,
        )

    return _fallback_recipe_path(question, ctx, exec_sql, reason="rate_limit")


def _guess_list_entity(question: str) -> Optional[str]:
    """Map rough list intent → relationship entity (for fallback only)."""
    q = (question or "").lower()
    rules = [
        (r"\breturn\s*requests?\b", "return_request"),
        (r"\btool\s*issues?\b", "tool_issue"),
        (r"\binventory\s*requests?\b|\btool\s*requests?\b|\bpending\s+requests?\b", "inventory_request"),
        (r"\bmachine\s+live|shop\s*floor|live\s+status\b", "machine_live"),
        (r"\bproduction\s+logs?|operation\s+logs?\b", "production_log"),
        (r"\bbreakdowns?|machine\s+issues?\b", "breakdown"),
        (r"\bpreventive|\bpm\s+schedule\b|\bpm\b", "pm"),
        (r"\bstage\s+inspection|\bquality\b|\binspection\b", "quality"),
        (r"\bdowntimes?\b", "downtime"),
        (r"\boee\b", "oee"),
        (r"\benergy\b|\bems\b|\bpower\s+consumption\b", "energy"),
        (r"\bleaves?\b|\boperator\s+leave\b", "leave"),
        (r"\bnotifications?|\balerts?\b", "notification"),
        (r"\bassembl(?:y|ies)\b", "assembly"),
        (r"\boutsourc", "outsource"),
        (r"\bvendors?|\bsuppliers?\b", "vendor"),
        (r"\bcustomers?\b", "customer"),
        (r"\bwork\s*centers?\b", "work_center"),
        (r"\boperators?|\busers?\b", "operator"),
        (r"\bmachines?\b", "machine"),
        (r"\bproducts?\b", "product"),
        (r"\bparts?\b|\bbom\b", "part"),
        (r"\bschedule|gantt\b", "schedule"),
        (r"\b(?:list|show|give|get).{0,20}\btools?\b|\btools?\s*list\b", "tool"),
        (r"\braw\s*material\s*stock|\blist\s+stock\b|\bshow\s+stock\b", "raw_material_stock"),
        (r"\b(?:list|show|all)\s+orders?\b|\borders?\s*list\b", "order"),
    ]
    for pat, entity in rules:
        if re.search(pat, q):
            return entity
    return None


def _guess_join(question: str) -> Optional[Tuple[str, str, Dict[str, str]]]:
    """Guess from→to + placeholder replacements for fallback."""
    q = (question or "").lower()
    replacements: Dict[str, str] = {}

    part_m = re.search(
        r"\b(?:part\s+)?(?:no\.?|number|#)?\s*(PRT[\-_]?\d+|\d{2,4})\b",
        question or "",
        re.I,
    )
    order_m = re.search(
        r"\border\s+([A-Za-z0-9][\w\-/]+)\b|\b([A-Z]{2,}\d{3,})\b",
        question or "",
        re.I,
    )

    if re.search(r"materi|raw|stock\s*dim|length\s*used", q) and (
        part_m or re.search(r"\bpart\b", q)
    ):
        if part_m:
            replacements["%PART%"] = part_m.group(1)
        return "part", "raw_material", replacements

    if re.search(r"schedule|gantt|planned\s+start", q) and order_m:
        term = order_m.group(1) or order_m.group(2)
        replacements["ORDER_NO"] = term
        return "order", "schedule", replacements

    if re.search(r"\bparts?\b", q) and order_m:
        term = order_m.group(1) or order_m.group(2)
        replacements["%ORDER_NO%"] = term
        replacements["ORDER_NO"] = term
        return "order", "part", replacements

    return None


def _apply_placeholders(sql: str, replacements: Dict[str, str]) -> str:
    out = sql
    for k, v in (replacements or {}).items():
        safe = (v or "").replace("'", "''")
        out = out.replace(k, safe)
    return out


def _fallback_recipe_path(
    question: str,
    ctx: UserContext,
    execute_fn,
    *,
    reason: str = "rate_limit",
) -> Dict[str, Any]:
    """
    Emergency path when Groq cannot run.
    Prefer filtered intent router (same as fast path) so we never dump all rows
    for a specific order/part ask.
    """
    from chatbot.agent.intent_router import (
        chitchat_answer,
        extract_filters_heuristic,
        filter_rows_to_asked_entity,
        is_chitchat,
        try_high_accuracy_path,
    )

    if is_chitchat(question):
        return chitchat_answer(question, ctx)

    hit = try_high_accuracy_path(question, execute_fn, ctx=ctx)
    if hit is not None:
        return _finalize(
            question,
            answer=hit.get("answer") or "",
            sql=hit.get("sql") or "",
            data=hit.get("data") or [],
            suggestions=hit.get("suggestions") or get_role_suggestions(ctx)[:3],
            ctx=ctx,
        )

    sql = None
    list_entity = _guess_list_entity(question)
    filters = extract_filters_heuristic(question)
    # Never unfiltered list when user named a specific order/part
    if list_entity and not (filters.get("order_no") or filters.get("part_term")):
        recipe = get_join_recipe("list", list_entity)
        if recipe:
            sql = recipe.get("sql_hint")

    if not sql:
        guessed = _guess_join(question)
        if guessed:
            src, dst, repl = guessed
            recipe = get_join_recipe(src, dst)
            if recipe and recipe.get("sql_hint"):
                candidate = _apply_placeholders(recipe["sql_hint"], repl)
                if "%PART%" not in candidate and "ORDER_NO" not in candidate:
                    sql = candidate

    if sql:
        result = tool_run_select_sql(sql, execute_fn)
        data = filter_rows_to_asked_entity(result.get("rows") or [], filters)
        if data:
            return _finalize(
                question,
                answer=f"Found **{len(data)}** result(s).",
                sql=result.get("sql") or sql,
                data=data,
                suggestions=get_role_suggestions(ctx)[:3],
                ctx=ctx,
            )

    if reason == "missing_key":
        msg = (
            "Groq API is not configured (GROQ_API_KEY). "
            "Set it in backend/.env so the agent can understand any question."
        )
    else:
        msg = (
            "I couldn't reach the AI service just now (rate limit).\n\n"
            "You can still ask with clear keywords — try:\n"
            "• *list all orders*\n"
            "• *tool issues*\n"
            "• *material for part PRT-002*\n"
            "• *machine live status*"
        )
    return _finalize(
        question,
        answer=msg,
        sql="",
        data=[],
        suggestions=get_role_suggestions(ctx)[:3],
        ctx=ctx,
    )
