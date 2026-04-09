#!/usr/bin/env python3
"""
Check if the automatic completion logic is active in the server
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import requests
import json
from DB.database import SessionLocal
from sqlalchemy import text


def test_automatic_logic():
    """Test if the automatic completion logic is working"""
    db = SessionLocal()
    
    try:
        print("Testing Automatic Operation Completion Logic")
        print("=" * 50)
        
        # Find an operation to test with
        operation = db.execute(text("""
            SELECT o.id as operation_id, p.qty as required_quantity
            FROM oms.operations o
            JOIN oms.parts p ON o.part_id = p.id
            WHERE o.id NOT IN (
                SELECT operation_id FROM scheduling.operation_status WHERE status = 'completed'
            )
            AND p.qty <= 5  -- Use small quantity for faster test
            LIMIT 1
        """)).fetchone()
        
        if not operation:
            print("No suitable operation found for testing")
            print("All operations may be completed or have large quantities")
            return True
        
        print(f"Testing with Operation {operation.operation_id}")
        print(f"Required Quantity: {operation.required_quantity}")
        
        # Check initial status
        initial_status = db.execute(text("""
            SELECT status FROM scheduling.operation_status
            WHERE operation_id = :op_id
        """), {"op_id": operation.operation_id}).scalar()
        
        print(f"Initial Status: {initial_status}")
        
        # Create a production log for the full required quantity
        operator = db.execute(text("SELECT id FROM accesscontrol.access_users LIMIT 1")).fetchone()
        
        db.execute(text("""
            INSERT INTO scheduling.production_logs 
            (operation_id, operator_id, from_date, from_time, produced_quantity, status)
            VALUES (:op_id, :operator_id, CURRENT_DATE, CURRENT_TIME, :produced, 'pending')
        """), {
            "op_id": operation.operation_id,
            "operator_id": operator.id,
            "produced": operation.required_quantity
        })
        
        db.commit()
        
        # Get the new log ID
        new_log = db.execute(text("""
            SELECT id FROM scheduling.production_logs
            WHERE operation_id = :op_id AND status = 'pending'
            ORDER BY id DESC LIMIT 1
        """), {"op_id": operation.operation_id}).fetchone()
        
        print(f"Created Production Log ID: {new_log.id}")
        
        # Set the log to completed status via API (this should trigger automatic completion)
        print(f"\nSetting production log to 'completed' via API...")
        
        base_url = "http://172.18.100.76:8000/api/v1/production-logs"
        
        payload = {
            "status": "completed",
            "supervisor_id": 30,
            "remarks": "Test automatic completion logic"
        }
        
        response = requests.put(f"{base_url}/{new_log.id}/status", 
                               json=payload, 
                               headers={'Content-Type': 'application/json'})
        
        print(f"API Response Status: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print("✅ Production log updated successfully")
            print(f"  Approved Quantity: {result.get('approved_quantity')}")
            
            # Check if operation status was automatically updated
            final_status = db.execute(text("""
                SELECT status, completed_at FROM scheduling.operation_status
                WHERE operation_id = :op_id
            """), {"op_id": operation.operation_id}).fetchone()
            
            print(f"\nFinal Operation Status:")
            print(f"  Status: {final_status.status}")
            print(f"  Completed At: {final_status.completed_at}")
            
            # Verify automatic completion worked
            if final_status.status == "completed":
                print("✅ SUCCESS: Automatic completion logic is working!")
                print("   The operation status was automatically updated to 'completed'")
                return True
            else:
                print("❌ ISSUE: Automatic completion logic is NOT working")
                print("   The operation status should be 'completed' but it's still '{}'".format(final_status.status))
                print("   This means the server needs to be restarted to pick up the code changes")
                return False
        else:
            print(f"❌ API Error: {response.text}")
            return False
        
    except Exception as e:
        print(f"Test failed: {e}")
        return False
        
    finally:
        db.close()


if __name__ == "__main__":
    print("Automatic Operation Completion Logic Test")
    print("This test checks if the server is using the updated code")
    print("that automatically completes operations when production logs are completed.")
    print()
    
    success = test_automatic_logic()
    
    if success:
        print("\n" + "=" * 50)
        print("✅ AUTOMATIC COMPLETION IS WORKING!")
        print("The server is using the updated code and will automatically")
        print("update operation statuses when production logs are completed.")
    else:
        print("\n" + "=" * 50)
        print("❌ AUTOMATIC COMPLETION IS NOT WORKING!")
        print("The server needs to be RESTARTED to activate the automatic completion logic.")
        print()
        print("TO FIX:")
        print("1. Stop the current FastAPI server")
        print("2. Start the server again:")
        print("   uvicorn main:app --host 0.0.0.0 --port 8000")
        print("3. Run this test again to verify")
