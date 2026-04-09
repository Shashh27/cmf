#!/usr/bin/env python3
"""
Operation Status Cleanup Utility
Provides functions to maintain data integrity between planned_schedule_items and operation_status tables
"""

import sys
import os
from datetime import datetime

# Add the parent directory to the path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from DB.database import SessionLocal
from DB.models.scheduling import OperationStatus
from sqlalchemy import text


def cleanup_orphaned_operation_status(db: SessionLocal = None) -> dict:
    """
    Remove operation status entries that don't have corresponding planned schedule items.
    
    Args:
        db: Database session (optional, will create one if not provided)
    
    Returns:
        dict: Cleanup results with counts and status
    """
    should_close_db = False
    if db is None:
        db = SessionLocal()
        should_close_db = True
    
    try:
        # Find orphaned entries
        orphaned = db.execute(text("""
            SELECT 
                COUNT(*) as count,
                COUNT(DISTINCT operation_id) as unique_ops,
                COUNT(DISTINCT order_id) as unique_orders,
                COUNT(DISTINCT part_id) as unique_parts
            FROM scheduling.operation_status os
            LEFT JOIN scheduling.planned_schedule_items psi ON os.operation_id = psi.operation_id
            WHERE psi.operation_id IS NULL
        """)).fetchone()
        
        if orphaned.count == 0:
            return {
                "success": True,
                "cleaned_count": 0,
                "message": "No orphaned operation status entries found",
                "timestamp": datetime.now()
            }
        
        # Get details before cleanup
        orphaned_details = db.execute(text("""
            SELECT 
                os.operation_id,
                os.order_id,
                os.part_id,
                os.status,
                os.created_at
            FROM scheduling.operation_status os
            LEFT JOIN scheduling.planned_schedule_items psi ON os.operation_id = psi.operation_id
            WHERE psi.operation_id IS NULL
            ORDER BY os.created_at DESC
            LIMIT 10
        """)).fetchall()
        
        # Remove orphaned entries
        operation_ids_to_delete = db.execute(text("""
            SELECT DISTINCT os.operation_id
            FROM scheduling.operation_status os
            LEFT JOIN scheduling.planned_schedule_items psi ON os.operation_id = psi.operation_id
            WHERE psi.operation_id IS NULL
        """)).fetchall()
        
        operation_ids = [op[0] for op in operation_ids_to_delete]
        deleted_count = db.query(OperationStatus).filter(
            OperationStatus.operation_id.in_(operation_ids)
        ).delete(synchronize_session=False)
        
        db.commit()
        
        return {
            "success": True,
            "cleaned_count": deleted_count,
            "orphaned_before": {
                "total_entries": orphaned.count,
                "unique_operations": orphaned.unique_ops,
                "unique_orders": orphaned.unique_orders,
                "unique_parts": orphaned.unique_parts
            },
            "sample_orphaned": [
                {
                    "operation_id": row.operation_id,
                    "order_id": row.order_id,
                    "part_id": row.part_id,
                    "status": row.status,
                    "created_at": row.created_at
                }
                for row in orphaned_details
            ],
            "message": f"Cleaned up {deleted_count} orphaned operation status entries",
            "timestamp": datetime.now()
        }
        
    except Exception as e:
        db.rollback()
        return {
            "success": False,
            "cleaned_count": 0,
            "error": str(e),
            "message": f"Cleanup failed: {str(e)}",
            "timestamp": datetime.now()
        }
        
    finally:
        if should_close_db:
            db.close()


def get_data_integrity_report(db: SessionLocal = None) -> dict:
    """
    Get a report on data integrity between planned_schedule_items and operation_status tables.
    
    Args:
        db: Database session (optional, will create one if not provided)
    
    Returns:
        dict: Data integrity report
    """
    should_close_db = False
    if db is None:
        db = SessionLocal()
        should_close_db = True
    
    try:
        # Get current state of both tables
        planned_stats = db.execute(text("""
            SELECT 
                COUNT(*) as total_items,
                COUNT(DISTINCT operation_id) as unique_ops,
                COUNT(DISTINCT sale_order_id) as unique_orders,
                COUNT(DISTINCT part_id) as unique_parts
            FROM scheduling.planned_schedule_items
        """)).fetchone()
        
        status_stats = db.execute(text("""
            SELECT 
                COUNT(*) as total_entries,
                COUNT(DISTINCT operation_id) as unique_ops,
                COUNT(DISTINCT order_id) as unique_orders,
                COUNT(DISTINCT part_id) as unique_parts
            FROM scheduling.operation_status
        """)).fetchone()
        
        # Check for mismatches
        orphaned_status = db.execute(text("""
            SELECT COUNT(*) as count
            FROM scheduling.operation_status os
            LEFT JOIN scheduling.planned_schedule_items psi ON os.operation_id = psi.operation_id
            WHERE psi.operation_id IS NULL
        """)).fetchone()
        
        missing_status = db.execute(text("""
            SELECT COUNT(*) as count
            FROM scheduling.planned_schedule_items psi
            LEFT JOIN scheduling.operation_status os ON psi.operation_id = os.operation_id
            WHERE os.operation_id IS NULL
        """)).fetchone()
        
        # Get status distribution
        status_distribution = db.execute(text("""
            SELECT 
                status,
                COUNT(*) as count
            FROM scheduling.operation_status
            GROUP BY status
            ORDER BY count DESC
        """)).fetchall()
        
        return {
            "success": True,
            "planned_schedule_items": {
                "total_items": planned_stats.total_items,
                "unique_operations": planned_stats.unique_ops,
                "unique_orders": planned_stats.unique_orders,
                "unique_parts": planned_stats.unique_parts
            },
            "operation_status": {
                "total_entries": status_stats.total_entries,
                "unique_operations": status_stats.unique_ops,
                "unique_orders": status_stats.unique_orders,
                "unique_parts": status_stats.unique_parts
            },
            "integrity_issues": {
                "orphaned_status_entries": orphaned_status.count,
                "planned_items_without_status": missing_status.count
            },
            "status_distribution": [
                {"status": row.status, "count": row.count}
                for row in status_distribution
            ],
            "data_integrity_score": 100 - (orphaned_status.count + missing_status.count),
            "timestamp": datetime.now()
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "message": f"Failed to generate integrity report: {str(e)}",
            "timestamp": datetime.now()
        }
        
    finally:
        if should_close_db:
            db.close()


def cleanup_for_inactive_orders(db: SessionLocal = None) -> dict:
    """
    Clean up operation status entries for orders that have no active parts.
    
    Args:
        db: Database session (optional, will create one if not provided)
    
    Returns:
        dict: Cleanup results
    """
    should_close_db = False
    if db is None:
        db = SessionLocal()
        should_close_db = True
    
    try:
        # Find orders with no active parts but have operation status entries
        inactive_orders_with_status = db.execute(text("""
            SELECT DISTINCT os.order_id
            FROM scheduling.operation_status os
            LEFT JOIN scheduling.part_schedule_status pss ON os.order_id = pss.sale_order_id
            WHERE pss.sale_order_id IS NULL 
            OR pss.status != 'active'
        """)).fetchall()
        
        if not inactive_orders_with_status:
            return {
                "success": True,
                "cleaned_count": 0,
                "message": "No inactive orders with operation status entries found",
                "timestamp": datetime.now()
            }
        
        # Clean up operation status entries for these orders
        order_ids = [order[0] for order in inactive_orders_with_status]
        deleted_count = db.query(OperationStatus).filter(
            OperationStatus.order_id.in_(order_ids)
        ).delete(synchronize_session=False)
        
        db.commit()
        
        return {
            "success": True,
            "cleaned_count": deleted_count,
            "inactive_orders_processed": len(order_ids),
            "message": f"Cleaned up {deleted_count} operation status entries for {len(order_ids)} inactive orders",
            "timestamp": datetime.now()
        }
        
    except Exception as e:
        db.rollback()
        return {
            "success": False,
            "cleaned_count": 0,
            "error": str(e),
            "message": f"Inactive order cleanup failed: {str(e)}",
            "timestamp": datetime.now()
        }
        
    finally:
        if should_close_db:
            db.close()


if __name__ == "__main__":
    print("Operation Status Cleanup Utility")
    print("=" * 40)
    
    # Get current state
    print("1. Getting data integrity report...")
    report = get_data_integrity_report()
    
    if report["success"]:
        print(f"Planned items: {report['planned_schedule_items']['total_items']}")
        print(f"Operation status: {report['operation_status']['total_entries']}")
        print(f"Orphaned status entries: {report['integrity_issues']['orphaned_status_entries']}")
        print(f"Missing status entries: {report['integrity_issues']['planned_items_without_status']}")
        print(f"Data integrity score: {report['data_integrity_score']}%")
        
        # Clean up if needed
        if report["integrity_issues"]["orphaned_status_entries"] > 0:
            print("\n2. Cleaning up orphaned entries...")
            cleanup_result = cleanup_orphaned_operation_status()
            
            if cleanup_result["success"]:
                print(f"Cleaned up {cleanup_result['cleaned_count']} orphaned entries")
            else:
                print(f"Cleanup failed: {cleanup_result['error']}")
        
        # Clean up inactive orders
        print("\n3. Cleaning up inactive orders...")
        inactive_cleanup = cleanup_for_inactive_orders()
        
        if inactive_cleanup["success"]:
            print(f"Cleaned up {inactive_cleanup['cleaned_count']} entries for inactive orders")
        else:
            print(f"Inactive cleanup failed: {inactive_cleanup['error']}")
        
        print("\n" + "=" * 40)
        print("Cleanup completed successfully")
    else:
        print(f"Failed to get report: {report['error']}")
