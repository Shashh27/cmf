"""Offline intent accuracy check for day-to-day Admin/MC questions.

Run: python -m chatbot.agent.eval_intent
(from backend/ with PYTHONPATH=.)
"""

from __future__ import annotations

from chatbot.agent.intent_router import classify_intent_heuristic

# (question, expected_mode, expected_entity_or_join)
GOLDEN = [
    ("list all orders", "list", "order"),
    ("show orders", "list", "order"),
    ("give me the parts list", "list", "part"),
    ("list customers", "list", "customer"),
    ("show machines", "list", "machine"),
    ("list work centers", "list", "work_center"),
    ("show all tools", "list", "tool"),
    ("list tool issues", "list", "tool_issue"),
    ("pending tool issues", "list", "tool_issue"),
    ("show inventory requests", "list", "inventory_request"),
    ("list return requests", "list", "return_request"),
    ("raw material stock", "list", "raw_material_stock"),
    ("show production logs", "list", "production_log"),
    ("machine live status", "list", "machine_live"),
    ("list breakdowns", "list", "breakdown"),
    ("PM schedule", "list", "pm"),
    ("quality inspections", "list", "quality"),
    ("show OEE", "list", "oee"),
    ("energy consumption", "list", "energy"),
    ("list leaves", "list", "leave"),
    ("show assemblies", "list", "assembly"),
    ("outsourced jobs", "list", "outsource"),
    ("what is the material for part PRT-002", "join", "part->raw_material"),
    ("material for part 002", "join", "part->raw_material"),
    ("stock dimensions for part PRT-002", "join", "part->raw_material"),
    ("schedule for order ISP001", "join", "order->schedule"),
    ("parts on order ABC12345", "join", "order->part"),
    ("list vendors", "list", "vendor"),
    ("notifications", "list", "notification"),
    ("show schedule", "list", "schedule"),
]


def _expected_key(intent: dict) -> str:
    mode = intent.get("mode")
    if mode == "list":
        return f"list:{intent.get('list_entity')}"
    if mode == "join":
        return f"join:{intent.get('from_entity')}->{intent.get('to_entity')}"
    return f"{mode}:"


def main() -> None:
    ok = 0
    for q, mode, entity in GOLDEN:
        intent = classify_intent_heuristic(q)
        conf = float(intent.get("confidence") or 0)
        if mode == "list":
            hit = (
                intent.get("mode") == "list"
                and intent.get("list_entity") == entity
                and conf >= 0.85
            )
            got = _expected_key(intent)
            want = f"list:{entity}"
        else:
            src, _, dst = entity.partition("->")
            hit = (
                intent.get("mode") == "join"
                and intent.get("from_entity") == src
                and intent.get("to_entity") == dst
                and conf >= 0.85
            )
            got = _expected_key(intent)
            want = f"join:{entity}"
        if hit:
            ok += 1
            print(f"OK  conf={conf:.2f}  {q!r}")
        else:
            print(f"FAIL want={want} got={got} conf={conf:.2f}  {q!r}")

    total = len(GOLDEN)
    pct = 100.0 * ok / total if total else 0
    print(f"\nIntent accuracy: {ok}/{total} = {pct:.1f}%")
    raise SystemExit(0 if pct >= 90 else 1)


if __name__ == "__main__":
    main()
