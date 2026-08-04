# services/machine_mhr_service.py
import re
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime, timezone
from DB.models.configuration import Machine as MachineModel

_ALLOWED = re.compile(r'^[0-9A-Za-z_+\-*/(). ]+$')


def safe_eval(expr: str, context: dict) -> float:
    expr = expr.strip()
    if not _ALLOWED.match(expr):
        raise ValueError(f"Unsafe characters in formula: {expr}")
    # substitute known codes (longest names first to avoid partial matches)
    for code in sorted(context, key=len, reverse=True):
        expr = re.sub(rf'\b{re.escape(code)}\b', repr(context[code]), expr)
    if re.search(r'[A-Za-z_]', expr):
        raise ValueError(f"Unresolved variable(s) in formula: {expr}")
    return eval(expr, {"__builtins__": {}}, {})  # only digits/operators reach here


def recalculate_machine_mhr(db: Session, machine_id: int, user_id: int | None = None):
    rows = db.execute(text("""
        SELECT mv.id, p.code, p.is_input, p.formula,
               mv.input_value, mv.computed_value
        FROM configuration.machine_mhr_values mv
        JOIN configuration.mhr_particulars p ON p.id = mv.particular_id
        WHERE mv.machine_id = :mid AND mv.is_applicable = true
        ORDER BY COALESCE(mv.sequence_override, p.default_sequence)
    """), {"mid": machine_id}).mappings().all()

    context = {}
    updates = []
    for row in rows:
        if row["is_input"]:
            value = row["input_value"]
            if value is None:
                raise ValueError(f"Missing input value for {row['code']}")
        else:
            value = safe_eval(row["formula"], context)
            updates.append((row["id"], value))
        context[row["code"]] = value

    # persist computed values (updated_by optional — avoid FK failures on system recalc)
    for value_id, value in updates:
        if user_id is not None:
            db.execute(text("""
                UPDATE configuration.machine_mhr_values
                SET computed_value = :v, updated_by = :uid, updated_at = now()
                WHERE id = :id
            """), {"v": value, "uid": user_id, "id": value_id})
        else:
            db.execute(text("""
                UPDATE configuration.machine_mhr_values
                SET computed_value = :v, updated_at = now()
                WHERE id = :id
            """), {"v": value, "id": value_id})

    mhr_value = context.get("MHR")
    if mhr_value is not None:
        machine = db.query(MachineModel).filter(MachineModel.id == machine_id).first()
        machine.mhr = round(mhr_value)
        machine.recommended_mhr = round(mhr_value)  # Auto-copy to recommended MHR
        machine.mhr_calculated_at = datetime.now(timezone.utc)
        if user_id is not None:
            machine.mhr_updated_by = user_id

    db.commit()
    return context
