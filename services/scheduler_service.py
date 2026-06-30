"""
APS Scheduler service for calculating next due dates for Pokayoke checkpoints.
This service runs periodically to update next_due_date based on checkpoint frequencies.
"""

from datetime import datetime, date, timedelta
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy.orm import Session
from DB.database import get_db
from DB.models.configuration import PokayokeChecklistItem, PokayokeMachineAssignment, PokayokeCompletedLog, PokayokeItemResponse
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

scheduler = BackgroundScheduler()

def calculate_next_due_date(frequency_type, interval_value, interval_unit, trigger_hours, inspection_interval, current_date=None):
    """
    Calculate the next due date based on frequency settings.
    
    Args:
        frequency_type: 'Time Based', 'Usage Based', 'Condition Based'
        interval_value: e.g., 3 for "Every 3 Months"
        interval_unit: 'Day', 'Week', 'Month', 'Year'
        trigger_hours: For Usage Based (e.g., 200 hours)
        inspection_interval: For Condition Based (e.g., 'Weekly', 'Monthly')
        current_date: Base date for calculation (defaults to today)
    
    Returns:
        datetime or None: Next due date or None if cannot calculate
    """
    if current_date is None:
        current_date = date.today()
    
    if frequency_type == 'Time Based':
        if interval_value and interval_unit:
            if interval_unit == 'Day':
                return current_date + timedelta(days=interval_value)
            elif interval_unit == 'Week':
                return current_date + timedelta(weeks=interval_value)
            elif interval_unit == 'Month':
                # Add months manually to handle month boundaries
                new_month = current_date.month - 1 + interval_value
                year = current_date.year + new_month // 12
                month = new_month % 12 + 1
                # Keep the same day, but handle end-of-month
                day = min(current_date.day, [31, 29 if year % 4 == 0 else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1])
                return date(year, month, day)
            elif interval_unit == 'Year':
                return date(current_date.year + interval_value, current_date.month, current_date.day)
    
    elif frequency_type == 'Usage Based':
        # Usage based requires machine runtime data - this is a placeholder
        # In production, this would query machine usage data
        logger.warning("Usage Based frequency requires machine runtime data - not implemented")
        return None
    
    elif frequency_type == 'Condition Based':
        # Condition based items also use interval_value and interval_unit for next due date calculation
        if interval_value and interval_unit:
            if interval_unit == 'Day':
                return current_date + timedelta(days=interval_value)
            elif interval_unit == 'Week':
                return current_date + timedelta(weeks=interval_value)
            elif interval_unit == 'Month':
                # Add months manually to handle month boundaries
                new_month = current_date.month - 1 + interval_value
                year = current_date.year + new_month // 12
                month = new_month % 12 + 1
                # Keep the same day, but handle end-of-month
                day = min(current_date.day, [31, 29 if year % 4 == 0 else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1])
                return date(year, month, day)
            elif interval_unit == 'Year':
                return date(current_date.year + interval_value, current_date.month, current_date.day)
    
    return None

def update_item_response_due_dates():
    """
    Update next_due_date for item responses based on their frequency settings.
    This function is called by the APS scheduler.
    """
    logger.info("Starting item response due date update...")
    
    db: Session = next(get_db())
    try:
        # Get all item responses without next_due_date
        from DB.models.configuration import PokayokeItemResponse
        responses = db.query(PokayokeItemResponse).filter(
            PokayokeItemResponse.next_due_date.is_(None)
        ).all()
        
        updated_count = 0
        for response in responses:
            # Calculate next due date
            next_due = calculate_next_due_date(
                frequency_type=response.frequency_type,
                interval_value=response.interval_value,
                interval_unit=response.interval_unit,
                trigger_hours=response.trigger_hours,
                inspection_interval=response.inspection_interval,
                current_date=date.today()
            )
            
            if next_due:
                response.next_due_date = next_due
                updated_count += 1
                logger.debug(f"Response {response.id}: Next due date set to {next_due}")
        
        db.commit()
        logger.info(f"Updated {updated_count} item response due dates")
        
    except Exception as e:
        logger.error(f"Error updating item response due dates: {e}")
        db.rollback()
    finally:
        db.close()

def start_scheduler():
    """
    Start the APS scheduler with scheduled jobs.
    """
    # Schedule item response due date updates - run daily
    scheduler.add_job(
        update_item_response_due_dates,
        trigger=IntervalTrigger(hours=24),
        id='update_item_response_due_dates',
        name='Update Item Response Due Dates',
        replace_existing=True
    )
    
    scheduler.start()
    logger.info("APS Scheduler started successfully")

def stop_scheduler():
    """
    Stop the APS scheduler.
    """
    scheduler.shutdown()
    logger.info("APS Scheduler stopped")

if __name__ == "__main__":
    # For testing purposes
    start_scheduler()
    try:
        # Keep the script running
        import time
        while True:
            time.sleep(60)
    except (KeyboardInterrupt, SystemExit):
        stop_scheduler()
