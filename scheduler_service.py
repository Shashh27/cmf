from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import text
from datetime import date
import logging

from DB.database import engine
from DB.models.notifications import MachineCalibrationNotification as MachineCalibrationNotificationModel
from DB.models.notifications import PMMissedNotification

logger = logging.getLogger(__name__)

# Global scheduler instance
scheduler = BackgroundScheduler()


def generate_calibration_notifications():
    """
    Scheduled job to generate machine calibration notifications.
    Runs daily to check for machines with calibration due within 10 days.
    """
    try:
        from sqlalchemy.orm import sessionmaker
        SessionLocal = sessionmaker(bind=engine)
        db = SessionLocal()

        try:
            rows = db.execute(text("""
                SELECT id, calibration_due_date
                FROM configuration.machines
                WHERE calibration_due_date IS NOT NULL
                  AND calibration_due_date::date >= CURRENT_DATE
                  AND calibration_due_date::date <= (CURRENT_DATE + INTERVAL '10 days')
            """)).fetchall()

            for r in rows:
                machine_id = int(r[0])
                exists = db.query(MachineCalibrationNotificationModel)\
                    .filter(MachineCalibrationNotificationModel.machine_id == machine_id).first()
                if exists:
                    continue
                notif = MachineCalibrationNotificationModel(machine_id=machine_id, is_ack=False)
                db.add(notif)

            db.commit()

        except Exception as e:
            db.rollback()
            logger.error(f"Error during notification generation: {e}")
        finally:
            db.close()

    except Exception as e:
        logger.error(f"Error creating database session: {e}")


def generate_pm_missed_notifications():
    """
    After shift end (5 PM): create notifications for compulsory PM checkpoints
    that are due today (or earlier) and have no submission for that due day.
    Visible to Admin/MC via GET /pm/missed-notifications.
    """
    try:
        from sqlalchemy.orm import sessionmaker, joinedload
        from sqlalchemy import func as sa_func
        from DB.models.configuration import (
            PMAssignmentItem, PMMachineAssignment, PMCheckpointSubmission,
        )
        from services.pm_service import is_checkpoint_due

        SessionLocal = sessionmaker(bind=engine)
        db = SessionLocal()
        today = date.today()

        try:
            items = (
                db.query(PMAssignmentItem)
                .options(
                    joinedload(PMAssignmentItem.checklist_item),
                    joinedload(PMAssignmentItem.schedule),
                    joinedload(PMAssignmentItem.assignment).joinedload(PMMachineAssignment.machine),
                    joinedload(PMAssignmentItem.assignment).joinedload(PMMachineAssignment.checklist),
                )
                .filter(PMAssignmentItem.is_compulsory.is_(True), PMAssignmentItem.is_required.is_(True))
                .all()
            )

            created = 0
            for ai in items:
                schedule = ai.schedule
                assignment = ai.assignment
                ci = ai.checklist_item
                if not schedule or not assignment or not ci:
                    continue
                if not is_checkpoint_due(ai, schedule, today):
                    continue

                submitted_today = (
                    db.query(PMCheckpointSubmission.id)
                    .filter(
                        PMCheckpointSubmission.assignment_item_id == ai.id,
                        sa_func.date(PMCheckpointSubmission.submitted_at) == today,
                    )
                    .first()
                )
                if submitted_today:
                    continue

                exists = (
                    db.query(PMMissedNotification)
                    .filter(
                        PMMissedNotification.assignment_item_id == ai.id,
                        PMMissedNotification.due_date == today,
                    )
                    .first()
                )
                if exists:
                    continue

                machine = assignment.machine
                machine_label = None
                if machine:
                    if getattr(machine, "make", None) and getattr(machine, "model", None):
                        machine_label = f"{machine.make} - {machine.model}"
                    else:
                        machine_label = getattr(machine, "make", None) or f"Machine #{assignment.machine_id}"

                checklist_name = assignment.checklist.name if assignment.checklist else None
                msg = (
                    f"Compulsory PM not submitted: {ci.item_text} "
                    f"on {machine_label or assignment.machine_id} (due {schedule.next_due_date})"
                )
                db.add(PMMissedNotification(
                    assignment_item_id=ai.id,
                    machine_id=assignment.machine_id,
                    checklist_id=assignment.checklist_id,
                    due_date=today,
                    item_text=ci.item_text,
                    machine_label=machine_label,
                    checklist_name=checklist_name,
                    message=msg,
                    is_ack=False,
                ))
                created += 1

            db.commit()
            if created:
                logger.info("Created %s PM missed notifications for %s", created, today)

        except Exception as e:
            db.rollback()
            logger.error(f"Error during PM missed notification generation: {e}")
        finally:
            db.close()

    except Exception as e:
        logger.error(f"Error creating database session for PM missed job: {e}")


def start_scheduler():
    """
    Start the APScheduler with calibration + PM missed-notification jobs.
    """
    try:
        scheduler.add_job(
            generate_calibration_notifications,
            trigger=CronTrigger(hour=9, minute=0),
            id='calibration_notification_job',
            name='Generate Calibration Notifications',
            replace_existing=True,
        )
        # End of shift 5 PM (server local time — set TZ=Asia/Kolkata in prod)
        scheduler.add_job(
            generate_pm_missed_notifications,
            trigger=CronTrigger(hour=17, minute=0),
            id='pm_missed_notification_job',
            name='Generate PM Missed Compulsory Notifications',
            replace_existing=True,
        )

        scheduler.start()
        logger.info("Scheduler started successfully")

    except Exception as e:
        logger.error(f"Error starting scheduler: {e}")


def stop_scheduler():
    try:
        scheduler.shutdown()
        logger.info("Scheduler stopped successfully")
    except Exception as e:
        logger.error(f"Error stopping scheduler: {e}")
