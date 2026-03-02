from datetime import datetime, timedelta, time
from typing import List, Dict, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_

from DB.database import get_db
from DB.models.oms import Order, Part, Product, Operation
from DB.models.configuration import Machine, WorkCenter
from DB.models.scheduling import (
    PartScheduleStatus, 
    ScheduleHistory, 
    PlannedScheduleItem,
    ShiftHoursConfiguration,
    MachineDowntime,
    EfficiencyFactor
)


class SchedulerEngine:
    """
    FIFO-based Machine Scheduling Engine for Active IN-HOUSE Parts
    """
    
    def __init__(self, db: Session):
        self.db = db
        self.efficiency_factor = self._get_efficiency_factor()
        
    def _get_efficiency_factor(self) -> float:
        """Get efficiency factor from database"""
        efficiency_record = self.db.query(EfficiencyFactor).first()
        return efficiency_record.efficiency_factor if efficiency_record else 0.85
    
    def _is_working_day(self, date: datetime) -> bool:
        """Check if given date is a working day"""
        return date.weekday() < 5  # Monday=0, Friday=4
    
    def _get_shift_hours(self, date: datetime) -> Tuple[time, time]:
        """Get shift start and end times for given date"""
        return time(9, 0), time(17, 0)  # 9AM to 5PM
    
    def _get_next_working_day_start(self, current_time: datetime) -> datetime:
        """Get the start time of the next working day"""
        next_day = current_time + timedelta(days=1)
        while not self._is_working_day(next_day):
            next_day += timedelta(days=1)
        
        shift_start, _ = self._get_shift_hours(next_day)
        return next_day.replace(
            hour=shift_start.hour, 
            minute=shift_start.minute, 
            second=0, 
            microsecond=0
        )
    
    def _calculate_operation_time(self, operation: Operation, quantity: int, is_first_unit: bool = True) -> float:
        """Calculate operation duration in hours"""
        setup_seconds = 0
        cycle_seconds = 0
        
        # Handle setup time (only for first unit)
        if operation.setup_time and is_first_unit:
            setup_seconds = (
                operation.setup_time.hour * 3600 + 
                operation.setup_time.minute * 60 + 
                operation.setup_time.second
            )
        
        # Handle cycle time
        if operation.cycle_time:
            cycle_seconds = (
                operation.cycle_time.hour * 3600 + 
                operation.cycle_time.minute * 60 + 
                operation.cycle_time.second
            )
        
        # Total time = setup (only for first unit) + (cycle_time × quantity)
        total_seconds = setup_seconds + (cycle_seconds * quantity)
        total_hours = total_seconds / 3600.0
        
        # Apply efficiency factor
        return total_hours / self.efficiency_factor
    
    def _schedule_operation(
        self, 
        operation: Operation, 
        machine: Machine, 
        quantity: int, 
        start_time: datetime,
        schedule_history_id: int,
        part_data: Dict
    ) -> PlannedScheduleItem:
        """Schedule a complete operation with shift boundary handling"""
        
        # Calculate duration
        duration_hours = self._calculate_operation_time(operation, quantity, True)
        
        # Get shift boundaries
        shift_start, shift_end = self._get_shift_hours(start_time)
        day_end = start_time.replace(
            hour=shift_end.hour, 
            minute=shift_end.minute, 
            second=0, 
            microsecond=0
        )
        
        # Calculate end time
        end_time = start_time + timedelta(hours=duration_hours)
        
        # Check if end time exceeds shift end
        if end_time > day_end:
            # Move to next day start
            next_day_start = self._get_next_working_day_start(start_time)
            end_time = next_day_start + timedelta(hours=duration_hours)
            start_time = next_day_start
        
        # Create schedule item
        schedule_item = PlannedScheduleItem(
            part_id=part_data['part_id'],
            part_number=part_data['part_number'],
            sale_order_id=part_data['order_id'],
            sale_order_number=part_data['sale_order_number'],
            operation_id=operation.id,
            machine_id=machine.id,
            planned_start_time=start_time,
            planned_end_time=end_time,
            total_quantity=quantity,
            remaining_quantity=0,
            status='pending',
            schedule_history_id=schedule_history_id
        )
        
        return schedule_item
    
    def _get_active_orders_fifo(self) -> List[Dict]:
        """Get active orders sorted by FIFO (earliest due date first)"""
        try:
            active_parts = (
                self.db.query(PartScheduleStatus, Part, Order, Product)
                .join(Part, Part.id == PartScheduleStatus.part_id)
                .join(Order, Order.id == PartScheduleStatus.sale_order_id)
                .join(Product, Product.id == Order.product_id)
                .filter(
                    and_(
                        PartScheduleStatus.status == "active",
                        Part.type_id == 1  # IN-HOUSE parts only
                    )
                )
                .order_by(Order.due_date.asc(), Order.id.asc())  # FIFO by due date, then by order ID
                .all()
            )
            
            result = []
            for part_status, part, order, product in active_parts:
                result.append({
                    'order_id': order.id,
                    'sale_order_number': order.sale_order_number,
                    'product_id': product.id,
                    'product_name': product.product_name,
                    'part_id': part.id,
                    'part_number': part.part_number,
                    'part_name': part.part_name,
                    'quantity': order.quantity,
                    'due_date': order.due_date,
                    'priority': getattr(order, 'priority', 1),
                    'activated_date': part_status.start_date or datetime.now()
                })
            
            return result
        except Exception as e:
            print(f"Error in _get_active_orders_fifo: {e}")
            return []
    
    def _get_operations_for_parts(self, part_ids: List[int]) -> Dict[int, List[Operation]]:
        """Get all operations for given part IDs in sequence"""
        try:
            operations = (
                self.db.query(Operation)
                .filter(Operation.part_id.in_(part_ids))
                .order_by(Operation.part_id, Operation.operation_number.asc())
                .all()
            )
            
            # Group by part_id
            result = {}
            for op in operations:
                result.setdefault(op.part_id, []).append(op)
            
            return result
        except Exception as e:
            print(f"Error in _get_operations_for_parts: {e}")
            return {}
    
    def _get_machines_by_workcenter(self) -> Dict[int, List[Machine]]:
        """Get all machines grouped by workcenter"""
        try:
            machines = (
                self.db.query(Machine)
                .join(WorkCenter)
                .filter(WorkCenter.is_schedulable == True)
                .all()
            )
            
            result = {}
            for machine in machines:
                result.setdefault(machine.work_center_id, []).append(machine)
            
            return result
        except Exception as e:
            print(f"Error in _get_machines_by_workcenter: {e}")
            return {}
    
    def clear_existing_schedule(self):
        """Clear existing schedule data"""
        try:
            self.db.query(PlannedScheduleItem).delete()
            self.db.query(ScheduleHistory).delete()
            self.db.commit()
        except Exception as e:
            print(f"Error in clear_existing_schedule: {e}")
            self.db.rollback()
            raise
    
    def generate_schedule(
        self, 
        start_date: Optional[datetime] = None, 
        end_date: Optional[datetime] = None
    ) -> Dict:
        """
        Generate FIFO-based machine schedule for active IN-HOUSE parts
        """
        try:
            if not start_date:
                start_date = datetime.now()
            if not end_date:
                end_date = start_date + timedelta(days=30)
            
            # Clear existing schedule
            self.clear_existing_schedule()
            
            # Create new schedule history
            schedule_history = ScheduleHistory(
                version=1,
                is_active=True,
                generated_at=datetime.now()
            )
            self.db.add(schedule_history)
            self.db.flush()
            
            # Get active orders in FIFO sequence
            active_orders_parts = self._get_active_orders_fifo()
            
            if not active_orders_parts:
                return {
                    'success': False,
                    'message': 'No active IN-HOUSE parts found for scheduling',
                    'schedule_history_id': schedule_history.id
                }
            
            # Get operations and machines
            part_ids = [item['part_id'] for item in active_orders_parts]
            operations_by_part = self._get_operations_for_parts(part_ids)
            machines_by_workcenter = self._get_machines_by_workcenter()
            
            schedule_items = []
            current_time = start_date
            
            # Process orders in FIFO sequence
            for part_data in active_orders_parts:
                part_id = part_data['part_id']
                operations = operations_by_part.get(part_id, [])
                
                if not operations:
                    continue
                
                # Process operations in sequence
                for operation in operations:
                    # Find machines for this operation's workcenter
                    available_machines = machines_by_workcenter.get(operation.workcenter_id, [])
                    
                    if not available_machines:
                        continue  # Skip if no machines available
                    
                    # Use the first available machine
                    machine = available_machines[0]
                    
                    # Schedule the operation
                    schedule_item = self._schedule_operation(
                        operation=operation,
                        machine=machine,
                        quantity=part_data['quantity'],
                        start_time=current_time,
                        schedule_history_id=schedule_history.id,
                        part_data=part_data
                    )
                    
                    schedule_items.append(schedule_item)
                    
                    # Update current_time to the end of the last scheduled item
                    current_time = schedule_item.planned_end_time
            
            # Bulk insert schedule items
            if schedule_items:
                self.db.add_all(schedule_items)
                self.db.commit()
            
            return {
                'success': True,
                'message': f'FIFO schedule generated for {len(active_orders_parts)} active IN-HOUSE parts',
                'schedule_history_id': schedule_history.id,
                'operations_scheduled': len(schedule_items),
                'start_date': start_date,
                'end_date': end_date,
                'parts_processed': len(active_orders_parts)
            }
            
        except Exception as e:
            self.db.rollback()
            print(f"Error in generate_schedule: {e}")
            return {
                'success': False,
                'message': f'Scheduling failed: {str(e)}',
                'schedule_history_id': None
            }


def generate_machine_schedule(
    db: Session, 
    start_date: Optional[datetime] = None, 
    end_date: Optional[datetime] = None
) -> Dict:
    """
    Main function to generate FIFO-based machine schedule
    """
    scheduler = SchedulerEngine(db)
    return scheduler.generate_schedule(start_date, end_date)
