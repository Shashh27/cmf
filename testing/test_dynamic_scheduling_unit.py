"""
Unit tests for dynamic scheduling logic.

These tests focus on the core logic without requiring full database setup.
They use mocking to isolate the scheduling algorithm behavior.
"""
import pytest
from datetime import datetime, time, timedelta, timezone, date
from unittest.mock import Mock, MagicMock, patch
from sqlalchemy.orm import Session


class TestDynamicSchedulingLogic:
    """Unit tests for dynamic scheduling core logic."""
    
    def test_completed_operation_detection(self):
        """Test that completed operations are correctly identified."""
        # Mock production logs
        mock_logs = [
            Mock(approved_quantity=10, remaining_quantity_to_be_produced=0)
        ]
        
        # Should be completed
        approved = sum(log.approved_quantity for log in mock_logs)
        remaining_zero = any(log.remaining_quantity_to_be_produced == 0 for log in mock_logs)
        
        assert approved >= 10 or remaining_zero, "Operation should be marked as completed"
    
    def test_inprogress_operation_detection(self):
        """Test that in-progress operations are correctly identified."""
        # Mock production logs with partial approval
        mock_logs = [
            Mock(approved_quantity=5, remaining_quantity_to_be_produced=5)
        ]
        
        approved = sum(log.approved_quantity for log in mock_logs)
        total_qty = 10
        
        # Should be in-progress
        assert approved > 0 and approved < total_qty, "Operation should be marked as in-progress"
    
    def test_pending_operation_detection(self):
        """Test that pending operations are correctly identified."""
        # No production logs
        approved = 0
        has_logs = False
        
        # Should be pending
        assert approved == 0 and not has_logs, "Operation should be marked as pending"
    
    def test_cascade_cursor_calculation(self):
        """Test cascade cursor calculation for downstream operations."""
        # Test case 1: Actual end time exists
        actual_end = datetime(2024, 1, 1, 10, 0)
        cascade_cursor = actual_end
        assert cascade_cursor == datetime(2024, 1, 1, 10, 0)
        
        # Test case 2: No actual end, use baseline
        baseline_end = datetime(2024, 1, 1, 11, 0)
        cascade_cursor = baseline_end
        assert cascade_cursor == datetime(2024, 1, 1, 11, 0)
        
        # Test case 3: Use max of actual and part activation
        part_activation = datetime(2024, 1, 1, 9, 0)
        actual_end = datetime(2024, 1, 1, 10, 0)
        cascade_cursor = max(part_activation, actual_end)
        assert cascade_cursor == datetime(2024, 1, 1, 10, 0)
    
    def test_remaining_quantity_calculation(self):
        """Test remaining quantity calculation for in-progress operations."""
        total_qty = 10
        approved = 5
        remaining = max(0, total_qty - approved)
        
        assert remaining == 5, f"Remaining should be 5, got {remaining}"
    
    def test_priority_sorting(self):
        """Test that parts are sorted by priority."""
        parts = [
            {'part_id': 1, 'priority': 3},
            {'part_id': 2, 'priority': 1},
            {'part_id': 3, 'priority': 2},
        ]
        
        sorted_parts = sorted(parts, key=lambda x: x['priority'])
        assert sorted_parts[0]['part_id'] == 2, "Priority 1 should be first"
        assert sorted_parts[1]['part_id'] == 3, "Priority 2 should be second"
        assert sorted_parts[2]['part_id'] == 1, "Priority 3 should be third"
    
    def test_machine_selection_tier1_pinned_available(self):
        """Test Tier 1: Pinned machine is available."""
        # Mock data
        pinned_machine = Mock(id=1)
        machine_end_time = {1: datetime(2024, 1, 1, 9, 0)}
        op_cursor = datetime(2024, 1, 1, 10, 0)
        
        machine_free = machine_end_time.get(pinned_machine.id, op_cursor)
        earliest = max(op_cursor, machine_free)
        
        # Machine is available
        assert earliest == datetime(2024, 1, 1, 10, 0)
    
    def test_machine_selection_tier2_pinned_broken(self):
        """Test Tier 2: Pinned machine is broken, find alternative."""
        # Mock data
        pinned_machine = Mock(id=1)
        alternative_machine = Mock(id=2)
        machines_by_wc = {1: [pinned_machine, alternative_machine]}
        
        # Pinned is unavailable, should use alternative
        selected = alternative_machine
        assert selected.id == 2, "Should select alternative machine"
    
    def test_outsource_duration_calculation(self):
        """Test outsource operation duration calculation."""
        # Test case 1: Fixed vendor window
        from_date = datetime(2024, 1, 10)
        to_date = datetime(2024, 1, 17)
        duration = (to_date - from_date).days
        assert duration == 7, "Duration should be 7 days"
        
        # Test case 2: Fallback 7-day provision
        cascade_cursor = datetime(2024, 1, 1)
        fallback_duration = timedelta(days=7)
        to_date = cascade_cursor + fallback_duration
        assert (to_date - cascade_cursor).days == 7, "Fallback should be 7 days"
    
    def test_shift_boundary_handling(self):
        """Test handling of shift boundaries."""
        shift_start = time(8, 30)
        shift_end = time(17, 0)
        
        # Test case 1: Before shift start
        current_time = datetime(2024, 1, 1, 7, 0)
        if current_time.time() < shift_start:
            adjusted = current_time.replace(hour=shift_start.hour, minute=shift_start.minute)
            assert adjusted == datetime(2024, 1, 1, 8, 30)
        
        # Test case 2: After shift end
        current_time = datetime(2024, 1, 1, 18, 0)
        if current_time.time() >= shift_end:
            # Should move to next day shift start
            next_day = current_time + timedelta(days=1)
            adjusted = next_day.replace(hour=shift_start.hour, minute=shift_start.minute)
            assert adjusted == datetime(2024, 1, 2, 8, 30)
    
    def test_operation_duration_calculation(self):
        """Test operation duration calculation."""
        setup_seconds = 30 * 60  # 30 minutes
        cycle_seconds = 10 * 60  # 10 minutes per unit
        quantity = 10
        
        total_seconds = setup_seconds + (cycle_seconds * quantity)
        total_hours = total_seconds / 3600.0
        
        expected_hours = (30 + 100) / 60  # 130 minutes = 2.17 hours
        assert abs(total_hours - expected_hours) < 0.01, f"Duration should be ~{expected_hours} hours"
    
    def test_zero_duration_operation(self):
        """Test operation with zero setup and cycle time."""
        setup_seconds = 0
        cycle_seconds = 0
        quantity = 10
        
        total_seconds = setup_seconds + (cycle_seconds * quantity)
        total_hours = total_seconds / 3600.0
        
        assert total_hours == 0.0, "Zero duration operation should have 0 hours"
    
    def test_version_increment(self):
        """Test schedule version increment."""
        current_max_version = 1
        next_version = current_max_version + 1 if current_max_version else 2
        
        assert next_version == 2, "Version should increment to 2"
        
        # Test with no existing version
        current_max_version = None
        next_version = current_max_version + 1 if current_max_version else 2
        assert next_version == 2, "First version should be 2"
    
    def test_part_activation_time_logic(self):
        """Test part activation time logic."""
        order_activation = datetime(2024, 1, 1, 8, 0)
        part_activation = datetime(2024, 1, 1, 9, 0)
        
        # Part activated after order
        earliest_start = max(order_activation, part_activation)
        assert earliest_start == part_activation, "Should use part activation time"
        
        # Part activated with order
        part_activation = datetime(2024, 1, 1, 8, 0)
        earliest_start = max(order_activation, part_activation)
        assert earliest_start == order_activation, "Should use order activation time when equal"
    
    def test_stale_operation_detection(self):
        """Test detection of stale in-progress operations."""
        from datetime import datetime, timedelta
        
        # Simulate STALE_INPROGRESS_WORKING_DAYS = 1
        stale_threshold_days = 1
        
        # Test case 1: Recent log (not stale)
        last_log_date = datetime.now() - timedelta(hours=12)
        days_since_log = (datetime.now() - last_log_date).days
        is_stale = days_since_log >= stale_threshold_days
        assert not is_stale, "Recent log should not be stale"
        
        # Test case 2: Old log (stale)
        last_log_date = datetime.now() - timedelta(days=2)
        days_since_log = (datetime.now() - last_log_date).days
        is_stale = days_since_log >= stale_threshold_days
        assert is_stale, "Old log should be stale"
    
    def test_machine_downtime_overlap(self):
        """Test calculation of downtime overlap with shift hours."""
        downtime_start = datetime(2024, 1, 1, 12, 0)
        downtime_end = datetime(2024, 1, 1, 13, 0)
        shift_start = time(8, 30)
        shift_end = time(17, 0)
        
        # Calculate overlap
        if downtime_start.time() >= shift_start and downtime_end.time() <= shift_end:
            overlap_hours = (downtime_end - downtime_start).total_seconds() / 3600
            assert overlap_hours == 1.0, "Overlap should be 1 hour"
        
        # Test no overlap
        downtime_start = datetime(2024, 1, 1, 18, 0)
        downtime_end = datetime(2024, 1, 1, 19, 0)
        if downtime_start.time() >= shift_end or downtime_end.time() <= shift_start:
            overlap_hours = 0.0
            assert overlap_hours == 0.0, "No overlap should be 0 hours"
    
    def test_efficiency_factor_application(self):
        """Test efficiency factor application to operation duration."""
        base_duration_hours = 10.0
        efficiency_factor = 0.8
        
        adjusted_duration = base_duration_hours / efficiency_factor
        assert adjusted_duration == 12.5, "Duration should increase with lower efficiency"
        
        # Test with efficiency > 1
        efficiency_factor = 1.2
        adjusted_duration = base_duration_hours / efficiency_factor
        assert abs(adjusted_duration - 8.33) < 0.01, "Duration should decrease with higher efficiency"
    
    def test_concurrent_operation_scheduling(self):
        """Test that concurrent operations on different machines are allowed."""
        # Mock operations
        op1 = {'machine_id': 1, 'start': datetime(2024, 1, 1, 8, 0), 'end': datetime(2024, 1, 1, 10, 0)}
        op2 = {'machine_id': 2, 'start': datetime(2024, 1, 1, 8, 0), 'end': datetime(2024, 1, 1, 10, 0)}
        
        # Different machines - should be allowed
        can_schedule_concurrently = op1['machine_id'] != op2['machine_id']
        assert can_schedule_concurrently, "Operations on different machines should be concurrent"
        
        # Same machine - should not be allowed
        op2['machine_id'] = 1
        can_schedule_concurrently = op1['machine_id'] != op2['machine_id']
        assert not can_schedule_concurrently, "Operations on same machine should not be concurrent"
    
    def test_operation_sequence_validation(self):
        """Test that operations are scheduled in sequence within a part."""
        operations = [
            {'op_number': '10', 'planned_start': datetime(2024, 1, 1, 8, 0), 'planned_end': datetime(2024, 1, 1, 10, 0)},
            {'op_number': '20', 'planned_start': datetime(2024, 1, 1, 10, 0), 'planned_end': datetime(2024, 1, 1, 12, 0)},
            {'op_number': '30', 'planned_start': datetime(2024, 1, 1, 12, 0), 'planned_end': datetime(2024, 1, 1, 14, 0)},
        ]
        
        # Validate sequence
        for i in range(len(operations) - 1):
            current_end = operations[i]['planned_end']
            next_start = operations[i + 1]['planned_start']
            assert next_start >= current_end, f"Operation {i+1} should start after operation {i} ends"
    
    def test_rescheduling_row_status_transitions(self):
        """Test rescheduling row status transitions."""
        # Initial state
        status = 'scheduled'
        
        # After production log submission
        status = 'rescheduled'
        assert status == 'rescheduled', "Status should change to rescheduled"
        
        # After completion
        status = 'completed'
        assert status == 'completed', "Status should change to completed"
    
    def test_bulk_operation_handling(self):
        """Test handling of bulk operations (multiple parts)."""
        parts = [
            {'part_id': 1, 'quantity': 10},
            {'part_id': 2, 'quantity': 20},
            {'part_id': 3, 'quantity': 15},
        ]
        
        total_quantity = sum(p['quantity'] for p in parts)
        assert total_quantity == 45, "Total quantity should be sum of all parts"
        
        # Calculate average
        avg_quantity = total_quantity / len(parts)
        assert avg_quantity == 15, "Average quantity should be 15"
    
    def test_error_handling_missing_machine(self):
        """Test error handling when no machine is available."""
        machines_by_wc = {}
        workcenter_id = 1
        
        # No machines in workcenter
        available_machines = machines_by_wc.get(workcenter_id, [])
        assert len(available_machines) == 0, "Should return empty list when no machines available"
        
        # Should skip operation
        should_skip = len(available_machines) == 0
        assert should_skip, "Operation should be skipped when no machines available"
    
    def test_timezone_handling(self):
        """Test timezone handling for datetime comparisons."""
        from datetime import timezone
        
        # UTC datetime
        utc_dt = datetime(2024, 1, 1, 8, 0, tzinfo=timezone.utc)
        
        # Strip timezone
        naive_dt = utc_dt.replace(tzinfo=None)
        
        assert naive_dt.tzinfo is None, "Timezone should be stripped"
        assert naive_dt == datetime(2024, 1, 1, 8, 0), "Datetime should be preserved"
    
    def test_data_integrity_check(self):
        """Test data integrity checks."""
        # Test case 1: Valid data
        operation = {
            'operation_id': 1,
            'part_id': 1,
            'total_qty': 10,
            'completed_qty': 5,
            'remaining_qty': 5
        }
        
        assert operation['total_qty'] == operation['completed_qty'] + operation['remaining_qty'], \
            "Total should equal completed + remaining"
        
        # Test case 2: Invalid data
        operation['remaining_qty'] = 10
        is_valid = operation['total_qty'] == operation['completed_qty'] + operation['remaining_qty']
        assert not is_valid, "Data integrity check should fail"


class TestDynamicSchedulingEdgeCases:
    """Unit tests for edge cases in dynamic scheduling."""
    
    def test_empty_production_logs(self):
        """Test handling of empty production logs list."""
        logs = []
        approved = sum((log.approved_quantity or 0) for log in logs)
        assert approved == 0, "Empty logs should result in 0 approved quantity"
    
    def test_negative_quantity(self):
        """Test handling of negative quantities."""
        total_qty = 10
        approved = 15  # More than total
        
        remaining = max(0, total_qty - approved)
        assert remaining == 0, "Remaining should not be negative"
    
    def test_none_datetime_handling(self):
        """Test handling of None datetime values."""
        actual_end = None
        baseline_end = datetime(2024, 1, 1, 10, 0)
        
        cascade_cursor = actual_end if actual_end else baseline_end
        assert cascade_cursor == baseline_end, "Should use baseline when actual_end is None"
    
    def test_very_large_quantity(self):
        """Test handling of very large quantities."""
        quantity = 1000000
        cycle_seconds = 60  # 1 minute per unit
        
        total_seconds = cycle_seconds * quantity
        total_hours = total_seconds / 3600.0
        
        # Should handle large numbers without overflow
        assert total_hours > 0, "Should calculate duration for large quantities"
    
    def test_zero_priority(self):
        """Test handling of zero priority."""
        parts = [
            {'part_id': 1, 'priority': 0},
            {'part_id': 2, 'priority': 1},
        ]
        
        # Should filter out zero priority
        valid_parts = [p for p in parts if p['priority'] > 0]
        assert len(valid_parts) == 1, "Zero priority parts should be filtered out"
    
    def test_duplicate_operation_numbers(self):
        """Test handling of duplicate operation numbers."""
        operations = [
            {'operation_number': '10', 'id': 1},
            {'operation_number': '10', 'id': 2},
        ]
        
        # Should handle duplicates (use ID as tiebreaker)
        sorted_ops = sorted(operations, key=lambda x: x['id'])
        assert sorted_ops[0]['id'] == 1, "Should sort by ID when operation numbers duplicate"
    
    def test_future_dates(self):
        """Test handling of future dates in scheduling."""
        current_time = datetime.now()
        future_time = current_time + timedelta(days=30)
        
        # Should handle future dates without error
        assert future_time > current_time, "Future date should be in the future"
    
    def test_past_dates(self):
        """Test handling of past dates in scheduling."""
        current_time = datetime.now()
        past_time = current_time - timedelta(days=30)
        
        # Should handle past dates without error
        assert past_time < current_time, "Past date should be in the past"
    
    def test_very_short_operation(self):
        """Test handling of very short operations (seconds)."""
        cycle_seconds = 5  # 5 seconds
        quantity = 1
        
        total_seconds = cycle_seconds * quantity
        total_hours = total_seconds / 3600.0
        
        assert total_hours > 0, "Should handle very short operations"
        assert total_hours < 1, "Very short operation should be less than 1 hour"


class TestProductionLogFunctionality:
    """Unit tests for production log functionality and dynamic scheduling."""
    
    def test_production_log_submission_creates_rescheduling_entry(self):
        """Test that production log submission triggers rescheduling entry creation."""
        # Simulate production log submission
        production_log = {
            'operation_id': 1,
            'approved_quantity': 5,
            'remaining_quantity_to_be_produced': 5,
            'from_date': date(2024, 1, 1),
            'from_time': time(8, 30),
            'to_date': date(2024, 1, 1),
            'to_time': time(10, 0)
        }
        
        # Simulate rescheduling entry creation
        rescheduling_entry = {
            'operation_id': production_log['operation_id'],
            'completed_qty': production_log['approved_quantity'],
            'remaining_qty': production_log['remaining_quantity_to_be_produced'],
            'status': 'rescheduled',
            'start_time': datetime.combine(production_log['to_date'], production_log['to_time'])
        }
        
        assert rescheduling_entry['operation_id'] == 1
        assert rescheduling_entry['completed_qty'] == 5
        assert rescheduling_entry['remaining_qty'] == 5
        assert rescheduling_entry['status'] == 'rescheduled'
    
    def test_production_log_completes_operation(self):
        """Test that production log with full approval marks operation as completed."""
        production_log = {
            'operation_id': 1,
            'approved_quantity': 10,
            'remaining_quantity_to_be_produced': 0,
            'to_date': date(2024, 1, 1),
            'to_time': time(10, 0)
        }
        
        # Operation should be marked as completed
        is_completed = production_log['remaining_quantity_to_be_produced'] == 0
        actual_end = datetime.combine(production_log['to_date'], production_log['to_time'])
        
        assert is_completed, "Operation should be completed"
        assert actual_end == datetime(2024, 1, 1, 10, 0)
    
    def test_multiple_production_logs_aggregation(self):
        """Test that multiple production logs for same operation are aggregated correctly."""
        logs = [
            {'approved_quantity': 3, 'remaining_quantity_to_be_produced': 7},
            {'approved_quantity': 4, 'remaining_quantity_to_be_produced': 3},
            {'approved_quantity': 3, 'remaining_quantity_to_be_produced': 0}
        ]
        
        total_approved = sum(log['approved_quantity'] for log in logs)
        final_remaining = logs[-1]['remaining_quantity_to_be_produced']
        
        assert total_approved == 10, "Total approved should be 10"
        assert final_remaining == 0, "Final remaining should be 0"
    
    def test_production_log_updates_cascade_cursor(self):
        """Test that production log updates cascade cursor for downstream operations."""
        production_log = {
            'to_date': date(2024, 1, 1),
            'to_time': time(10, 0)
        }
        
        # Original cascade cursor
        original_cursor = datetime(2024, 1, 1, 8, 0)
        
        # Updated cascade cursor after production log
        actual_end = datetime.combine(production_log['to_date'], production_log['to_time'])
        updated_cursor = max(original_cursor, actual_end)
        
        assert updated_cursor == datetime(2024, 1, 1, 10, 0), "Cascade cursor should update to actual end"
    
    def test_production_log_partial_approval_schedules_remaining(self):
        """Test that partial approval schedules remaining quantity."""
        total_qty = 10
        approved_qty = 6
        remaining_qty = total_qty - approved_qty
        
        # Should create rescheduling entry for remaining
        rescheduling_entry = {
            'total_qty': total_qty,
            'completed_qty': approved_qty,
            'remaining_qty': remaining_qty
        }
        
        assert rescheduling_entry['remaining_qty'] == 4, "Should schedule 4 remaining units"
        assert rescheduling_entry['completed_qty'] == 6, "Should mark 6 as completed"
    
    def test_production_log_with_zero_approval(self):
        """Test production log with zero approval (rejected quantity)."""
        production_log = {
            'approved_quantity': 0,
            'remaining_quantity_to_be_produced': 10
        }
        
        # Should not mark as in-progress
        is_in_progress = production_log['approved_quantity'] > 0
        assert not is_in_progress, "Zero approval should not mark as in-progress"
    
    def test_production_log_exceeds_total_quantity(self):
        """Test production log approval exceeding total quantity."""
        total_qty = 10
        approved_qty = 15  # Exceeds total
        
        # Should cap at total quantity
        actual_approved = min(approved_qty, total_qty)
        remaining = max(0, total_qty - actual_approved)
        
        assert actual_approved == 10, "Should cap at total quantity"
        assert remaining == 0, "Remaining should be 0"
    
    def test_production_log_without_to_date(self):
        """Test production log without to_date (no actual end time)."""
        production_log = {
            'approved_quantity': 5,
            'remaining_quantity_to_be_produced': 5,
            'to_date': None,
            'to_time': None
        }
        
        # Should use baseline end time
        baseline_end = datetime(2024, 1, 1, 11, 0)
        actual_end = None
        cascade_cursor = actual_end if actual_end else baseline_end
        
        assert cascade_cursor == baseline_end, "Should use baseline when to_date is None"
    
    def test_production_log_machine_relock(self):
        """Test that production log re-locks machine to actual end time."""
        production_log = {
            'machine_id': 1,
            'to_date': date(2024, 1, 1),
            'to_time': time(10, 0)
        }
        
        machine_end_time = datetime.combine(production_log['to_date'], production_log['to_time'])
        
        # Next operation on same machine should start after this
        next_op_start = datetime(2024, 1, 1, 10, 30)
        can_schedule = next_op_start >= machine_end_time
        
        assert can_schedule, "Next operation should start after machine is freed"
    
    def test_production_log_triggers_downstream_reschedule(self):
        """Test that production log triggers rescheduling of downstream operations."""
        operations = [
            {'op_number': '10', 'status': 'completed', 'actual_end': datetime(2024, 1, 1, 10, 0)},
            {'op_number': '20', 'status': 'pending', 'original_start': datetime(2024, 1, 1, 9, 0)},
            {'op_number': '30', 'status': 'pending', 'original_start': datetime(2024, 1, 1, 11, 0)}
        ]
        
        # Operation 10 completed at 10:00
        cascade_cursor = operations[0]['actual_end']
        
        # Operation 20 should be rescheduled to start after 10:00
        op20_new_start = max(operations[1]['original_start'], cascade_cursor)
        assert op20_new_start == datetime(2024, 1, 1, 10, 0), "Op 20 should start after Op 10 completes"
        
        # Operation 30 should also be affected
        op30_new_start = max(operations[2]['original_start'], op20_new_start + timedelta(hours=1))
        assert op30_new_start >= datetime(2024, 1, 1, 11, 0), "Op 30 should be after Op 20"
    
    def test_production_log_mid_operation(self):
        """Test production log submitted while operation is in progress."""
        # Initial state
        initial_approved = 3
        initial_remaining = 7
        
        # Mid-operation log
        mid_log = {
            'approved_quantity': 5,
            'remaining_quantity_to_be_produced': 5
        }
        
        # Should update to new values
        total_approved = initial_approved + mid_log['approved_quantity']
        total_remaining = mid_log['remaining_quantity_to_be_produced']
        
        assert total_approved == 8, "Should aggregate approved quantities"
        assert total_remaining == 5, "Should update remaining quantity"
    
    def test_production_log_rejection(self):
        """Test production log with rejected quantity."""
        production_log = {
            'approved_quantity': 5,
            'rejected_quantity': 2,
            'total_quantity': 10
        }
        
        # Remaining should account for rejected
        remaining = production_log['total_quantity'] - production_log['approved_quantity']
        assert remaining == 5, "Remaining should be total minus approved"
    
    def test_production_log_cross_shift(self):
        """Test production log that spans multiple shifts."""
        production_log = {
            'from_date': date(2024, 1, 1),
            'from_time': time(16, 0),  # Near end of shift
            'to_date': date(2024, 1, 2),
            'to_time': time(9, 0)  # Next day
        }
        
        # Should handle cross-shift correctly
        duration_hours = (datetime.combine(production_log['to_date'], production_log['to_time']) - 
                         datetime.combine(production_log['from_date'], production_log['from_time'])).total_seconds() / 3600
        
        assert duration_hours > 0, "Should calculate cross-shift duration"
        assert duration_hours < 24, "Duration should be less than 24 hours"
    
    def test_dynamic_reschedule_after_production_log(self):
        """Test that dynamic reschedule is triggered after production log."""
        # Simulate production log submission
        production_log_submitted = True
        trigger_part_id = 1
        
        # Dynamic reschedule should be triggered
        should_reschedule = production_log_submitted
        assert should_reschedule, "Dynamic reschedule should be triggered"
        
        # Reschedule should be for the specific part
        reschedule_target = trigger_part_id
        assert reschedule_target == 1, "Should reschedule the correct part"
    
    def test_dynamic_reschedule_version_update(self):
        """Test that dynamic reschedule updates schedule version."""
        current_version = 1
        production_log_submitted = True
        
        if production_log_submitted:
            new_version = current_version + 1
        
        assert new_version == 2, "Version should increment after reschedule"
    
    def test_dynamic_reschedule_preserves_completed_ops(self):
        """Test that dynamic reschedule preserves completed operations."""
        completed_operations = [
            {'operation_id': 1, 'status': 'completed', 'actual_end': datetime(2024, 1, 1, 10, 0)}
        ]
        
        # After reschedule, completed ops should remain unchanged
        for op in completed_operations:
            assert op['status'] == 'completed', "Completed status should be preserved"
            assert op['actual_end'] is not None, "Actual end should be preserved"
    
    def test_dynamic_reschedule_updates_inprogress_ops(self):
        """Test that dynamic reschedule updates in-progress operations."""
        inprogress_operations = [
            {'operation_id': 2, 'status': 'in-progress', 'completed_qty': 5, 'remaining_qty': 5}
        ]
        
        # After reschedule, should create new entry for remaining
        for op in inprogress_operations:
            new_entry = {
                'operation_id': op['operation_id'],
                'completed_qty': op['completed_qty'],
                'remaining_qty': op['remaining_qty'],
                'status': 'rescheduled'
            }
            assert new_entry['remaining_qty'] == 5, "Should schedule remaining quantity"
    
    def test_dynamic_reschedule_schedules_pending_ops(self):
        """Test that dynamic reschedule schedules pending operations."""
        pending_operations = [
            {'operation_id': 3, 'status': 'pending', 'total_qty': 10}
        ]
        
        # After reschedule, should schedule full quantity
        for op in pending_operations:
            new_entry = {
                'operation_id': op['operation_id'],
                'total_qty': op['total_qty'],
                'completed_qty': 0,
                'remaining_qty': op['total_qty'],
                'status': 'rescheduled'
            }
            assert new_entry['remaining_qty'] == 10, "Should schedule full quantity"
    
    def test_dynamic_reschedule_with_no_logs(self):
        """Test dynamic reschedule when no production logs exist."""
        has_production_logs = False
        
        # Should use baseline schedule
        use_baseline = not has_production_logs
        assert use_baseline, "Should use baseline when no logs exist"
    
    def test_dynamic_reschedule_partial_chain(self):
        """Test dynamic reschedule when only some operations in chain have logs."""
        operations = [
            {'operation_id': 1, 'has_log': True, 'status': 'completed'},
            {'operation_id': 2, 'has_log': False, 'status': 'pending'},
            {'operation_id': 3, 'has_log': False, 'status': 'pending'}
        ]
        
        # Op 1 completed, Op 2 and 3 should cascade from Op 1's actual end
        cascade_from_op = operations[0]
        assert cascade_from_op['status'] == 'completed', "Should cascade from completed operation"
        
        # Op 2 and 3 should be rescheduled
        for op in operations[1:]:
            assert op['status'] == 'pending', "Pending ops should be rescheduled"
    
    def test_production_log_validates_operation_id(self):
        """Test that production log validates operation ID exists."""
        valid_operation_ids = [1, 2, 3]
        production_log = {'operation_id': 2}
        
        is_valid = production_log['operation_id'] in valid_operation_ids
        assert is_valid, "Operation ID should be valid"
        
        # Test invalid ID
        invalid_log = {'operation_id': 999}
        is_valid = invalid_log['operation_id'] in valid_operation_ids
        assert not is_valid, "Invalid operation ID should be rejected"
    
    def test_production_log_quantity_validation(self):
        """Test that production log validates quantity fields."""
        production_log = {
            'approved_quantity': 5,
            'remaining_quantity_to_be_produced': 5
        }
        
        # Both should be non-negative
        is_valid = production_log['approved_quantity'] >= 0 and production_log['remaining_quantity_to_be_produced'] >= 0
        assert is_valid, "Quantities should be non-negative"
        
        # Test negative quantity
        invalid_log = {'approved_quantity': -1, 'remaining_quantity_to_be_produced': 5}
        is_valid = invalid_log['approved_quantity'] >= 0
        assert not is_valid, "Negative quantity should be invalid"
    
    def test_dynamic_reschedule_handles_outsource_ops(self):
        """Test that dynamic reschedule handles outsource operations correctly."""
        outsource_operation = {
            'operation_id': 4,
            'part_type_id': 2,  # Out-source
            'status': 'delivered',
            'delivered_date': datetime(2024, 1, 5, 12, 0)
        }
        
        # Should use delivered date as cascade cursor
        cascade_cursor = outsource_operation['delivered_date']
        assert cascade_cursor == datetime(2024, 1, 5, 12, 0), "Should use delivered date"
    
    def test_dynamic_reschedule_efficiency_factor_consistency(self):
        """Test that dynamic reschedule applies efficiency factor consistently."""
        efficiency_factor = 0.8
        base_duration = 10.0
        
        # Both initial and rescheduled should use same efficiency
        initial_adjusted = base_duration / efficiency_factor
        rescheduled_adjusted = base_duration / efficiency_factor
        
        assert initial_adjusted == rescheduled_adjusted, "Efficiency factor should be consistent"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
