from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import text
import logging

from DB.database import engine
from DB.models.notifications import MachineCalibrationNotification as MachineCalibrationNotificationModel

logger = logging.getLogger(__name__)

# Global scheduler instance
scheduler = BackgroundScheduler()


def generate_calibration_notifications():
    """
    Scheduled job to generate machine calibration notifications.
    Runs daily to check for machines with calibration due within 10 days.
    """
    try:
        # Create a new session for this task
        from sqlalchemy.orm import sessionmaker
        SessionLocal = sessionmaker(bind=engine)
        db = SessionLocal()

        try:
            # Query machines with calibration due within 10 days
            rows = db.execute(text("""
                SELECT id, calibration_due_date
                FROM configuration.machines
                WHERE calibration_due_date IS NOT NULL
                  AND calibration_due_date::date >= CURRENT_DATE
                  AND calibration_due_date::date <= (CURRENT_DATE + INTERVAL '10 days')
            """)).fetchall()

            for r in rows:
                machine_id = int(r[0])

                # Check if notification already exists for this machine
                exists = db.query(MachineCalibrationNotificationModel)\
                    .filter(MachineCalibrationNotificationModel.machine_id == machine_id).first()

                if exists:
                    continue

                # Create new notification
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


def start_scheduler():
    """
    Start the APScheduler with the calibration notification job.
    """
    try:
        # Add the job to run daily at 9:00 AM
        scheduler.add_job(
            generate_calibration_notifications,
            trigger=CronTrigger(hour=9, minute=0),  # Runs daily at 9:00 AM
            id='calibration_notification_job',
            name='Generate Calibration Notifications',
            replace_existing=True
        )

        scheduler.start()
        logger.info("Scheduler started successfully")

    except Exception as e:
        logger.error(f"Error starting scheduler: {e}")


def stop_scheduler():
    """
    Stop the APScheduler.
    """
    try:
        scheduler.shutdown()
        logger.info("Scheduler stopped successfully")
    except Exception as e:
        logger.error(f"Error stopping scheduler: {e}")
