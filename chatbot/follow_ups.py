"""Context-aware follow-up questions — derived from the user's query and result rows."""

import re
from typing import Any, Dict, List, Optional, Set

from chatbot.material_sql import is_material_query, is_tool_query
from chatbot.user_context import UserContext, get_role_suggestions


def _uniq(values: List[Any], limit: int = 3) -> List[str]:
    out: List[str] = []
    seen: Set[str] = set()
    for v in values:
        if v is None:
            continue
        s = str(v).strip()
        if not s or s.lower() in seen:
            continue
        seen.add(s.lower())
        out.append(s)
        if len(out) >= limit:
            break
    return out


def _row_values(data: List[Dict], key: str, limit: int = 3) -> List[str]:
    return _uniq([row.get(key) for row in data if row.get(key) is not None], limit)


def _infer_domains(question: str, data: List[Dict]) -> Set[str]:
    q = (question or "").lower()
    domains: Set[str] = set()
    if not data:
        if is_material_query(q):
            domains.add("materials")
        elif is_tool_query(q):
            domains.add("tools")
        elif "notification" in q or "alert" in q:
            domains.add("notifications")
        elif "operation" in q or "production" in q:
            domains.add("operations")
        elif "machine" in q or "work center" in q:
            domains.add("machines")
        elif "operator" in q or "leave" in q:
            domains.add("operators")
        elif "customer" in q:
            domains.add("customers")
        elif "vendor" in q:
            domains.add("vendors")
        elif "quality" in q or "inspection" in q:
            domains.add("quality")
        elif "order" in q:
            domains.add("orders")
        elif "part" in q or "component" in q:
            domains.add("parts")
        return domains

    keys = set(data[0].keys())
    if "material_name" in keys or "form_type" in keys or "bar_remaining_length_mm" in keys:
        domains.add("materials")
    if "sale_order_number" in keys and "material_name" not in keys:
        domains.add("orders")
    if "part_name" in keys and "operation_name" not in keys:
        domains.add("parts")
    if "operation_name" in keys or "operation_number" in keys:
        domains.add("operations")
    if "notification_type" in keys or ("reference" in keys and "notification" in q):
        domains.add("notifications")
    if keys & {"tool_name", "item_description", "identification_code", "tool_issue_qty"}:
        domains.add("tools")
    if "user_name" in keys and ("operator" in q or "role" in keys):
        domains.add("operators")
    if "company_name" in keys and "customer" in q:
        domains.add("customers")
    if "type" in keys and "make" in keys and "model" in keys:
        domains.add("machines")
    if "source_type" in keys:
        for st in _row_values(data, "source_type", 2):
            domains.add(st.lower())

    if not domains:
        if "order" in q:
            domains.add("orders")
        elif is_material_query(q):
            domains.add("materials")
        elif "part" in q:
            domains.add("parts")

    return domains


def build_follow_up_suggestions(
    question: str,
    data: List[Dict],
    ctx: Optional[UserContext] = None,
) -> List[str]:
    ctx = ctx or UserContext()
    q = (question or "").lower()
    domains = _infer_domains(question, data)
    suggestions: List[str] = []
    seen: Set[str] = set()

    def add(text: str) -> None:
        t = (text or "").strip()
        if not t:
            return
        key = t.lower()
        if key == q.strip() or key in seen:
            return
        seen.add(key)
        suggestions.append(t)

    # ── Empty results ─────────────────────────────────────────────────────
    if not data:
        if "materials" in domains:
            mats = _row_values(data, "material_name")
            if mats:
                add(f"Stock for {mats[0]}")
            add("Show all raw material stock")
            add("List all raw materials")
        elif "orders" in domains:
            add("My orders" if ctx.is_logged_in() else "Show all orders")
            add("Show overdue orders")
        elif "notifications" in domains:
            add("My notifications" if ctx.is_logged_in() else "Notifications")
        elif "operations" in domains:
            add("Pending operations")
            add("In-progress operations")
        elif "tools" in domains:
            add("List all tools")
            add("Pending tool requests")
        else:
            for p in get_role_suggestions(ctx)[:3]:
                add(p)
        return suggestions[:3]

    # ── Materials ─────────────────────────────────────────────────────────
    if "materials" in domains:
        for mat in _row_values(data, "material_name", 2):
            add(f"Stock for {mat}")
            if any(k in data[0] for k in ("bar_remaining_length_mm", "bar_total_length_mm")):
                add(f"Units and dimensions for {mat}")
            else:
                add(f"Dimensions for {mat}")
        forms = _row_values(data, "form_type", 1)
        if forms and _row_values(data, "material_name", 1):
            add(f"{_row_values(data, 'material_name', 1)[0]} {forms[0]} stock")
        if len(suggestions) < 3:
            add("Show all raw material stock")

    # ── Orders ────────────────────────────────────────────────────────────
    if "orders" in domains and "materials" not in domains:
        for so in _row_values(data, "sale_order_number", 2):
            add(f"Parts for order {so}")
            add(f"Operations for order {so}")
            add(f"Schedule for order {so}")
            break
        if len(suggestions) < 3:
            add("Show overdue orders")

    # ── Parts ─────────────────────────────────────────────────────────────
    if "parts" in domains and "orders" not in domains:
        for part in _row_values(data, "part_name", 2):
            add(f"Operations for {part}")
            add(f"Raw material for {part}")
            break

    # ── Operations ────────────────────────────────────────────────────────
    if "operations" in domains:
        parts = _row_values(data, "part_name", 1)
        if parts:
            add(f"Production logs for {parts[0]}")
        add("In-progress operations")
        add("Machine live status")

    # ── Notifications ─────────────────────────────────────────────────────
    if "notifications" in domains:
        refs = _row_values(data, "reference", 2)
        for ref in refs:
            if re.search(r"\bso[\s\-]?\w+", ref, re.I) or ref.lower().startswith("order"):
                add(f"Parts for order {ref}")
            else:
                add(f"Details for {ref}")
        add("My notifications" if ctx.is_logged_in() else "Show all orders")

    # ── Tools ─────────────────────────────────────────────────────────────
    if "tools" in domains:
        for tool in _row_values(data, "tool_name", 1) or _row_values(data, "item_description", 1):
            add(f"Tool issues for {tool}")
            break
        add("Pending tool requests")

    # ── Machines ──────────────────────────────────────────────────────────
    if "machines" in domains:
        machines = _row_values(data, "type", 1) or _row_values(data, "title", 1)
        if machines:
            add(f"Machine breakdowns for {machines[0]}")
        add("Calibration due")
        add("Work centers")

    # ── Operators ─────────────────────────────────────────────────────────
    if "operators" in domains:
        for name in _row_values(data, "user_name", 1):
            add(f"Leaves for {name}")
            add(f"Tools issued to {name}")
            break

    # ── Broad search hits (source_type) ───────────────────────────────────
    if "source_type" in (data[0] if data else {}):
        for row in data[:3]:
            st = (row.get("source_type") or "").lower()
            title = row.get("title") or row.get("subtitle")
            if not title:
                continue
            if st == "order":
                add(f"Parts for order {title}")
            elif st == "part":
                add(f"Operations for {title}")
            elif st == "material":
                add(f"Stock for {title}")
            elif st == "machine":
                add(f"Breakdowns for {title}")
            if len(suggestions) >= 3:
                break

    # ── Fallback: use first meaningful cell value ─────────────────────────
    if not suggestions and data:
        row = data[0]
        for key in ("sale_order_number", "material_name", "part_name", "product_name", "title"):
            val = row.get(key)
            if val:
                add(f"More details for {val}")
                break

    if not suggestions:
        for p in get_role_suggestions(ctx):
            add(p)
            if len(suggestions) >= 3:
                break

    return suggestions[:3]
