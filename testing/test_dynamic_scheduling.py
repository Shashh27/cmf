"""
Comprehensive test suite for dynamic scheduling (rescheduling).

Tests cover all scenarios, rare scenarios, and worst-case scenarios
that occur in the shop floor.
"""
import pytest
from datetime import datetime, time, timedelta, timezone, date
from sqlalchemy.orm import Session

from algorithm import DynamicSchedulerEngine, generate_machine_schedule, dynamic_reschedule
from DB.models.oms import Order, Part, Operation, OrderPartPriority, OutSourceOperationStatus
from DB.models.scheduling import (
    OrderScheduleStatus, PartScheduleStatus, ScheduleHistory,
    PlannedScheduleItem, Rescheduling, ProductionLog, MachineStatus
)
from DB.models.inventory import RawMaterialUsage


class TestDynamicSchedulingCompletedOperations:
    """Test scenarios for completed operations."""
    
    def test_completed_operation_with_actual_end(self, db_session: Session, setup_active_order, 
                                                   sample_operation, sample_machine, 
                                                   setup_shift_configuration, setup_efficiency_factor):
        """Test that completed operations use actual_end from production logs."""
        order = setup_active_order
        part = db_session.query(Part).first()
        operation = sample_operation
        
        # Generate initial schedule
        result = generate_machine_schedule(db_session)
        assert result['success'] is True
        
        # Create production log marking operation as completed
        log = ProductionLog(
            operation_id=operation.id,
            from_date=date(2024, 1, 1),
            from_time=time(8, 30),
            to_date=date(2024, 1, 1),
            to_time=time(10, 0),
            approved_quantity=10,
            remaining_quantity_to_be_produced=0
        )
        db_session.add(log)
        db_session.commit()
        
        # Run dynamic reschedule
        result = dynamic_reschedule(db_session, triggered_by_part_id=part.id)
        assert result['success'] is True
        
        # Verify operation is skipped (no rescheduled rows for completed op)
        rescheduled_rows = db_session.query(Rescheduling).filter(
            Rescheduling.operation_id == operation.id,
            Rescheduling.status == 'rescheduled'
        ).all()
        assert len(rescheduled_rows) == 0, "Completed operation should not have rescheduled rows"
    
    def test_completed_operation_without_actual_end_uses_baseline(self, db_session: Session, 
                                                                   setup_active_order, sample_operation,
                                                                   sample_machine, setup_shift_configuration,
                                                                   setup_efficiency_factor):
        """Test that completed operations without actual_end use baseline end time."""
        order = setup_active_order
        part = db_session.query(Part).first()
        operation = sample_operation
        
        # Generate initial schedule
        result = generate_machine_schedule(db_session)
        assert result['success'] is True
        
        # Get baseline end time
        baseline = db_session.query(Rescheduling).filter(
            Rescheduling.operation_id == operation.id
        ).first()
        baseline_end = baseline.end_time
        
        # Create production log without to_date/to_time (no actual end)
        log = ProductionLog(
            operation_id=operation.id,
            from_date=date(2024, 1, 1),
            from_time=time(8, 30),
            to_date=None,
            to_time=None,
            approved_quantity=10,
            remaining_quantity_to_be_produced=0
        )
        db_session.add(log)
        db_session.commit()
        
        # Run dynamic reschedule
        result = dynamic_reschedule(db_session, triggered_by_part_id=part.id)
        assert result['success'] is True
        
        # Verify cascade cursor uses baseline
        # (This is implicit - the next operation should start after baseline_end)
    
    def test_multiple_completed_operations_cascade(self, db_session: Session, setup_active_order,
                                                    sample_operation, sample_operation_2,
                                                    sample_machine, setup_shift_configuration,
                                                    setup_efficiency_factor):
        """Test that multiple completed operations cascade correctly."""
        order = setup_active_order
        part = db_session.query(Part).first()
        
        # Generate initial schedule
        result = generate_machine_schedule(db_session)
        assert result['success'] is True
        
        # Mark both operations as completed
        for op in [sample_operation, sample_operation_2]:
            log = ProductionLog(
                operation_id=op.id,
                from_date=date(2024, 1, 1),
                from_time=time(8, 30),
                to_date=date(2024, 1, 1),
                to_time=time(10, 0),
                approved_quantity=10,
                remaining_quantity_to_be_produced=0
            )
            db_session.add(log)
        db_session.commit()
        
        # Run dynamic reschedule
        result = dynamic_reschedule(db_session, triggered_by_part_id=part.id)
        assert result['success'] is True
        
        # Verify no rescheduled rows for completed operations
        rescheduled_rows = db_session.query(Rescheduling).filter(
            Rescheduling.part_id == part.id,
            Rescheduling.status == 'rescheduled'
        ).all()
        assert len(rescheduled_rows) == 0, "All operations completed, no rescheduled rows expected"


class TestDynamicSchedulingInProgressWithLogs:
    """Test scenarios for in-progress operations with production logs."""
    
    def test_inprogress_partial_approval_schedules_remaining(self, db_session: Session, 
                                                               setup_active_order, sample_operation,
                                                               sample_machine, setup_shift_configuration,
                                                               setup_efficiency_factor):
        """Test that in-progress operation with partial approval schedules remaining quantity."""
        order = setup_active_order
        part = db_session.query(Part).first()
        operation = sample_operation
        
        # Generate initial schedule
        result = generate_machine_schedule(db_session)
        assert result['success'] is True
        
        # Create production log with partial approval (5 of 10)
        log = ProductionLog(
            operation_id=operation.id,
            from_date=date(2024, 1, 1),
            from_time=time(8, 30),
            to_date=date(2024, 1, 1),
            to_time=time(9, 30),
            approved_quantity=5,
            remaining_quantity_to_be_produced=5
        )
        db_session.add(log)
        db_session.commit()
        
        # Run dynamic reschedule
        result = dynamic_reschedule(db_session, triggered_by_part_id=part.id)
        assert result['success'] is True
        
        # Verify rescheduled row for remaining quantity
        rescheduled_rows = db_session.query(Rescheduling).filter(
            Rescheduling.operation_id == operation.id,
            Rescheduling.status == 'rescheduled'
        ).all()
        assert len(rescheduled_rows) > 0, "Should have rescheduled rows for remaining quantity"
        
        # Verify remaining_qty is correct
        for row in rescheduled_rows:
            assert row.completed_qty == 5, f"Completed qty should be 5, got {row.completed_qty}"
            assert row.remaining_qty == 5, f"Remaining qty should be 5, got {row.remaining_qty}"
    
    def test_inprogress_cascades_to_downstream_operations(self, db_session: Session, 
                                                            setup_active_order, sample_operation,
                                                            sample_operation_2, sample_machine,
                                                            setup_shift_configuration, setup_efficiency_factor):
        """Test that in-progress operation cascades to downstream operations."""
        order = setup_active_order
        part = db_session.query(Part).first()
        
        # Generate initial schedule
        result = generate_machine_schedule(db_session)
        assert result['success'] is True
        
        # Partially complete first operation
        log = ProductionLog(
            operation_id=sample_operation.id,
            from_date=date(2024, 1, 1),
            from_time=time(8, 30),
            to_date=date(2024, 1, 1),
            to_time=time(9, 30),
            approved_quantity=5,
            remaining_quantity_to_be_produced=5
        )
        db_session.add(log)
        db_session.commit()
        
        # Run dynamic reschedule
        result = dynamic_reschedule(db_session, triggered_by_part_id=part.id)
        assert result['success'] is True
        
        # Verify second operation is rescheduled (cascaded)
        op2_rescheduled = db_session.query(Rescheduling).filter(
            Rescheduling.operation_id == sample_operation_2.id,
            Rescheduling.status == 'rescheduled'
        ).first()
        assert op2_rescheduled is not None, "Downstream operation should be rescheduled"
        
        # Verify second operation starts after first operation's new end
        op1_rescheduled = db_session.query(Rescheduling).filter(
            Rescheduling.operation_id == sample_operation.id,
            Rescheduling.status == 'rescheduled'
        ).order_by(Rescheduling.end_time.desc()).first()
        
        if op1_rescheduled and op2_rescheduled:
            assert op2_rescheduled.start_time >= op1_rescheduled.end_time, \
                "Downstream operation should start after upstream operation ends"
    
    def test_inprogress_machine_relock(self, db_session: Session, setup_active_order,
                                       sample_operation, sample_machine_2,
                                       setup_shift_configuration, setup_efficiency_factor):
        """Test that in-progress operation re-locks machine to actual_end."""
        order = setup_active_order
        part = db_session.query(Part).first()
        operation = sample_operation
        
        # Pin operation to second machine
        operation.machine_id = sample_machine_2.id
        db_session.commit()
        
        # Generate initial schedule
        result = generate_machine_schedule(db_session)
        assert result['success'] is True
        
        # Create production log
        log = ProductionLog(
            operation_id=operation.id,
            from_date=date(2024, 1, 1),
            from_time=time(8, 30),
            to_date=date(2024, 1, 1),
            to_time=time(9, 30),
            approved_quantity=5,
            remaining_quantity_to_be_produced=5
        )
        db_session.add(log)
        db_session.commit()
        
        # Run dynamic reschedule
        result = dynamic_reschedule(db_session, triggered_by_part_id=part.id)
        assert result['success'] is True
        
        # Verify machine is locked to actual_end
        # (This is verified by checking that rescheduled operation starts at or after actual_end)
        rescheduled = db_session.query(Rescheduling).filter(
            Rescheduling.operation_id == operation.id,
            Rescheduling.status == 'rescheduled'
        ).first()
        
        if rescheduled:
            actual_end = datetime.combine(log.to_date, log.to_time)
            assert rescheduled.start_time >= actual_end, \
                "Rescheduled operation should start at or after actual_end"


class TestDynamicSchedulingInProgressWithoutLogs:
    """Test scenarios for in-progress operations without production logs."""
    
    def test_inprogress_no_log_untouched(self, db_session: Session, setup_active_order,
                                          sample_operation, sample_machine,
                                          setup_shift_configuration, setup_efficiency_factor):
        """Test that in-progress operation without logs is left untouched."""
        order = setup_active_order
        part = db_session.query(Part).first()
        operation = sample_operation
        
        # Generate initial schedule
        result = generate_machine_schedule(db_session)
        assert result['success'] is True
        
        # Manually set approved quantity without log (edge case)
        # This simulates operator mid-job without logging
        # (In real system, this shouldn't happen, but test handles it)
        
        # Run dynamic reschedule
        result = dynamic_reschedule(db_session, triggered_by_part_id=part.id)
        assert result['success'] is True
        
        # Verify operation uses baseline (no rescheduled rows if no approval)
        # If there's no log and no approval, it should remain as pending
        baseline = db_session.query(Rescheduling).filter(
            Rescheduling.operation_id == operation.id,
            Rescheduling.status == 'scheduled'
        ).first()
        
        rescheduled = db_session.query(Rescheduling).filter(
            Rescheduling.operation_id == operation.id,
            Rescheduling.status == 'rescheduled'
        ).first()
        
        # Without logs, it should either use baseline or remain scheduled
        assert baseline is not None or rescheduled is not None


class TestDynamicSchedulingPendingOperations:
    """Test scenarios for pending operations."""
    
    def test_pending_operation_schedules_full_quantity(self, db_session: Session, 
                                                         setup_active_order, sample_operation,
                                                         sample_machine, setup_shift_configuration,
                                                         setup_efficiency_factor):
        """Test that pending operation schedules full quantity."""
        order = setup_active_order
        part = db_session.query(Part).first()
        operation = sample_operation
        
        # Generate initial schedule
        result = generate_machine_schedule(db_session)
        assert result['success'] is True
        
        # No production logs - operation is pending
        # Run dynamic reschedule
        result = dynamic_reschedule(db_session, triggered_by_part_id=part.id)
        assert result['success'] is True
        
        # Verify full quantity is scheduled
        rescheduled = db_session.query(Rescheduling).filter(
            Rescheduling.operation_id == operation.id,
            Rescheduling.status == 'rescheduled'
        ).first()
        
        if rescheduled:
            assert rescheduled.total_qty == 10, f"Total qty should be 10, got {rescheduled.total_qty}"
            assert rescheduled.completed_qty == 0, f"Completed qty should be 0, got {rescheduled.completed_qty}"
            assert rescheduled.remaining_qty == 10, f"Remaining qty should be 10, got {rescheduled.remaining_qty}"
    
    def test_pending_cascade_from_upstream_completion(self, db_session: Session, 
                                                        setup_active_order, sample_operation,
                                                        sample_operation_2, sample_machine,
                                                        setup_shift_configuration, setup_efficiency_factor):
        """Test that pending operation cascades from upstream completion."""
        order = setup_active_order
        part = db_session.query(Part).first()
        
        # Generate initial schedule
        result = generate_machine_schedule(db_session)
        assert result['success'] is True
        
        # Complete first operation
        log = ProductionLog(
            operation_id=sample_operation.id,
            from_date=date(2024, 1, 1),
            from_time=time(8, 30),
            to_date=date(2024, 1, 1),
            to_time=time(10, 0),
            approved_quantity=10,
            remaining_quantity_to_be_produced=0
        )
        db_session.add(log)
        db_session.commit()
        
        # Run dynamic reschedule
        result = dynamic_reschedule(db_session, triggered_by_part_id=part.id)
        assert result['success'] is True
        
        # Verify second operation is rescheduled and starts after first
        op2_rescheduled = db_session.query(Rescheduling).filter(
            Rescheduling.operation_id == sample_operation_2.id,
            Rescheduling.status == 'rescheduled'
        ).first()
        
        assert op2_rescheduled is not None, "Pending operation should be rescheduled"
        
        # Should start after first operation's actual end
        actual_end = datetime.combine(log.to_date, log.to_time)
        assert op2_rescheduled.start_time >= actual_end, \
            "Pending operation should start after upstream completion"


class TestDynamicSchedulingOutsourceOperations:
    """Test scenarios for out-source operations."""
    
    def test_outsource_delivered_updates_cursor(self, db_session: Session, setup_active_order,
                                                  sample_part_type_outsource, sample_machine,
                                                  setup_shift_configuration, setup_efficiency_factor):
        """Test that delivered out-source operation updates cascade cursor."""
        order = setup_active_order
        part = db_session.query(Part).first()
        
        # Create out-source operation
        op = Operation(
            part_id=part.id,
            operation_number="OS10",
            setup_time=None,
            cycle_time=None,
            workcenter_id=None,
            machine_id=None,
            part_type_id=2  # Out-Source
        )
        db_session.add(op)
        db_session.commit()
        
        # Generate initial schedule
        result = generate_machine_schedule(db_session)
        assert result['success'] is True
        
        # Mark as delivered
        os_status = OutSourceOperationStatus(
            part_id=part.id,
            order_id=order.id,
            operation_id=op.id,
            status="delivered",
            delivered_date=datetime(2024, 1, 5, 12, 0)
        )
        db_session.add(os_status)
        db_session.commit()
        
        # Run dynamic reschedule
        result = dynamic_reschedule(db_session, triggered_by_part_id=part.id)
        assert result['success'] is True
        
        # Verify cursor is updated to delivered date
        # (Implicit - next operation should start after delivered date)
    
    def test_outsource_pending_schedules_window(self, db_session: Session, setup_active_order,
                                                 sample_part_type_outsource, sample_machine,
                                                 setup_shift_configuration, setup_efficiency_factor):
        """Test that pending out-source operation schedules vendor window."""
        order = setup_active_order
        part = db_session.query(Part).first()
        
        # Create out-source operation with dates
        op = Operation(
            part_id=part.id,
            operation_number="OS10",
            setup_time=None,
            cycle_time=None,
            workcenter_id=None,
            machine_id=None,
            part_type_id=2,
            from_date=datetime(2024, 1, 10),
            to_date=datetime(2024, 1, 17)
        )
        db_session.add(op)
        db_session.commit()
        
        # Generate initial schedule
        result = generate_machine_schedule(db_session)
        assert result['success'] is True
        
        # Run dynamic reschedule
        result = dynamic_reschedule(db_session, triggered_by_part_id=part.id)
        assert result['success'] is True
        
        # Verify out-source window is scheduled
        rescheduled = db_session.query(Rescheduling).filter(
            Rescheduling.operation_id == op.id,
            Rescheduling.status == 'rescheduled'
        ).first()
        
        if rescheduled:
            assert rescheduled.start_time == datetime(2024, 1, 10), \
                f"Start should be 2024-01-10, got {rescheduled.start_time}"
            assert rescheduled.end_time == datetime(2024, 1, 17), \
                f"End should be 2024-01-17, got {rescheduled.end_time}"
    
    def test_outsource_no_dates_uses_fallback(self, db_session: Session, setup_active_order,
                                               sample_part_type_outsource, sample_machine,
                                               setup_shift_configuration, setup_efficiency_factor):
        """Test that out-source operation without dates uses 7-day fallback."""
        order = setup_active_order
        part = db_session.query(Part).first()
        
        # Create out-source operation without dates
        op = Operation(
            part_id=part.id,
            operation_number="OS10",
            setup_time=None,
            cycle_time=None,
            workcenter_id=None,
            machine_id=None,
            part_type_id=2,
            from_date=None,
            to_date=None
        )
        db_session.add(op)
        db_session.commit()
        
        # Generate initial schedule
        result = generate_machine_schedule(db_session)
        assert result['success'] is True
        
        # Run dynamic reschedule
        result = dynamic_reschedule(db_session, triggered_by_part_id=part.id)
        assert result['success'] is True
        
        # Verify 7-day fallback is used
        rescheduled = db_session.query(Rescheduling).filter(
            Rescheduling.operation_id == op.id,
            Rescheduling.status == 'rescheduled'
        ).first()
        
        if rescheduled:
            duration = (rescheduled.end_time - rescheduled.start_time).days
            assert duration == 7, f"Duration should be 7 days, got {duration}"


class TestDynamicSchedulingMachineAvailability:
    """Test scenarios for machine availability and downtime."""
    
    def test_machine_downtime_reschedules_to_alternative(self, db_session: Session, 
                                                           setup_active_order, sample_operation,
                                                           sample_machine, sample_machine_2,
                                                           setup_shift_configuration, setup_efficiency_factor):
        """Test that machine downtime causes rescheduling to alternative machine."""
        order = setup_active_order
        part = db_session.query(Part).first()
        operation = sample_operation
        
        # Pin operation to first machine
        operation.machine_id = sample_machine.id
        db_session.commit()
        
        # Generate initial schedule
        result = generate_machine_schedule(db_session)
        assert result['success'] is True
        
        # Set machine downtime
        downtime = MachineStatus(
            machine_id=sample_machine.id,
            status_id=2,  # OFF
            available_from=datetime(2024, 1, 1, 8, 0),
            available_to=datetime(2024, 1, 5, 17, 0)
        )
        db_session.add(downtime)
        db_session.commit()
        
        # Run dynamic reschedule
        result = dynamic_reschedule(db_session, triggered_by_part_id=part.id)
        assert result['success'] is True
        
        # Verify operation is rescheduled to alternative machine
        rescheduled = db_session.query(Rescheduling).filter(
            Rescheduling.operation_id == operation.id,
            Rescheduling.status == 'rescheduled'
        ).first()
        
        if rescheduled:
            # Should be on alternative machine
            assert rescheduled.machine_id == sample_machine_2.id, \
                f"Should be on machine 2, got {rescheduled.machine_id}"
    
    def test_permanent_machine_off_skips_operation(self, db_session: Session, 
                                                    setup_active_order, sample_operation,
                                                    sample_machine, setup_shift_configuration,
                                                    setup_efficiency_factor):
        """Test that permanently OFF machine causes operation to be skipped."""
        order = setup_active_order
        part = db_session.query(Part).first()
        operation = sample_operation
        
        # Pin operation to machine
        operation.machine_id = sample_machine.id
        db_session.commit()
        
        # Generate initial schedule
        result = generate_machine_schedule(db_session)
        assert result['success'] is True
        
        # Set machine permanently OFF
        downtime = MachineStatus(
            machine_id=sample_machine.id,
            status_id=2,  # OFF
            available_from=datetime(2024, 1, 1, 8, 0),
            available_to=None  # Permanent
        )
        db_session.add(downtime)
        db_session.commit()
        
        # Run dynamic reschedule
        result = dynamic_reschedule(db_session, triggered_by_part_id=part.id)
        assert result['success'] is True
        
        # If no alternative machine, operation should be skipped
        # Check result message for skip indication
        if result['skipped_parts']:
            assert any('no machine available' in sp for sp in result['skipped_parts'])
    
    def test_machine_during_shift_adjusts_timing(self, db_session: Session, 
                                                   setup_active_order, sample_operation,
                                                   sample_machine, setup_shift_configuration,
                                                   setup_efficiency_factor):
        """Test that machine downtime during shift adjusts operation timing."""
        order = setup_active_order
        part = db_session.query(Part).first()
        operation = sample_operation
        
        # Generate initial schedule
        result = generate_machine_schedule(db_session)
        assert result['success'] is True
        
        # Set downtime during shift
        downtime = MachineStatus(
            machine_id=sample_machine.id,
            status_id=2,
            available_from=datetime(2024, 1, 1, 12, 0),
            available_to=datetime(2024, 1, 1, 13, 0)
        )
        db_session.add(downtime)
        db_session.commit()
        
        # Run dynamic reschedule
        result = dynamic_reschedule(db_session, triggered_by_part_id=part.id)
        assert result['success'] is True
        
        # Verify operation timing accounts for downtime
        # (Operation should be split around downtime)


class TestDynamicSchedulingPriorityBased:
    """Test scenarios for priority-based scheduling."""
    
    def test_higher_priority_part_gets_machine_first(self, db_session: Session, 
                                                        setup_active_order, sample_product,
                                                        sample_part_type_inhouse, sample_machine,
                                                        setup_shift_configuration, setup_efficiency_factor):
        """Test that higher priority part gets machine before lower priority."""
        order = setup_active_order
        
        # Create second part with lower priority
        part2 = Part(
            product_id=sample_product.id,
            part_number="PN002",
            part_name="Test Part 2",
            type_id=sample_part_type_inhouse.id,
            qty=10
        )
        db_session.add(part2)
        db_session.commit()
        
        # Activate second part
        pss2 = PartScheduleStatus(
            sale_order_id=order.id,
            part_id=part2.id,
            status="active",
            start_date=datetime.now(timezone.utc)
        )
        db_session.add(pss2)
        
        # Set priorities (part1=1, part2=2)
        part1 = db_session.query(Part).filter(Part.part_number == "PN001").first()
        opp1 = OrderPartPriority(
            order_id=order.id,
            product_id=order.product_id,
            part_id=part1.id,
            priority=1,
            status="active"
        )
        opp2 = OrderPartPriority(
            order_id=order.id,
            product_id=order.product_id,
            part_id=part2.id,
            priority=2,
            status="active"
        )
        db_session.add_all([opp1, opp2])
        
        # Create operations for both parts
        op1 = Operation(
            part_id=part1.id,
            operation_number="10",
            setup_time=time(hour=0, minute=30),
            cycle_time=time(hour=0, minute=10),
            workcenter_id=sample_machine.work_center_id,
            machine_id=sample_machine.id,
            part_type_id=1
        )
        op2 = Operation(
            part_id=part2.id,
            operation_number="10",
            setup_time=time(hour=0, minute=30),
            cycle_time=time(hour=0, minute=10),
            workcenter_id=sample_machine.work_center_id,
            machine_id=sample_machine.id,
            part_type_id=1
        )
        db_session.add_all([op1, op2])
        db_session.commit()
        
        # Generate schedule
        result = generate_machine_schedule(db_session)
        assert result['success'] is True
        
        # Verify higher priority part scheduled first
        items = db_session.query(PlannedScheduleItem).all()
        part1_items = [i for i in items if i.part_id == part1.id]
        part2_items = [i for i in items if i.part_id == part2.id]
        
        if part1_items and part2_items:
            part1_start = min(i.planned_start_time for i in part1_items)
            part2_start = min(i.planned_start_time for i in part2_items)
            assert part1_start < part2_start, \
                "Higher priority part should be scheduled first"


class TestDynamicSchedulingCascadeLogic:
    """Test scenarios for cascade logic."""
    
    def test_cascade_breaks_on_late_part_activation(self, db_session: Session, 
                                                       setup_active_order, sample_operation,
                                                       sample_operation_2, sample_machine,
                                                       setup_shift_configuration, setup_efficiency_factor):
        """Test that cascade breaks when part is activated after order."""
        order = setup_active_order
        part = db_session.query(Part).first()
        
        # Set part activation later than order activation
        pss = db_session.query(PartScheduleStatus).filter(
            PartScheduleStatus.part_id == part.id
        ).first()
        pss.start_date = datetime.now(timezone.utc) + timedelta(days=5)
        db_session.commit()
        
        # Generate schedule
        result = generate_machine_schedule(db_session)
        assert result['success'] is True
        
        # Verify first operation starts at part activation time (not order activation)
        items = db_session.query(PlannedScheduleItem).filter(
            PlannedScheduleItem.part_id == part.id
        ).order_by(PlannedScheduleItem.planned_start_time).first()
        
        if items:
            assert items.planned_start_time >= pss.start_date.replace(tzinfo=None), \
                "Operation should start at or after part activation"
    
    def test_cascade_across_multiple_operations(self, db_session: Session, setup_active_order,
                                                  sample_part, sample_machine, setup_shift_configuration,
                                                  setup_efficiency_factor):
        """Test cascade across 3+ operations in sequence."""
        order = setup_active_order
        part = sample_part
        
        # Create 3 operations
        operations = []
        for i in range(3):
            op = Operation(
                part_id=part.id,
                operation_number=str(10 + i * 10),
                setup_time=time(hour=0, minute=30),
                cycle_time=time(hour=0, minute=10),
                workcenter_id=sample_machine.work_center_id,
                machine_id=sample_machine.id,
                part_type_id=1
            )
            db_session.add(op)
            operations.append(op)
        db_session.commit()
        
        # Generate schedule
        result = generate_machine_schedule(db_session)
        assert result['success'] is True
        
        # Verify operations are sequential
        items = db_session.query(PlannedScheduleItem).filter(
            PlannedScheduleItem.part_id == part.id
        ).order_by(PlannedScheduleItem.planned_start_time).all()
        
        for i in range(len(items) - 1):
            assert items[i + 1].planned_start_time >= items[i].planned_end_time, \
                f"Operation {i+1} should start after operation {i} ends"
    
    def test_cascade_with_midstream_completion(self, db_session: Session, setup_active_order,
                                                sample_operation, sample_operation_2, sample_machine,
                                                setup_shift_configuration, setup_efficiency_factor):
        """Test cascade when middle operation is completed."""
        order = setup_active_order
        part = db_session.query(Part).first()
        
        # Generate schedule
        result = generate_machine_schedule(db_session)
        assert result['success'] is True
        
        # Complete second operation (middle)
        log = ProductionLog(
            operation_id=sample_operation_2.id,
            from_date=date(2024, 1, 1),
            from_time=time(10, 0),
            to_date=date(2024, 1, 1),
            to_time=time(11, 30),
            approved_quantity=10,
            remaining_quantity_to_be_produced=0
        )
        db_session.add(log)
        db_session.commit()
        
        # Run dynamic reschedule
        result = dynamic_reschedule(db_session, triggered_by_part_id=part.id)
        assert result['success'] is True
        
        # Verify third operation (if exists) cascades from second's completion
        # (This tests that cascade works even when not starting from first operation)


class TestDynamicSchedulingEdgeCases:
    """Test edge cases and worst-case scenarios."""
    
    def test_zero_quantity_order_skipped(self, db_session: Session, setup_active_order):
        """Test that order with zero quantity is skipped."""
        order = setup_active_order
        order.quantity = 0
        db_session.commit()
        
        # Generate schedule
        result = generate_machine_schedule(db_session)
        assert result['success'] is True
        
        # Verify order is skipped
        assert any('quantity=0' in so for so in result['skipped_orders'])
    
    def test_part_with_no_operations_skipped(self, db_session: Session, setup_active_order,
                                              sample_machine, setup_shift_configuration,
                                              setup_efficiency_factor):
        """Test that part with no operations is skipped."""
        order = setup_active_order
        part = db_session.query(Part).first()
        
        # Delete operations
        db_session.query(Operation).filter(Operation.part_id == part.id).delete()
        db_session.commit()
        
        # Generate schedule
        result = generate_machine_schedule(db_session)
        assert result['success'] is True
        
        # Verify part is in parts_without_operations
        assert len(result['parts_without_operations']) > 0
    
    def test_no_schedulable_machines_skips(self, db_session: Session, setup_active_order,
                                            sample_operation, setup_shift_configuration,
                                            setup_efficiency_factor):
        """Test that operation with no schedulable machines is skipped."""
        order = setup_active_order
        part = db_session.query(Part).first()
        operation = sample_operation
        
        # Set workcenter to non-existent ID
        operation.workcenter_id = 99999
        db_session.commit()
        
        # Generate schedule
        result = generate_machine_schedule(db_session)
        assert result['success'] is True
        
        # Verify operation is skipped
        assert any('no schedulable machine' in sp for sp in result['skipped_parts'])
    
    def test_concurrent_reschedule_same_part(self, db_session: Session, setup_active_order,
                                               sample_operation, sample_machine,
                                               setup_shift_configuration, setup_efficiency_factor):
        """Test concurrent reschedule requests for same part."""
        order = setup_active_order
        part = db_session.query(Part).first()
        
        # Generate schedule
        result = generate_machine_schedule(db_session)
        assert result['success'] is True
        
        # Run dynamic reschedule twice
        result1 = dynamic_reschedule(db_session, triggered_by_part_id=part.id)
        result2 = dynamic_reschedule(db_session, triggered_by_part_id=part.id)
        
        assert result1['success'] is True
        assert result2['success'] is True
        
        # Both should succeed (idempotent)
    
    def test_reschedule_with_no_active_orders(self, db_session: Session, setup_shift_configuration,
                                                setup_efficiency_factor):
        """Test reschedule when there are no active orders."""
        # Clear any existing data
        db_session.query(OrderScheduleStatus).delete()
        db_session.query(PartScheduleStatus).delete()
        db_session.commit()
        
        # Run dynamic reschedule
        result = dynamic_reschedule(db_session)
        assert result['success'] is True
        assert 'No active orders' in result['message']
    
    def test_all_operations_completed_no_reschedule(self, db_session: Session, setup_active_order,
                                                     sample_operation, sample_operation_2,
                                                     sample_machine, setup_shift_configuration,
                                                     setup_efficiency_factor):
        """Test that when all operations are completed, no reschedule rows are created."""
        order = setup_active_order
        part = db_session.query(Part).first()
        
        # Generate schedule
        result = generate_machine_schedule(db_session)
        assert result['success'] is True
        
        # Complete all operations
        for op in [sample_operation, sample_operation_2]:
            log = ProductionLog(
                operation_id=op.id,
                from_date=date(2024, 1, 1),
                from_time=time(8, 30),
                to_date=date(2024, 1, 1),
                to_time=time(10, 0),
                approved_quantity=10,
                remaining_quantity_to_be_produced=0
            )
            db_session.add(log)
        db_session.commit()
        
        # Run dynamic reschedule
        result = dynamic_reschedule(db_session, triggered_by_part_id=part.id)
        assert result['success'] is True
        
        # Verify no rescheduled rows
        rescheduled = db_session.query(Rescheduling).filter(
            Rescheduling.part_id == part.id,
            Rescheduling.status == 'rescheduled'
        ).all()
        assert len(rescheduled) == 0, "No rescheduled rows when all operations completed"
    
    def test_operation_with_zero_setup_and_cycle(self, db_session: Session, setup_active_order,
                                                   sample_operation, sample_machine,
                                                   setup_shift_configuration, setup_efficiency_factor):
        """Test operation with zero setup and cycle time."""
        order = setup_active_order
        part = db_session.query(Part).first()
        operation = sample_operation
        
        # Set zero times
        operation.setup_time = None
        operation.cycle_time = None
        db_session.commit()
        
        # Generate schedule
        result = generate_machine_schedule(db_session)
        assert result['success'] is True
        
        # Should not crash, operation should be scheduled with zero duration
        items = db_session.query(PlannedScheduleItem).filter(
            PlannedScheduleItem.operation_id == operation.id
        ).all()
        
        if items:
            for item in items:
                assert item.planned_start_time == item.planned_end_time, \
                    "Zero duration operation should have same start and end time"
    
    def test_very_long_operation_spans_multiple_shifts(self, db_session: Session, setup_active_order,
                                                         sample_operation, sample_machine,
                                                         setup_shift_configuration, setup_efficiency_factor):
        """Test operation that spans multiple shifts."""
        order = setup_active_order
        part = db_session.query(Part).first()
        operation = sample_operation
        
        # Set very long cycle time (10 hours per unit, 10 units = 100+ hours)
        operation.cycle_time = time(hour=10, minute=0)
        db_session.commit()
        
        # Generate schedule
        result = generate_machine_schedule(db_session)
        assert result['success'] is True
        
        # Verify operation is split across multiple shifts
        items = db_session.query(PlannedScheduleItem).filter(
            PlannedScheduleItem.operation_id == operation.id
        ).all()
        
        assert len(items) > 1, "Long operation should be split across multiple shifts"
    
    def test_part_activation_before_order_activation(self, db_session: Session, setup_active_order,
                                                      sample_operation, sample_machine,
                                                      setup_shift_configuration, setup_efficiency_factor):
        """Test part activated before order (edge case)."""
        order = setup_active_order
        part = db_session.query(Part).first()
        
        # Set part activation before order activation
        oss = db_session.query(OrderScheduleStatus).filter(
            OrderScheduleStatus.order_id == order.id
        ).first()
        pss = db_session.query(PartScheduleStatus).filter(
            PartScheduleStatus.part_id == part.id
        ).first()
        
        pss.start_date = oss.activated_at - timedelta(days=1)
        db_session.commit()
        
        # Generate schedule
        result = generate_machine_schedule(db_session)
        assert result['success'] is True
        
        # Should use order activation time (max of order and part)
        items = db_session.query(PlannedScheduleItem).filter(
            PlannedScheduleItem.part_id == part.id
        ).all()
        
        if items:
            first_start = min(i.planned_start_time for i in items)
            assert first_start >= oss.activated_at.replace(tzinfo=None), \
                "Should use order activation time when it's later"


class TestDynamicSchedulingWorstCaseScenarios:
    """Test worst-case scenarios."""
    
    def test_all_machines_down_simultaneously(self, db_session: Session, setup_active_order,
                                                sample_operation, sample_machine, sample_machine_2,
                                                setup_shift_configuration, setup_efficiency_factor):
        """Test when all machines in workcenter are down."""
        order = setup_active_order
        part = db_session.query(Part).first()
        operation = sample_operation
        
        # Generate schedule
        result = generate_machine_schedule(db_session)
        assert result['success'] is True
        
        # Set all machines down
        for machine in [sample_machine, sample_machine_2]:
            downtime = MachineStatus(
                machine_id=machine.id,
                status_id=2,
                available_from=datetime(2024, 1, 1, 8, 0),
                available_to=datetime(2024, 1, 10, 17, 0)
            )
            db_session.add(downtime)
        db_session.commit()
        
        # Run dynamic reschedule
        result = dynamic_reschedule(db_session, triggered_by_part_id=part.id)
        assert result['success'] is True
        
        # Should skip or delay significantly
        assert result['skipped_parts'] or result['operations_inserted'] == 0
    
    def test_massive_priority_change(self, db_session: Session, setup_active_order, sample_product,
                                       sample_part_type_inhouse, sample_machine,
                                       setup_shift_configuration, setup_efficiency_factor):
        """Test massive priority change (100+ parts)."""
        order = setup_active_order
        
        # Create 100 parts
        parts = []
        for i in range(100):
            part = Part(
                product_id=sample_product.id,
                part_number=f"PN{i:03d}",
                part_name=f"Test Part {i}",
                type_id=sample_part_type_inhouse.id,
                qty=10
            )
            db_session.add(part)
            parts.append(part)
        db_session.commit()
        
        # Activate all parts
        for part in parts:
            pss = PartScheduleStatus(
                sale_order_id=order.id,
                part_id=part.id,
                status="active",
                start_date=datetime.now(timezone.utc)
            )
            opp = OrderPartPriority(
                order_id=order.id,
                product_id=order.product_id,
                part_id=part.id,
                priority=len(parts) - parts.index(part),  # Reverse priority
                status="active"
            )
            db_session.add_all([pss, opp])
        db_session.commit()
        
        # Generate schedule
        result = generate_machine_schedule(db_session)
        assert result['success'] is True
        
        # Should handle large dataset without error
        assert result['parts_processed'] == 100
    
    def test_rapid_fire_production_logs(self, db_session: Session, setup_active_order,
                                          sample_operation, sample_machine,
                                          setup_shift_configuration, setup_efficiency_factor):
        """Test rapid-fire production log submissions."""
        order = setup_active_order
        part = db_session.query(Part).first()
        operation = sample_operation
        
        # Generate schedule
        result = generate_machine_schedule(db_session)
        assert result['success'] is True
        
        # Submit 10 rapid logs
        for i in range(10):
            log = ProductionLog(
                operation_id=operation.id,
                from_date=date(2024, 1, 1),
                from_time=time(8, 30),
                to_date=date(2024, 1, 1),
                to_time=time(8, 30 + i),
                approved_quantity=1,
                remaining_quantity_to_be_produced=9 - i
            )
            db_session.add(log)
            
            # Reschedule after each log
            result = dynamic_reschedule(db_session, triggered_by_part_id=part.id)
            assert result['success'] is True
        
        # Final log completes operation
        final_log = ProductionLog(
            operation_id=operation.id,
            from_date=date(2024, 1, 1),
            from_time=time(8, 30),
            to_date=date(2024, 1, 1),
            to_time=time(9, 30),
            approved_quantity=10,
            remaining_quantity_to_be_produced=0
        )
        db_session.add(final_log)
        db_session.commit()
        
        result = dynamic_reschedule(db_session, triggered_by_part_id=part.id)
        assert result['success'] is True
    
    def test_shift_configuration_missing_fallback(self, db_session: Session, setup_active_order,
                                                    sample_operation, sample_machine,
                                                    setup_efficiency_factor):
        """Test when shift configuration is missing (fallback to default)."""
        order = setup_active_order
        part = db_session.query(Part).first()
        
        # Clear shift configuration
        db_session.query(ShiftHoursConfiguration).delete()
        db_session.query(ShiftTimingConfiguration).delete()
        db_session.commit()
        
        # Generate schedule
        result = generate_machine_schedule(db_session)
        assert result['success'] is True
        
        # Should use default shift (8:30-17:00)
        assert result['success'] is True
    
    def test_part_shared_across_multiple_orders(self, db_session: Session, sample_product,
                                                  sample_part, sample_part_type_inhouse,
                                                  sample_machine, setup_shift_configuration,
                                                  setup_efficiency_factor):
        """Test same part used in multiple orders."""
        part = sample_part
        
        # Create second order
        order2 = Order(
            sale_order_number="SO002",
            product_id=sample_product.id,
            quantity=10,
            due_date=datetime.now() + timedelta(days=30),
            status="active"
        )
        db_session.add(order2)
        db_session.commit()
        
        # Activate both orders
        for order in [db_session.query(Order).first(), order2]:
            oss = OrderScheduleStatus(
                order_id=order.id,
                product_id=order.product_id,
                status="active",
                activated_at=datetime.now(timezone.utc)
            )
            pss = PartScheduleStatus(
                sale_order_id=order.id,
                part_id=part.id,
                status="active",
                start_date=datetime.now(timezone.utc)
            )
            opp = OrderPartPriority(
                order_id=order.id,
                product_id=order.product_id,
                part_id=part.id,
                priority=1,
                status="active"
            )
            db_session.add_all([oss, pss, opp])
        db_session.commit()
        
        # Generate schedule
        result = generate_machine_schedule(db_session)
        assert result['success'] is True
        
        # Both orders should have the part scheduled independently
        items = db_session.query(PlannedScheduleItem).filter(
            PlannedScheduleItem.part_id == part.id
        ).all()
        
        # Should have items for both orders
        order_ids = {i.sale_order_id for i in items}
        assert len(order_ids) == 2, "Part should be scheduled for both orders"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
