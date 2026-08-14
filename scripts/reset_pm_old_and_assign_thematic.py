"""
1) Delete old machine-named PM checklists + checkpoints + all related
   assignments / schedules / submissions.
2) Keep thematic checklists; set created_by=16.
3) Assign every thematic checklist (all checkpoints required) to machines
   that previously had PM assignments. assigned_by=16.
"""
from __future__ import annotations

import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from sqlalchemy import text
from DB.database import SessionLocal
from DB.models.configuration import (
    PMChecklist,
    PMChecklistItem,
    PMMachineAssignment,
    PMAssignmentItem,
    PMSchedule,
    PMCheckpointSubmission,
)
from services.pm_service import create_initial_schedule

USER_ID = 16

THEMATIC_NAMES = {
    "Hydraulic",
    "Coolant",
    "Lubrication / Greasing",
    "Oiling",
    "Filters",
    "Air / Pneumatic",
    "Belts / Drive",
    "Electrical",
    "Safety / Sensors / Switches",
    "Spindle / Head / Tooling",
    "Cleaning",
    "Mechanical / Alignment / Inspection",
    "General / Other",
}


def main() -> None:
    db = SessionLocal()
    try:
        thematic = (
            db.query(PMChecklist)
            .filter(PMChecklist.name.in_(THEMATIC_NAMES))
            .order_by(PMChecklist.id)
            .all()
        )
        old = (
            db.query(PMChecklist)
            .filter(~PMChecklist.name.in_(THEMATIC_NAMES))
            .order_by(PMChecklist.id)
            .all()
        )
        old_ids = [c.id for c in old]
        thematic_ids = [c.id for c in thematic]

        # Machines that currently have any PM assignment (before wipe)
        prev_machine_ids = sorted(
            {
                m_id
                for (m_id,) in db.query(PMMachineAssignment.machine_id).distinct().all()
            }
        )
        print(f"Prev assigned machines ({len(prev_machine_ids)}): {prev_machine_ids}")
        print(f"Old machine-named checklists: {len(old_ids)}")
        print(f"Thematic checklists: {len(thematic_ids)}")

        # --- wipe ALL PM operational data (submissions → schedules → items → assignments) ---
        sub_n = db.query(PMCheckpointSubmission).delete(synchronize_session=False)
        # schedules may remain if orphaned; delete all
        sch_n = db.query(PMSchedule).delete(synchronize_session=False)
        ai_n = db.query(PMAssignmentItem).delete(synchronize_session=False)
        asg_n = db.query(PMMachineAssignment).delete(synchronize_session=False)
        print(f"Deleted submissions={sub_n}, schedules={sch_n}, assignment_items={ai_n}, assignments={asg_n}")

        # --- delete old checklist items + checklists ---
        if old_ids:
            # assignment_items already gone; checklist_item FK has no ondelete cascade from items side for assignments
            item_n = (
                db.query(PMChecklistItem)
                .filter(PMChecklistItem.checklist_id.in_(old_ids))
                .delete(synchronize_session=False)
            )
            cl_n = (
                db.query(PMChecklist)
                .filter(PMChecklist.id.in_(old_ids))
                .delete(synchronize_session=False)
            )
            print(f"Deleted old checklist_items={item_n}, old checklists={cl_n}")
        else:
            print("No old machine-named checklists to delete")

        # Ensure thematic created_by = 16
        for c in thematic:
            c.created_by = USER_ID
        db.flush()

        # Refresh thematic with items
        thematic = (
            db.query(PMChecklist)
            .filter(PMChecklist.name.in_(THEMATIC_NAMES))
            .order_by(PMChecklist.id)
            .all()
        )
        if not thematic:
            raise SystemExit("No thematic checklists found — abort assign step")
        if not prev_machine_ids:
            # fallback: no prior machines — nothing to assign
            db.commit()
            print("No previous machines to re-assign. Done (cleanup only).")
            return

        assigned_count = 0
        checkpoint_links = 0
        for machine_id in prev_machine_ids:
            for checklist in thematic:
                items = (
                    db.query(PMChecklistItem)
                    .filter(PMChecklistItem.checklist_id == checklist.id)
                    .order_by(PMChecklistItem.sequence_number)
                    .all()
                )
                if not items:
                    continue
                assignment = PMMachineAssignment(
                    machine_id=machine_id,
                    checklist_id=checklist.id,
                    assigned_by=USER_ID,
                )
                db.add(assignment)
                db.flush()
                for item in items:
                    ai = PMAssignmentItem(
                        assignment_id=assignment.id,
                        checklist_item_id=item.id,
                        is_required=True,
                    )
                    db.add(ai)
                    db.flush()
                    create_initial_schedule(db, ai)
                    checkpoint_links += 1
                assigned_count += 1

        db.commit()
        print("=== DONE ===")
        print(f"Thematic checklists kept: {len(thematic)} (created_by={USER_ID})")
        for c in thematic:
            n = db.query(PMChecklistItem).filter(PMChecklistItem.checklist_id == c.id).count()
            print(f"  id={c.id} {c.name} items={n}")
        print(f"New assignments created: {assigned_count} (machines×checklists)")
        print(f"Assignment checkpoints + schedules: {checkpoint_links}")
        print(f"assigned_by / created_by user_id={USER_ID}")
        print(
            "Remaining totals:",
            "checklists=", db.query(PMChecklist).count(),
            "items=", db.query(PMChecklistItem).count(),
            "assignments=", db.query(PMMachineAssignment).count(),
            "assignment_items=", db.query(PMAssignmentItem).count(),
            "schedules=", db.query(PMSchedule).count(),
            "submissions=", db.query(PMCheckpointSubmission).count(),
        )
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
