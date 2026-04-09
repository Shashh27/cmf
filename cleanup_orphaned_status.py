#!/usr/bin/env python3
"""
Cleanup script to remove orphaned operation status entries
This removes operation_status entries that don't have corresponding planned_schedule_items
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from DB.database import SessionLocal
from DB.models.scheduling import OperationStatus
from sqlalchemy import text


def cleanup_orphaned_operation_status():
    """Remove operation status entries that don't have planned schedule items"""
    db = SessionLocal()
    
    try:
        print("Cleaning up orphaned operation status entries...")
        
        # Find orphaned entries
        orphaned = db.execute(text("""
            SELECT 
                os.id,
                os.operation_id,
                os.order_id,
                os.part_id,
                os.status,
                os.created_at
            FROM scheduling.operation_status os
            LEFT JOIN scheduling.planned_schedule_items psi ON os.operation_id = psi.operation_id
            WHERE psi.operation_id IS NULL
            ORDER BY os.created_at DESC
        """)).fetchall()
        
        if not orphaned:
            print("No orphaned operation status entries found.")
            return True
        
        print(f"Found {len(orphaned)} orphaned operation status entries:")
        for row in orphaned:
            print(f"  Op {row.operation_id}: Order {row.order_id}, Part {row.part_id}, Status {row.status}")
        
        # Remove orphaned entries
        operation_ids_to_delete = [row.operation_id for row in orphaned]
        deleted_count = db.query(OperationStatus).filter(
            OperationStatus.operation_id.in_(operation_ids_to_delete)
        ).delete(synchronize_session=False)
        
        db.commit()
        
        print(f"\nDeleted {deleted_count} orphaned operation status entries")
        
        # Verify cleanup
        remaining_orphaned = db.execute(text("""
            SELECT COUNT(*) as count
            FROM scheduling.operation_status os
            LEFT JOIN scheduling.planned_schedule_items psi ON os.operation_id = psi.operation_id
            WHERE psi.operation_id IS NULL
        """)).fetchone()
        
        print(f"Remaining orphaned entries: {remaining_orphaned.count}")
        
        # Show final state
        planned = db.execute(text("""
            SELECT 
                COUNT(*) as total_items,
                COUNT(DISTINCT operation_id) as unique_ops,
                COUNT(DISTINCT sale_order_id) as unique_orders
            FROM scheduling.planned_schedule_items
        """)).fetchone()
        
        status = db.execute(text("""
            SELECT 
                COUNT(*) as total_status,
                COUNT(DISTINCT operation_id) as unique_ops,
                COUNT(DISTINCT order_id) as unique_orders
            FROM scheduling.operation_status
        """)).fetchone()
        
        print(f"\nFinal state:")
        print(f"Planned items: {planned.total_items} items, {planned.unique_ops} ops, {planned.unique_orders} orders")
        print(f"Operation status: {status.total_status} entries, {status.unique_ops} ops, {status.unique_orders} orders")
        
        return remaining_orphaned.count == 0
        
    except Exception as e:
        print(f"Cleanup failed: {str(e)}")
        db.rollback()
        return False
        
    finally:
        db.close()


def test_deactivation_cleanup():
    """Test that the deactivation cleanup logic works"""
    db = SessionLocal()
    
    try:
        print("\nTesting deactivation cleanup logic...")
        
        # Get a sample active order with planned items
        sample = db.execute(text("""
            SELECT DISTINCT 
                psi.sale_order_id,
                psi.part_id,
                COUNT(*) as item_count
            FROM scheduling.planned_schedule_items psi
            JOIN scheduling.operation_status os ON psi.operation_id = os.operation_id
            WHERE psi.sale_order_id IN (
                SELECT sale_order_id FROM scheduling.planned_schedule_items 
                GROUP BY sale_order_id 
                HAVING COUNT(*) > 2
            )
            GROUP BY psi.sale_order_id, psi.part_id
            LIMIT 1
        """)).fetchone()
        
        if not sample:
            print("No suitable sample found for testing")
            return True
        
        print(f"Testing with Order {sample.sale_order_id}, Part {sample.part_id} ({sample.item_count} items)")
        
        # Simulate deactivation by removing planned items for this part
        deleted_items = db.execute(text("""
            DELETE FROM scheduling.planned_schedule_items 
            WHERE sale_order_id = :order_id AND part_id = :part_id
            RETURNING operation_id
        """), {"order_id": sample.sale_order_id, "part_id": sample.part_id}).fetchall()
        
        print(f"Removed {len(deleted_items)} planned schedule items")
        
        # Now test the cleanup logic
        operations_to_cleanup = db.execute(text("""
            SELECT DISTINCT os.operation_id
            FROM scheduling.operation_status os
            LEFT JOIN scheduling.planned_schedule_items psi ON os.operation_id = psi.operation_id
            WHERE os.part_id = :part_id 
            AND os.order_id = :order_id
            AND psi.operation_id IS NULL
        """), {"part_id": sample.part_id, "order_id": sample.sale_order_id}).fetchall()
        
        print(f"Found {len(operations_to_cleanup)} operations to cleanup")
        
        if operations_to_cleanup:
            operation_ids_to_delete = [op[0] for op in operations_to_cleanup]
            deleted_count = db.query(OperationStatus).filter(
                OperationStatus.operation_id.in_(operation_ids_to_delete)
            ).delete(synchronize_session=False)
            
            print(f"Cleaned up {deleted_count} operation status entries")
            
        db.commit()
        
        # Verify no orphaned entries for this part
        remaining = db.execute(text("""
            SELECT COUNT(*) as count
            FROM scheduling.operation_status os
            LEFT JOIN scheduling.planned_schedule_items psi ON os.operation_id = psi.operation_id
            WHERE os.part_id = :part_id 
            AND os.order_id = :order_id
            AND psi.operation_id IS NULL
        """), {"part_id": sample.part_id, "order_id": sample.sale_order_id}).fetchone()
        
        print(f"Remaining orphaned for this part: {remaining.count}")
        
        return remaining.count == 0
        
    except Exception as e:
        print(f"Test failed: {str(e)}")
        db.rollback()
        return False
        
    finally:
        db.close()


if __name__ == "__main__":
    print("Operation Status Cleanup Script")
    print("=" * 40)
    
    # Clean up existing orphaned entries
    success1 = cleanup_orphaned_operation_status()
    
    if success1:
        # Test the cleanup logic
        success2 = test_deactivation_cleanup()
        
        if success2:
            print("\n" + "=" * 40)
            print("CLEANUP COMPLETED SUCCESSFULLY")
            print("Deactivation cleanup logic is working correctly")
            sys.exit(0)
        else:
            print("\nTest failed")
            sys.exit(1)
    else:
        print("\nCleanup failed")
        sys.exit(1)
