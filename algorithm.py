"""
algorithm.py
============
FIFO-based Machine Scheduling Engine.

Called by the router as:
    from algorithm import generate_machine_schedule
    result = generate_machine_schedule(db, start_date, end_date)

Return keys used by the /generate-schedule endpoint:
    success, message, schedule_history_id, operations_scheduled,
    start_date, end_date, parts_processed   ← must match router expectation
"""

from datetime import datetime, timedelta, time, timezone
from typing import Dict, List, Optional, Tuple
from sqlalchemy import cast, Integer

from sqlalchemy.orm import Session
from sqlalchemy import and_, text

# ── OMS models ────────────────────────────────────────────────────────────
from DB.models.oms import (
    Order,                        # id, sale_order_number, product_id, quantity, due_date, status
    Part,                         # id, part_number, part_name, type_id (1=IN-House), product_id
    Product,                      # id, product_name
    Operation,                    # id, operation_number, setup_time (TIME), cycle_time (TIME),
                                  # workcenter_id (plain Integer – no FK), part_id
    OrderPartPriority,            # id, order_id, part_id, product_id, priority
    OutSourceOperationStatus,     # id, part_id, order_id, operation_id, sent_date, delivered_date, status
    # OrderPartsRawMaterialLinked,  # id, order_id, part_id, raw_material_id  +  .raw_material rel.
)

# ── Configuration models ──────────────────────────────────────────────────
from DB.models.configuration import (
    Machine,      # id, work_center_id, type, make, model, …
    WorkCenter,   # id, work_center_name, code, is_schedulable
)

# ── Scheduling models ─────────────────────────────────────────────────────
from DB.models.scheduling import (
    OrderScheduleStatus,     # order_id, product_id, status, activated_at (DateTime, tz-aware)
    PartScheduleStatus,      # part_id, sale_order_id, status ('active'/'inactive'),
                             # start_date (DateTime) = when this part was FIRST set active,
                             # created_at, updated_at
    ScheduleHistory,         # id, version, is_active, generated_at
    PlannedScheduleItem,     # all schedule output rows
    ShiftHoursConfiguration, # date (Date), working_day (Boolean), number_of_shifts (Integer)
    ShiftTimingConfiguration, # shift_code, shift_start, shift_end
    MachineOperatorShiftAssignment, # machine_id, operator_id, shift_config_id
    MachineStatus,           # machine_id, status_id (1=ON / 2=OFF), available_from, available_to
    EfficiencyFactor,        # efficiency_factor (Float)
    Rescheduling,
    ProductionLog
)

# ── Constants ─────────────────────────────────────────────────────────────
DEFAULT_SHIFT_START = time(hour=8, minute=30)
DEFAULT_SHIFT_END   = time(hour=17, minute=0)
STATUS_OFF          = 2   # MachineStatus.status_id value meaning OFF
IN_HOUSE_TYPE_ID    = 1   # Part.type_id for IN-House parts
OUT_SOURCE_TYPE_ID  = 2   # Operation.part_type_id value for Out-Source (oms.part_types id=2)
OUT_SOURCE_PROVISION = timedelta(days=7)  # Maximum vendor turnaround: 1 week



# ── Dynamic scheduling constant ───────────────────────────────────────────
STALE_INPROGRESS_WORKING_DAYS = 1  # Flag op stale after N working days with no log



# =============================================================================
# Helpers
# =============================================================================

def _strip_tz(dt: Optional[datetime]) -> Optional[datetime]:
    """
    Remove timezone info from a datetime so it can be safely compared
    with naive datetimes throughout the scheduler.

    activated_at is stored as datetime.now(timezone.utc) by the router,
    so it arrives as a timezone-aware value and must be normalised.
    """
    if dt is None:
        return None
    return dt.replace(tzinfo=None) if dt.tzinfo is not None else dt


# =============================================================================
# Scheduler Engine
# =============================================================================

class SchedulerEngine:
    """
    FIFO Machine Scheduling Engine for Active IN-HOUSE Parts.

    Scheduling order (aligned with oms.order_part_priorities)
    ---------------------------------------------------------
    Parts are scheduled in global OrderPartPriority order: priority 1, then 2,
    then 3, … across all orders. Only rows with status='active' and
    priority > 0 are considered. Within a part, operations are sequential.
    Machine utilisation is tracked via self.machine_end_time so no two
    operations on the same machine ever overlap.

    If no OrderPartPriority rows exist, the engine falls back to processing
    order-by-order with parts per order in priority order.
    """

    # ------------------------------------------------------------------ #
    #  Construction                                                        #
    # ------------------------------------------------------------------ #

    def __init__(self, db: Session):
        self.db = db
        self.efficiency_factor: float              = self._load_efficiency()
        self.machine_end_time:  Dict[int, datetime] = {}   # machine_id → earliest free

    def _configured_shift_hours(self, cfg: ShiftHoursConfiguration) -> float:
        """
        Calculate total shift hours for a given ShiftHoursConfiguration.
        Used for capacity planning and available hours calculations.
        """
        if not cfg.working_day and cfg.number_of_shifts == 0:
            return 0.0
        if cfg.shift_timings:
            total = 0.0
            for timing in cfg.shift_timings:
                start_dt = datetime.combine(cfg.date, timing.shift_start)
                end_dt = datetime.combine(cfg.date, timing.shift_end)
                total += (end_dt - start_dt).total_seconds() / 3600
            return max(total, 0.0)
        # Fallback: use DEFAULT shift hours (8.5 hours from 8:30-17:00)
        return 8.5

    def _load_efficiency(self) -> float:
        record = self.db.query(EfficiencyFactor).first()
        return record.efficiency_factor if record else 1.0

    def _get_assigned_shifts_for_machine(
        self,
        machine_id: int,
        dt: datetime
    ) -> List[ShiftTimingConfiguration]:
        """
        Get all shift timings assigned to a specific machine on a given date.
        """
        # Get shift config for the date
        shift_date = dt.date()
        shift_config = (
            self.db.query(ShiftHoursConfiguration)
            .filter(ShiftHoursConfiguration.date == shift_date)
            .first()
        )
        if not shift_config:
            return []
        
        # Get all machine-operator assignments for this shift config and machine
        assignments = (
            self.db.query(MachineOperatorShiftAssignment)
            .filter(
                MachineOperatorShiftAssignment.shift_config_id == shift_config.id,
                MachineOperatorShiftAssignment.machine_id == machine_id
            )
            .all()
        )
        if not assignments:
            return []
        
        # Collect all shift timings from the shift config
        return shift_config.shift_timings

    def _get_assigned_shifts_for_machine_operator(
        self,
        machine_id: int,
        operator_id: int,
        dt: datetime
    ) -> List[ShiftTimingConfiguration]:
        """
        Get shift timings assigned to a specific machine-operator pair on a given date.
        """
        shift_date = dt.date()
        shift_config = (
            self.db.query(ShiftHoursConfiguration)
            .filter(ShiftHoursConfiguration.date == shift_date)
            .first()
        )
        if not shift_config:
            return []
        
        assignments = (
            self.db.query(MachineOperatorShiftAssignment)
            .filter(
                MachineOperatorShiftAssignment.shift_config_id == shift_config.id,
                MachineOperatorShiftAssignment.machine_id == machine_id,
                MachineOperatorShiftAssignment.operator_id == operator_id
            )
            .all()
        )
        if not assignments:
            return []
        
        return shift_config.shift_timings

    # ------------------------------------------------------------------ #
    #  Working-calendar helpers                                            #
    # ------------------------------------------------------------------ #

    def _is_working_day(self, dt: datetime) -> bool:
        """
        Reads ShiftHoursConfiguration.working_day for dt's date.
        Falls back to Mon–Fri (weekday < 5) when no config row exists.
        """
        cfg = (
            self.db.query(ShiftHoursConfiguration)
            .filter(ShiftHoursConfiguration.date == dt.date())
            .first()
        )
        if cfg is None:
            return dt.weekday() < 5
        # Dedicated work on a non-working day is allowed by selecting shifts.
        return bool(cfg.working_day or (cfg.number_of_shifts and cfg.number_of_shifts > 0))

    def _shift_window(self, dt: datetime, machine_id: Optional[int] = None, operator_id: Optional[int] = None) -> Tuple[time, time]:
        """
        Returns shift start/end times for a date, considering machine-operator assignments.
        Priority:
          1) Assigned shifts for machine-operator (if both provided)
          2) Assigned shifts for machine (if only machine provided)
          3) If no assignments: ONLY GENERAL shift (ignore OT shifts)
          4) Fallback to default GENERAL shift
        """
        cfg = (
            self.db.query(ShiftHoursConfiguration)
            .filter(ShiftHoursConfiguration.date == dt.date())
            .first()
        )
        
        if cfg and cfg.shift_timings:
            # Check if we have machine-operator or machine-only assignments
            assigned_timings = []
            
            if machine_id and operator_id:
                assigned_timings = self._get_assigned_shifts_for_machine_operator(machine_id, operator_id, dt)
            elif machine_id:
                assigned_timings = self._get_assigned_shifts_for_machine(machine_id, dt)
            
            if assigned_timings:
                # Use assigned timings (may include OT)
                starts = [st.shift_start for st in assigned_timings]
                ends = [st.shift_end for st in assigned_timings]
                return min(starts), max(ends)
            else:
                # No assignments: use ONLY GENERAL shift
                general_timings = [st for st in cfg.shift_timings if st.shift_code == "GENERAL"]
                if general_timings:
                    starts = [st.shift_start for st in general_timings]
                    ends = [st.shift_end for st in general_timings]
                    return min(starts), max(ends)
        
        # Fallback
        n = cfg.number_of_shifts if (cfg and cfg.number_of_shifts) else 1
        shift_start = DEFAULT_SHIFT_START
        shift_end = DEFAULT_SHIFT_END
        return shift_start, shift_end

    def _shift_start_dt(self, dt: datetime, machine_id: Optional[int] = None, operator_id: Optional[int] = None) -> datetime:
        shift_start, _ = self._shift_window(dt, machine_id, operator_id)
        return dt.replace(
            hour=shift_start.hour,
            minute=shift_start.minute,
            second=0,
            microsecond=0,
        )

    def _shift_end_dt(self, dt: datetime, machine_id: Optional[int] = None, operator_id: Optional[int] = None) -> datetime:
        _, shift_end = self._shift_window(dt, machine_id, operator_id)
        return dt.replace(
            hour=shift_end.hour,
            minute=shift_end.minute,
            second=0,
            microsecond=0,
        )

    def _next_shift_start(self, dt: datetime, machine_id: Optional[int] = None, operator_id: Optional[int] = None) -> datetime:
        """Shift-start datetime of the next working day after dt."""
        candidate = dt + timedelta(days=1)
        for _ in range(730):                          # guard: ~2 years
            if self._is_working_day(candidate):
                return self._shift_start_dt(candidate, machine_id, operator_id)
            candidate += timedelta(days=1)
        raise RuntimeError(
            "No working day found in the next 730 days — "
            "check ShiftHoursConfiguration."
        )

    def adjust_to_shift(self, dt: datetime, machine_id: Optional[int] = None, operator_id: Optional[int] = None) -> datetime:
        """
        Snap dt forward to the nearest valid working-shift moment.

        Rules (applied in order, repeated until stable):
          1. Non-working day     → jump to next shift start.
          2. Before shift start  → set to shift start of that day.
          3. At/after shift end  → jump to next shift start.
        """
        for _ in range(1460):                         # guard: ~4 years
            if not self._is_working_day(dt):
                dt = self._next_shift_start(dt, machine_id, operator_id)
                continue

            s = self._shift_start_dt(dt, machine_id, operator_id)
            e = self._shift_end_dt(dt, machine_id, operator_id)

            if dt < s:
                return s
            if dt >= e:
                dt = self._next_shift_start(dt, machine_id, operator_id)
                continue
            return dt

        raise RuntimeError("adjust_to_shift: could not find a valid shift window.")

    # ------------------------------------------------------------------ #
    #  Machine-availability helpers                                        #
    # ------------------------------------------------------------------ #

    def _machine_next_available(
        self, machine: Machine, from_time: datetime
    ) -> Optional[datetime]:
        """
        Earliest datetime >= from_time when machine is ON and inside a shift.

        MachineStatus holds ONE row per machine (updated in-place by the
        machine_status router).  We check whether from_time falls inside
        an OFF window (status_id=2, available_from ≤ t < available_to).

        Returns None when available_to is NULL (permanently OFF).
        """
        candidate = from_time
        for _ in range(1000):                         # guard
            off = (
                self.db.query(MachineStatus)
                .filter(
                    and_(
                        MachineStatus.machine_id     == machine.id,
                        MachineStatus.status_id      == STATUS_OFF,
                        MachineStatus.available_from <= candidate,
                        (
                            (MachineStatus.available_to == None) |
                            (MachineStatus.available_to  > candidate)
                        ),
                    )
                )
                .first()
            )
            if off:
                if off.available_to is None:
                    return None                       # permanently OFF
                candidate = self.adjust_to_shift(off.available_to, machine.id)
                continue

            return self.adjust_to_shift(candidate, machine.id)

        raise RuntimeError(
            f"Cannot resolve availability for machine {machine.id}."
        )

    def _pick_best_machine(
        self,
        workcenter_id:      int,
        machines_by_wc:     Dict[int, List[Machine]],
        op_candidate_start: datetime,
    ) -> Tuple[Optional[Machine], datetime]:
        """
        Pick the machine in workcenter_id with the earliest actual start time:
          actual_start = max(op_candidate_start, machine_end_time[m.id])
                         → adjusted for OFF windows.

        Returns (machine, actual_start) or (None, op_candidate_start) when
        no machine is usable.
        """
        best_machine: Optional[Machine]  = None
        best_start:   Optional[datetime] = None

        for m in machines_by_wc.get(workcenter_id, []):
            machine_free = self.machine_end_time.get(m.id, op_candidate_start)
            earliest     = max(op_candidate_start, machine_free)
            avail        = self._machine_next_available(m, earliest)
            if avail is None:
                continue                             # permanently OFF
            if best_start is None or avail < best_start:
                best_start   = avail
                best_machine = m

        return best_machine, (best_start or op_candidate_start)

    # ------------------------------------------------------------------ #
    #  Duration                                                            #
    # ------------------------------------------------------------------ #

    def _operation_duration_hours(
        self, operation: Operation, quantity: int
    ) -> float:
        """
        Duration (hours):
          = (setup_seconds + cycle_seconds × quantity) / 3600

        Setup applied once per batch.
        Returns 0.0 when both setup_time and cycle_time are null/zero.

        Operation.setup_time / cycle_time → Python datetime.time objects
        (stored as SQL TIME columns).
        """
        def _secs(t: Optional[time]) -> int:
            if t is None:
                return 0
            return t.hour * 3600 + t.minute * 60 + t.second

        total_sec = _secs(operation.setup_time) + _secs(operation.cycle_time) * quantity
        if total_sec == 0:
            return 0.0
        return (total_sec / 3600.0)

    # ------------------------------------------------------------------ #
    #  Single-operation scheduler                                          #
    # ------------------------------------------------------------------ #

    def _schedule_operation_blocks(
        self,
        operation:           Operation,
        machine:             Machine,
        quantity:            int,
        op_start:            datetime,
        schedule_history_id: int,
        part_data:           Dict,
    ) -> Tuple[List[PlannedScheduleItem], datetime]:
        """
        Place operation on machine starting at op_start.

        Produces one PlannedScheduleItem per contiguous working segment.
        A new segment begins whenever the duration hits:
          • the end of the current shift, or
          • the start of an upcoming machine OFF window.

        Tracks remaining_quantity for each segment based on setup_time, cycle_time,
        and available window hours.

        Returns (list_of_items, op_end_time).
        """
        def _secs(t: Optional[time]) -> int:
            if t is None:
                return 0
            return t.hour * 3600 + t.minute * 60 + t.second

        setup_seconds = _secs(operation.setup_time)
        cycle_seconds = _secs(operation.cycle_time)
        
        # Handle case where both setup and cycle times are zero
        if setup_seconds == 0 and cycle_seconds == 0:
            # Create single item with full quantity
            items = [
                PlannedScheduleItem(
                    part_id             = part_data['part_id'],
                    part_number         = part_data['part_number'],
                    sale_order_id       = part_data['order_id'],
                    sale_order_number   = part_data['sale_order_number'],
                    operation_id        = operation.id,
                    machine_id          = machine.id,
                    planned_start_time  = op_start,
                    planned_end_time    = op_start,
                    total_quantity      = quantity,
                    remaining_quantity  = quantity,
                    status              = 'pending',
                    schedule_history_id = schedule_history_id,
                )
            ]
            return items, op_start

        remaining_hours = self._operation_duration_hours(operation, quantity)
        remaining_quantity = quantity
        items: List[PlannedScheduleItem] = []
        cur = op_start
        setup_applied = False
        # remaining_cycle_seconds tracks how many seconds of the CURRENT unit's
        # cycle are still left to run.  It starts at cycle_seconds and is
        # decremented as production windows are consumed.  When it reaches 0,
        # one unit is complete and it resets for the next unit.
        remaining_cycle_seconds = cycle_seconds

        while remaining_hours > 1e-9 and remaining_quantity > 0:
            shift_end = self._shift_end_dt(cur, machine.id)

            # Machine OFF window starting after cur but before shift_end
            next_off = (
                self.db.query(MachineStatus)
                .filter(
                    and_(
                        MachineStatus.machine_id    == machine.id,
                        MachineStatus.status_id     == STATUS_OFF,
                        MachineStatus.available_from >  cur,
                        MachineStatus.available_from <  shift_end,
                    )
                )
                .order_by(MachineStatus.available_from.asc())
                .first()
            )

            window_end   = min(shift_end, next_off.available_from) if next_off else shift_end
            window_hours = (window_end - cur).total_seconds() / 3600.0

            if window_hours <= 1e-9:
                # Advance past the obstruction
                if next_off and window_end == next_off.available_from:
                    if next_off.available_to:
                        cur = self.adjust_to_shift(next_off.available_to, machine.id)
                        setup_applied = False          # Machine OFF → part removed → re-setup needed
                        remaining_cycle_seconds = cycle_seconds  # part removed, cycle resets
                    else:
                        break                          # machine permanently OFF
                else:
                    # Zero-width shift boundary — part stays on machine; no re-setup.
                    cur = self._next_shift_start(cur, machine.id)
                    # setup_applied and remaining_cycle_seconds intentionally unchanged
                continue

            # ── Step 1: consume setup if not yet applied ─────────────────
            if not setup_applied:
                available_production_seconds = window_hours * 3600 - setup_seconds
                if available_production_seconds <= 0:
                    # Window too small even for setup — skip to next window.
                    # Part has not been touched; setup_applied stays False.
                    if next_off and window_end == next_off.available_from:
                        if next_off.available_to:
                            cur = self.adjust_to_shift(next_off.available_to, machine.id)
                            remaining_cycle_seconds = cycle_seconds
                        else:
                            break
                    else:
                        cur = self._next_shift_start(cur, machine.id)
                    continue
                setup_applied = True
                window_production_seconds = available_production_seconds  # seconds left for production after setup
            else:
                window_production_seconds = window_hours * 3600  # full window available for production

            # ── Step 2: how much of the current unit's cycle fits? ────────
            # remaining_cycle_seconds = how many seconds of the current unit
            # still need to run (full cycle_seconds on a fresh unit, or
            # whatever is left after a prior segment consumed part of it).
            if window_production_seconds >= remaining_cycle_seconds:
                # ── Case A: current unit COMPLETES inside this window ─────
                # Determine how many additional whole units also fit.
                leftover_seconds = window_production_seconds - remaining_cycle_seconds
                extra_units      = int(leftover_seconds / cycle_seconds) if cycle_seconds > 0 else 0
                segment_quantity = min(remaining_quantity, 1 + extra_units)

                # Exact time consumed by this segment
                first_unit_secs  = remaining_cycle_seconds
                extra_unit_secs  = (segment_quantity - 1) * cycle_seconds
                production_secs  = first_unit_secs + extra_unit_secs
                setup_cost_secs  = setup_seconds if not setup_applied or window_production_seconds == window_hours * 3600 else setup_seconds
                # setup was consumed before window_production_seconds was computed,
                # so include it only when this is the first segment of the operation.
                if items:
                    # setup was already recorded in a previous segment's time
                    segment_secs = production_secs
                else:
                    segment_secs = setup_seconds + production_secs

                segment_end   = cur + timedelta(seconds=segment_secs)
                segment_hours = segment_secs / 3600.0

                remaining_quantity      -= segment_quantity
                remaining_cycle_seconds  = cycle_seconds  # reset for next unit
                remaining_hours         -= segment_hours

                print(
                    f"[DEBUG][SEGMENT-COMPLETE] "
                    f"Part {part_data['part_number']} | Op {operation.operation_number} | "
                    f"Machine {machine.id} | {cur} → {segment_end} | "
                    f"Units done={segment_quantity} | Remaining qty={remaining_quantity}"
                )

                items.append(
                    PlannedScheduleItem(
                        part_id             = part_data['part_id'],
                        part_number         = part_data['part_number'],
                        sale_order_id       = part_data['order_id'],
                        sale_order_number   = part_data['sale_order_number'],
                        operation_id        = operation.id,
                        machine_id          = machine.id,
                        planned_start_time  = cur,
                        planned_end_time    = segment_end,
                        total_quantity      = quantity,
                        remaining_quantity  = remaining_quantity,
                        status              = 'pending',
                        schedule_history_id = schedule_history_id,
                    )
                )

                if remaining_hours > 1e-9 and remaining_quantity > 0:
                    if next_off and segment_end >= next_off.available_from:
                        if next_off.available_to:
                            cur = self.adjust_to_shift(next_off.available_to, machine.id)
                            setup_applied = False
                            remaining_cycle_seconds = cycle_seconds
                        else:
                            break
                    else:
                        # Shift still has time left; continue in the same shift iteration
                        cur = segment_end

            else:
                # ── Case B: window ends before current unit's cycle completes ─
                # The unit is partially done; it stays on the machine.
                # Record the window as a block, subtract consumed time from
                # remaining_cycle_seconds, advance to next shift without re-setup.
                cycle_secs_done     = window_production_seconds
                remaining_cycle_seconds -= cycle_secs_done

                if items:
                    segment_secs = window_production_seconds  # setup already accounted for
                else:
                    segment_secs = setup_seconds + window_production_seconds

                segment_end   = window_end
                segment_hours = segment_secs / 3600.0
                remaining_hours -= segment_hours

                print(
                    f"[DEBUG][SEGMENT-PARTIAL] "
                    f"Part {part_data['part_number']} | Op {operation.operation_number} | "
                    f"Machine {machine.id} | {cur} → {segment_end} | "
                    f"Cycle progress: {cycle_secs_done/60:.1f} min done, "
                    f"{remaining_cycle_seconds/60:.1f} min remaining | "
                    f"Part STAYS ON MACHINE — no re-setup next shift"
                )

                items.append(
                    PlannedScheduleItem(
                        part_id             = part_data['part_id'],
                        part_number         = part_data['part_number'],
                        sale_order_id       = part_data['order_id'],
                        sale_order_number   = part_data['sale_order_number'],
                        operation_id        = operation.id,
                        machine_id          = machine.id,
                        planned_start_time  = cur,
                        planned_end_time    = segment_end,
                        total_quantity      = quantity,
                        remaining_quantity  = remaining_quantity,  # unit not yet complete
                        status              = 'pending',
                        schedule_history_id = schedule_history_id,
                    )
                )

                if next_off and segment_end >= next_off.available_from:
                    if next_off.available_to:
                        cur = self.adjust_to_shift(next_off.available_to, machine.id)
                        setup_applied = False           # machine OFF → part removed
                        remaining_cycle_seconds = cycle_seconds  # cycle resets
                        print(
                            f"[DEBUG][SEGMENT-PARTIAL] Machine goes OFF — "
                            f"re-setup needed when machine returns at {cur}"
                        )
                    else:
                        break
                else:
                    # Shift ended, part stays on machine
                    cur = self._next_shift_start(segment_end, machine.id)
                    # setup_applied stays True, remaining_cycle_seconds carries over
                    print(
                        f"[DEBUG][SEGMENT-PARTIAL] Resuming at {cur} | "
                        f"Remaining cycle = {remaining_cycle_seconds/60:.1f} min | "
                        f"Expected end ≈ {cur + timedelta(seconds=remaining_cycle_seconds)}"
                    )

        op_end = items[-1].planned_end_time if items else op_start
        return items, op_end

    # ------------------------------------------------------------------ #
    #  Phase A – data loaders                                              #
    # ------------------------------------------------------------------ #

    def _load_active_orders(self) -> List[Dict]:
        """
        Phase A1 + A2.

        Fetches orders where OrderScheduleStatus.status = 'active'
        AND activated_at IS NOT NULL.

        activated_at is stored as a tz-aware datetime (UTC); it is
        stripped to naive before use to avoid comparison crashes.

        Sorted: due_date ASC → order.id ASC (deterministic tie-break).
        """
        try:
            rows = (
                self.db.query(Order, OrderScheduleStatus, Product)
                .join(OrderScheduleStatus,
                      OrderScheduleStatus.order_id == Order.id)
                .join(Product,
                      Product.id == Order.product_id)
                .filter(
                    and_(
                        OrderScheduleStatus.status       == 'active',
                        OrderScheduleStatus.activated_at != None,
                    )
                )
                .order_by(Order.due_date.asc(), Order.id.asc())
                .all()
            )

            return [
                {
                    'order_id':          o.id,
                    'sale_order_number': o.sale_order_number,
                    'product_id':        p.id,
                    'product_name':      p.product_name,
                    'quantity':          o.quantity,
                    'due_date':          o.due_date,
                    # Strip timezone – activated_at is stored as UTC-aware datetime
                    'activation_time':   _strip_tz(oss.activated_at),
                }
                for o, oss, p in rows
            ]

        except Exception as e:
            print(f"[ERROR] _load_active_orders: {e}")
            return []

    def _load_scheduled_items_by_priority(
        self,
        active_orders: List[Dict],
        order_parts_map: Dict[int, List[Dict]],
    ) -> List[Tuple[Dict, Dict]]:
        """
        Build a single list of (order_dict, part_data) ordered by global
        OrderPartPriority.priority ASC so the algorithm schedules parts
        strictly by priority (1, 2, 3, … across all orders).

        Only includes rows where OrderPartPriority.status == 'active' and
        priority is set; part must appear in order_parts_map (active in
        PartScheduleStatus for that order).
        """
        try:
            order_by_id = {o['order_id']: o for o in active_orders}
            opp_rows = (
                self.db.query(OrderPartPriority)
                .filter(
                    OrderPartPriority.status == 'active',
                    OrderPartPriority.priority.isnot(None),
                    OrderPartPriority.priority > 0,
                )
                .order_by(OrderPartPriority.priority.asc(), OrderPartPriority.id.asc())
                .all()
            )
            result: List[Tuple[Dict, Dict]] = []
            for opp in opp_rows:
                order_dict = order_by_id.get(opp.order_id)
                if not order_dict:
                    continue
                parts = order_parts_map.get(opp.order_id, [])
                part_data = next((p for p in parts if p['part_id'] == opp.part_id), None)
                if part_data is None:
                    continue
                result.append((order_dict, part_data))
            return result
        except Exception as e:
            print(f"[ERROR] _load_scheduled_items_by_priority: {e}")
            return []

    def _load_parts_for_order(self, order: Dict) -> List[Dict]:
        """
        Phase A3.

        MODIFICATION 1 — Only ACTIVE parts:
          Joins PartScheduleStatus and returns only the IN-HOUSE parts
          whose status = 'active' for this specific order.
          Inactive / not-yet-activated parts are silently excluded.

        MODIFICATION 2 — part_activation_time:
          Reads PartScheduleStatus.start_date (the timestamp when this
          part was FIRST set to active).  This is used in the main loop
          to break the cascade for parts added after the order went live:

            part_start = max(current_time, part_activation_time)

          • Parts activated WITH the order → start_date ≈ order.activated_at
            → max() returns current_time → normal cascade applies.
          • Parts added LATER → start_date > order.activated_at
            → max() returns start_date → cascade broken, part starts
            at its own activation time regardless of previous part's end.

        Execution order: OrderPartPriority ASC, then Part.id ASC fallback.

        Raw-material gate: RawMaterial.status == 'Available'.
        """
        try:
            order_id   = order['order_id']
            product_id = order['product_id']

            # ── Only ACTIVE IN-HOUSE parts for this specific order ─────── #
            # PartScheduleStatus.sale_order_id scopes the status to the order,
            # so the same part used in two orders is handled independently.
            print(f"[DEBUG] _load_parts_for_order: order_id={order_id}, product_id={product_id}")
            active_rows = (
                self.db.query(PartScheduleStatus, Part)
                .join(Part, Part.id == PartScheduleStatus.part_id)
                .filter(
                    and_(
                        PartScheduleStatus.sale_order_id == order_id,
                        PartScheduleStatus.status        == 'active',
                        Part.type_id                     == IN_HOUSE_TYPE_ID,
                    )
                )
                .all()
            )
            print(f"[DEBUG] _load_parts_for_order: found {len(active_rows)} active_rows")

            if not active_rows:
                print(f"[DEBUG] _load_parts_for_order: no active rows for order {order_id}")
                return []

            part_map:            Dict[int, Part]     = {}
            part_activation_map: Dict[int, datetime] = {}

            for pss, part in active_rows:
                part_map[part.id] = part
                # start_date = when this part was FIRST set to active.
                # For original parts: start_date == order.activated_at.
                # For late-added parts: start_date > order.activated_at.
                # Fall back to order activation if somehow NULL.
                raw_ts = _strip_tz(pss.start_date) or order['activation_time']
                part_activation_map[part.id] = raw_ts

            # ── Execution order ──────────────────────────────────────── #
            priorities = (
                self.db.query(OrderPartPriority)
                .filter(OrderPartPriority.order_id == order_id)
                .order_by(OrderPartPriority.priority.asc())
                .all()
            )

            if priorities:
                ordered_ids = [
                    opp.part_id for opp in priorities
                    if opp.part_id in part_map        # skip inactive / non-active parts
                ]
                covered = set(ordered_ids)
                # Append active parts not in priority table (safety-net)
                for p in sorted(part_map.values(), key=lambda x: x.id):
                    if p.id not in covered:
                        ordered_ids.append(p.id)
            else:
                ordered_ids = [p.id for p in sorted(part_map.values(), key=lambda x: x.id)]

            # ── Part Activation Logic ────────────────────────────────────── #
            result = []
            for pid, part in part_map.items():
                print(f"[DEBUG] Processing part {pid} ({part.part_number})")
                
                result.append({
                    'part_id':              part.id,
                    'part_number':          part.part_number,
                    'part_name':            part.part_name,
                    'order_id':             order_id,
                    'sale_order_number':   order['sale_order_number'],
                    'quantity':             getattr(part, 'qty', None) or order['quantity'],
                    'raw_material_ok':      True,  # All activated parts have raw materials checked at activation level
                    # Used in C2.1 to apply/breaks cascade per part
                    'part_activation_time': part_activation_map[pid],
                })
                print(f"[DEBUG] _load_parts_for_order: added part_id={pid}")
            print(f"[DEBUG] _load_parts_for_order: returning {len(result)} parts for order {order_id}")
            return result

        except Exception as e:
            print(f"[ERROR] _load_parts_for_order (order {order['order_id']}): {e}")
            return []

    def _load_operations(self, part_ids: List[int]) -> Dict[int, List[Operation]]:
        """
        Phase A4.

        Operations grouped by part_id, sorted by operation_number ASC.

        Key fields used:
          id, operation_number (String), setup_time (TIME), cycle_time (TIME),
          workcenter_id (plain Integer – no FK to work_centers table).
        """
        try:
            ops = (
                self.db.query(Operation)
                .filter(Operation.part_id.in_(part_ids))
                .order_by(Operation.part_id, cast(Operation.operation_number, Integer).asc())
                .all()
            )
            result: Dict[int, List[Operation]] = {}
            for op in ops:
                result.setdefault(op.part_id, []).append(op)
            return result
        except Exception as e:
            print(f"[ERROR] _load_operations: {e}")
            return {}

    def _load_machines_by_workcenter(self) -> Dict[int, List[Machine]]:
        """
        Phase A4.

        Schedulable machines grouped by work_center_id.
        Excludes work centers where is_schedulable = False.
        Excludes work centers named 'Default' (PPT edge-case requirement).
        """
        try:
            machines = (
                self.db.query(Machine)
                .join(WorkCenter, WorkCenter.id == Machine.work_center_id)
                .filter(
                    and_(
                        WorkCenter.is_schedulable   == True,
                        WorkCenter.work_center_name != 'Default',
                    )
                )
                .all()
            )
            result: Dict[int, List[Machine]] = {}
            for m in machines:
                result.setdefault(m.work_center_id, []).append(m)
            return result
        except Exception as e:
            print(f"[ERROR] _load_machines_by_workcenter: {e}")
            return {}

    # ------------------------------------------------------------------ #
    #  Schedule management                                                 #
    # ------------------------------------------------------------------ #

    def _clear_existing_schedule(self) -> None:
        """
        Delete PlannedScheduleItem rows first (FK → ScheduleHistory),
        then ScheduleHistory rows.

        Completed operations (all production logs done, remaining=0) are
        snapshotted before deletion and re-inserted in generate_schedule()
        under the new ScheduleHistory so they remain visible in the plan.
        """
        try:
            # ── Identify completed operation IDs ─────────────────────────── #
            completed_op_ids: set = set()
            existing_items = self.db.query(PlannedScheduleItem).all()

            for item in existing_items:
                prod_logs = self.db.query(ProductionLog).filter(
                    ProductionLog.operation_id == item.operation_id
                ).all()
                all_done = (
                    len(prod_logs) > 0
                    and all(log.status == "completed" for log in prod_logs)
                )
                remaining_zero = any(
                    log.remaining_quantity_to_be_produced == 0
                    for log in prod_logs
                )
                if all_done and remaining_zero:
                    completed_op_ids.add(item.operation_id)

            # ── Snapshot completed rows (schedule_history_id assigned later) #
            self._preserved_planned_items = [
                {
                    'part_id':            item.part_id,
                    'part_number':        item.part_number,
                    'sale_order_id':      item.sale_order_id,
                    'sale_order_number':  item.sale_order_number,
                    'operation_id':       item.operation_id,
                    'machine_id':         item.machine_id,
                    'planned_start_time': item.planned_start_time,
                    'planned_end_time':   item.planned_end_time,
                    'total_quantity':     item.total_quantity,
                    'remaining_quantity': item.remaining_quantity,
                    'status':             item.status,
                }
                for item in existing_items
                if item.operation_id in completed_op_ids
            ]

            # ── Wipe table ────────────────────────────────────────────────── #
            self.db.query(PlannedScheduleItem).delete()
            self.db.query(ScheduleHistory).delete()
            self.db.commit()
            print(
                f"[SCHEDULE] Cleared schedule; "
                f"{len(self._preserved_planned_items)} completed-op rows preserved."
            )
        except Exception as e:
            print(f"[ERROR] _clear_existing_schedule: {e}")
            self.db.rollback()
            raise



    # ------------------------------------------------------------------ #
    #  Main entry-point                                                    #
    # ------------------------------------------------------------------ #

    def generate_schedule(
        self,
        start_date: Optional[datetime] = None,
        end_date:   Optional[datetime] = None,
    ) -> Dict:
        """
        Generate a FIFO machine schedule.

        Return dict keys (must match /generate-schedule endpoint):
            success, message, schedule_history_id,
            operations_scheduled, start_date, end_date,
            parts_processed,   ← total parts that had operations scheduled
            orders_scheduled, skipped_orders, skipped_parts
        """
        skipped_orders:           List[str]  = []
        skipped_parts:            List[str]  = []
        parts_without_operations: List[Dict] = []   # structured: part_id, part_number, order
        all_items:                List[PlannedScheduleItem] = []
        parts_processed = 0

        try:
            # ── Phase A1 + A2 ─────────────────────────────────────────── #
            active_orders = self._load_active_orders()

            # Always clear existing schedule, even if no active orders
            self._clear_existing_schedule()

            if not active_orders:
                return {
                    'success':             True,
                    'message':             'No active orders with a valid activation time found. Schedule cleared.',
                    'schedule_history_id': None,
                    'operations_scheduled': 0,
                    'parts_processed':     0,
                    'orders_scheduled':    0,
                    'start_date':          start_date,
                    'end_date':            None,
                    'skipped_orders':             [],
                    'skipped_parts':              [],
                    'parts_without_operations':   [],
                }



            # Create ScheduleHistory row
            history = ScheduleHistory(
                version      = 1,
                is_active    = True,
                generated_at = datetime.now(),
            )
            self.db.add(history)
            self.db.flush()
            history_id: int = history.id

            # ── Phase A3: parts per order ──────────────────────────────── #
            all_part_ids:    List[int]             = []
            order_parts_map: Dict[int, List[Dict]] = {}

            for order in active_orders:
                parts = self._load_parts_for_order(order)
                print(f"[DEBUG] Order {order['order_id']}: loaded {len(parts)} parts")
                order_parts_map[order['order_id']] = parts
                all_part_ids.extend(p['part_id'] for p in parts)
            print(f"[DEBUG] Total parts across all orders: {len(all_part_ids)}")

            # ── Schedule order: by global OrderPartPriority (1, 2, 3, …) ── #
            scheduled_items = self._load_scheduled_items_by_priority(
                active_orders, order_parts_map
            )
            print(f"[DEBUG] Scheduled items by priority: {len(scheduled_items)}")
            if not scheduled_items:
                # Fallback: no priority rows — order by order, parts per order
                for order in active_orders:
                    for part_data in order_parts_map.get(order['order_id'], []):
                        scheduled_items.append((order, part_data))

            # ── Phase A4: operations + machines ───────────────────────── #
            ops_by_part    = self._load_operations(all_part_ids)
            machines_by_wc = self._load_machines_by_workcenter()

            # Flat machine_id → Machine lookup for pinned-machine resolution
            # (avoids extra DB query per operation)
            all_machines: Dict[int, Machine] = {
                m.id: m
                for wc_machines in machines_by_wc.values()
                for m in wc_machines
            }

            # ── Phase C: Global Operation Queue for Maximum Machine Utilization ── #
            # STRATEGY: Instead of processing parts sequentially, create a global
            # operation queue sorted by priority, then schedule each operation ASAP.
            #
            # This solves the Reisauer waiting problem:
            #   - Part 1: Op 10 (Magerle) → Op 20 (Voumard) → Op 30 (Reisauer)
            #   - Part 3: Op 10 (Reisauer)
            #   - OLD: Part 3 waits for Part 1's Op 30
            #   - NEW: Part 3's Op 10 schedules ASAP when Reisauer is free
            #
            # Each operation finds its earliest start based on:
            #   1. Machine availability (when does the machine become free)
            #   2. Previous operation completion for THIS part only
            #   3. Part activation time
            
            # Build global operation queue with priority information
            global_ops_queue: List[Dict] = []
            
            for order, part_data in scheduled_items:
                order_id = order['order_id']
                part_id = part_data['part_id']
                quantity = part_data['quantity']
                
                # Skip zero quantity
                if quantity == 0:
                    skipped_orders.append(
                        f"Order {order['sale_order_number']}: quantity=0, skipped."
                    )
                    continue
                
                # Raw-material gate
                if not part_data['raw_material_ok']:
                    rm_stat_val = part_data.get('raw_material_status', '')
                    if rm_stat_val == 'No Raw Material':
                        reason = 'no raw material assigned'
                    else:
                        reason = f"raw material status '{rm_stat_val}' — not Available"
                    skipped_parts.append(
                        f"Part {part_data['part_number']} "
                        f"(order {order['sale_order_number']}): "
                        f"{reason} — part skipped."
                    )
                    continue
                
                # Get operations for this part
                operations = ops_by_part.get(part_data['part_id'], [])
                if not operations:
                    parts_without_operations.append({
                        'part_id':           part_data['part_id'],
                        'part_number':       part_data['part_number'],
                        'part_name':         part_data['part_name'],
                        'order_id':          order['order_id'],
                        'sale_order_number': order['sale_order_number'],
                        'reason':            'No operations defined for this part',
                    })
                    continue
                
                # Get priority for this part
                priority_row = (
                    self.db.query(OrderPartPriority)
                    .filter(
                        OrderPartPriority.order_id == order_id,
                        OrderPartPriority.part_id == part_id,
                        OrderPartPriority.status == 'active'
                    )
                    .first()
                )
                part_priority = priority_row.priority if priority_row else 999
                
                # Calculate activation constraints
                order_activation = self.adjust_to_shift(order['activation_time'])
                part_activation = self.adjust_to_shift(part_data['part_activation_time'])
                earliest_part_start = max(order_activation, part_activation)
                
                # Add all operations to global queue, skipping completed ones
                for op_seq, operation in enumerate(operations):
                    # Check if operation is already completed using production logs
                    production_logs = self.db.query(ProductionLog).filter(
                        ProductionLog.operation_id == operation.id
                    ).all()
                    
                    # Check if all production logs are completed and remaining quantity is 0
                    all_completed = len(production_logs) > 0 and all(log.status == "completed" for log in production_logs)
                    remaining_qty_zero = any(log.remaining_quantity_to_be_produced == 0 for log in production_logs)
                    
                    if all_completed and remaining_qty_zero:
                        # Skip this operation, it's already completed
                        skipped_parts.append(
                            f"Part {part_data['part_number']} (order {order['sale_order_number']}): "
                            f"Operation {operation.operation_number} is already completed — skipped."
                        )
                        continue
                    
                    global_ops_queue.append({
                        'order': order,
                        'part_data': part_data,
                        'operation': operation,
                        'quantity': quantity,
                        'priority': part_priority,
                        'op_sequence': op_seq,  # 0, 1, 2, ... for operation order within part
                        'earliest_part_start': earliest_part_start,
                    })
            
            # Sort global queue by priority ONLY
            # This allows operations from different parts to interleave on machines
            # based on actual machine availability, not artificial sequence constraints
            global_ops_queue.sort(key=lambda x: x['priority'])
            
            print(f"[DEBUG] Global operations queue: {len(global_ops_queue)} operations")
            
            # Track per-part operation completion times
            # part_id -> last operation end time for that part
            part_last_end_time: Dict[int, datetime] = {}
            
            # Track which parts have been scheduled (for reporting)
            scheduled_part_ids: set = set()
            
            orders_scheduled = 0
            seen_orders: set = set()
            
            # Schedule each operation from the global queue
            for idx, op_item in enumerate(global_ops_queue):
                order = op_item['order']
                part_data = op_item['part_data']
                operation = op_item['operation']
                quantity = op_item['quantity']
                op_sequence = op_item['op_sequence']
                earliest_part_start = op_item['earliest_part_start']
                
                order_id = order['order_id']
                part_id = part_data['part_id']
                
                print(f"[DEBUG] Processing Op #{idx+1}: Part {part_data['part_number']} Op {operation.operation_number} (seq={op_sequence})")
                
                # Count distinct orders for reporting
                if order_id not in seen_orders:
                    seen_orders.add(order_id)
                    orders_scheduled += 1
                
                # Calculate when this operation can start
                if op_sequence == 0:
                    # First operation in this part
                    op_cursor = earliest_part_start
                    print(f"[DEBUG]   First operation in part, cursor={op_cursor}")
                else:
                    # Subsequent operation: wait for previous operation of THIS part
                    prev_end_time = part_last_end_time.get(part_id, earliest_part_start)
                    op_cursor = max(prev_end_time, earliest_part_start)
                    print(f"[DEBUG]   Subsequent operation, prev_end={prev_end_time}, cursor={op_cursor}")

                # Handle Out-Source operation
                if operation.part_type_id == OUT_SOURCE_TYPE_ID:
                    if operation.from_date and operation.to_date:
                        os_start = _strip_tz(operation.from_date)   # fixed vendor window
                        os_end   = _strip_tz(operation.to_date)
                    else:
                        os_start = op_cursor                         # fallback only
                        os_end   = os_start + OUT_SOURCE_PROVISION
                    all_items.append(
                        PlannedScheduleItem(
                            part_id             = part_data['part_id'],
                            part_number         = part_data['part_number'],
                            sale_order_id       = part_data['order_id'],
                            sale_order_number   = part_data['sale_order_number'],
                            operation_id        = operation.id,
                            machine_id          = None,   # no machine for out-source
                            planned_start_time  = os_start,
                            planned_end_time    = os_end,
                            total_quantity      = quantity,
                            remaining_quantity  = 0,
                            status              = 'outsource_pending',
                            schedule_history_id = history_id,
                        )
                    )
                    print(
                        f"[SCHEDULE] Out-Source Op {operation.id} "
                        f"({operation.operation_number}): "
                        f"window {os_start} → {os_end} "
                        f"({'from operation dates' if operation.from_date and operation.to_date else 'fallback 7-day'})"
                    )
                    # Update part completion time
                    part_last_end_time[part_id] = os_end
                    continue
                
                # IN-HOUSE operation: machine selection
                machine: Optional[Machine] = None
                cand_start: datetime = op_cursor
                
                if operation.machine_id and operation.machine_id in all_machines:
                    # Tier 1 – pinned machine
                    pinned = all_machines[operation.machine_id]
                    machine_free = self.machine_end_time.get(
                        pinned.id, op_cursor
                    )
                    earliest = max(op_cursor, machine_free)
                    avail = self._machine_next_available(pinned, earliest)
                    
                    if avail is not None:
                        # Pinned machine is available
                        machine, cand_start = pinned, avail
                    else:
                        # Tier 2 – pinned machine broken, find alternative
                        alt_machine, alt_start = self._pick_best_machine(
                            operation.workcenter_id, machines_by_wc, op_cursor
                        )
                        if alt_machine:
                            machine, cand_start = alt_machine, alt_start
                            skipped_parts.append(
                                f"Part {part_data['part_number']}, "
                                f"Op {operation.operation_number}: "
                                f"pinned machine {operation.machine_id} is "
                                f"broken — reassigned to machine {machine.id}."
                            )
                
                if machine is None:
                    # Tier 3 – no pin or pin broken, find earliest available
                    machine, cand_start = self._pick_best_machine(
                        operation.workcenter_id, machines_by_wc, op_cursor
                    )
                
                if machine is None:
                    skipped_parts.append(
                        f"Part {part_data['part_number']}, "
                        f"Op {operation.operation_number}: "
                        f"no schedulable machine in WC "
                        f"{operation.workcenter_id} — skipped."
                    )
                    continue
                
                # Schedule the operation
                blocks, op_end = self._schedule_operation_blocks(
                    operation           = operation,
                    machine             = machine,
                    quantity            = quantity,
                    op_start            = cand_start,
                    schedule_history_id = history_id,
                    part_data           = part_data,
                )
                all_items.extend(blocks)
                
                print(f"[DEBUG]   Scheduled on {machine.make if machine else 'None'} from {cand_start} to {op_end}")
                
                # Update machine availability and part completion time
                self.machine_end_time[machine.id] = op_end
                part_last_end_time[part_id] = op_end
                
                # Track part as scheduled
                scheduled_part_ids.add(part_id)
                
            parts_processed = len(scheduled_part_ids)

            # Calculate overall schedule end time (latest operation end across all machines)
            overall_end_time = max(
                [item.planned_end_time for item in all_items] 
                if all_items else [start_date or datetime.now()]
            )

            # ── Phase D: persist ──────────────────────────────────────── #
            if all_items:
                self.db.add_all(all_items)

            # Re-insert preserved completed-operation rows under new history
            preserved = getattr(self, '_preserved_planned_items', [])
            if preserved:
                self.db.add_all([
                    PlannedScheduleItem(
                        schedule_history_id = history_id,
                        **d
                    )
                    for d in preserved
                ])
                print(f"[SCHEDULE] Re-inserted {len(preserved)} preserved completed-op planned items.")

            self.db.commit()
            

            # ── Phase E: seed rescheduling_items (status='scheduled') ──── #
            # Mirrors planned_schedule_items into rescheduling_items at
            # version=1 so the Gantt has a live starting point identical
            # to the baseline plan.  dynamic_reschedule() will later
            # DELETE+INSERT rows with status='rescheduled' as work progresses.
            if all_items:
                self._seed_rescheduling_items(all_items, schedule_version=1)

            return {
                'success':              True,
                'message': (
                    f'Schedule generated for {orders_scheduled} order(s), '
                    f'{parts_processed} part(s), '
                    f'{len(all_items)} operation block(s).'
                ),
                'schedule_history_id':       history_id,
                'operations_scheduled':      len(all_items),
                'orders_scheduled':          orders_scheduled,
                'parts_processed':           parts_processed,
                'start_date':                start_date,
                'end_date':                  overall_end_time,
                'skipped_orders':            skipped_orders,
                'skipped_parts':             skipped_parts,
                'parts_without_operations':  parts_without_operations,
            }

        except Exception as e:
            self.db.rollback()
            print(f"[ERROR] generate_schedule: {e}")
            return {
                'success':             False,
                'message':             f'Scheduling failed: {str(e)}',
                'schedule_history_id': None,
                'operations_scheduled': 0,
                'parts_processed':     0,
                'orders_scheduled':    0,
                'start_date':          start_date,
                'end_date':            None,
                'skipped_orders':            skipped_orders,
                'skipped_parts':             skipped_parts,
                'parts_without_operations':  parts_without_operations,
            }
    
    def _seed_rescheduling_items(
        self,
        planned_items:    List[PlannedScheduleItem],
        schedule_version: int,
    ) -> None:
        """
        Called once when generate_schedule() completes.
 
        Clears rescheduling_items entirely, then inserts one row per
        PlannedScheduleItem with status='scheduled'.  This is the live
        day-0 view — identical to the baseline plan.
 
        Completed operations (fully approved production logs, remaining=0)
        are preserved so the planned schedule always shows all parts
        including already-finished ones.
 
        dynamic_reschedule() will later delete+re-insert rows with
        status='rescheduled' as production progresses.
        """
        try:
            # ── Step 1: Identify completed operation IDs ────────────────── #
            # An operation is "done" when ALL its production logs are
            # completed AND at least one has remaining_quantity = 0.
            existing_rows = self.db.query(Rescheduling).all()

            completed_op_ids: set = set()
            for row in existing_rows:
                prod_logs = self.db.query(ProductionLog).filter(
                    ProductionLog.operation_id == row.operation_id
                ).all()
                all_completed = (
                    len(prod_logs) > 0
                    and all(log.status == "completed" for log in prod_logs)
                )
                remaining_zero = any(
                    log.remaining_quantity_to_be_produced == 0
                    for log in prod_logs
                )
                if all_completed and remaining_zero:
                    completed_op_ids.add(row.operation_id)

            # ── Step 2: Snapshot completed-operation rows ────────────────── #
            preserved_data = [
                {
                    'order_id':         row.order_id,
                    'order_number':     row.order_number,
                    'part_id':          row.part_id,
                    'part_number':      row.part_number,
                    'operation_id':     row.operation_id,
                    'operation_number': row.operation_number,
                    'machine_id':       row.machine_id,
                    'start_time':       row.start_time,
                    'end_time':         row.end_time,
                    'total_qty':        row.total_qty,
                    'completed_qty':    row.completed_qty,
                    'remaining_qty':    row.remaining_qty,
                    'status':           row.status,
                    'schedule_version': row.schedule_version,
                }
                for row in existing_rows
                if row.operation_id in completed_op_ids
            ]

            # ── Step 3: Wipe the table ───────────────────────────────────── #
            self.db.query(Rescheduling).delete()

            # ── Step 4: Build op_id → operation_number lookup ───────────── #
            op_ids = list({item.operation_id for item in planned_items})
            op_number_map: Dict[int, str] = {}
            try:
                ops = self.db.query(Operation).filter(
                    Operation.id.in_(op_ids)
                ).all()
                op_number_map = {op.id: str(op.operation_number) for op in ops}
            except Exception as e:
                print(f"[WARN] op_number_map: {e}")

            # ── Step 5: Seed new (non-completed) rows ────────────────────── #
            seeds = [
                Rescheduling(
                    order_id         = item.sale_order_id,
                    order_number     = item.sale_order_number,
                    part_id          = item.part_id,
                    part_number      = item.part_number,
                    operation_id     = item.operation_id,
                    operation_number = op_number_map.get(
                                           item.operation_id,
                                           str(item.operation_id)
                                       ),
                    machine_id       = item.machine_id,
                    start_time       = item.planned_start_time,
                    end_time         = item.planned_end_time,
                    total_qty        = item.total_quantity,
                    completed_qty    = 0,
                    remaining_qty    = item.total_quantity,
                    status           = 'scheduled',
                    schedule_version = schedule_version,
                )
                for item in planned_items
            ]
            self.db.add_all(seeds)

            # ── Step 6: Re-insert preserved completed rows ───────────────── #
            preserved = [Rescheduling(**d) for d in preserved_data]
            self.db.add_all(preserved)

            self.db.commit()
            print(
                f"[SCHEDULE] Seeded {len(seeds)} new + "
                f"{len(preserved)} preserved-completed rescheduling_items "
                f"(v{schedule_version})."
            )
        except Exception as e:
            self.db.rollback()
            print(f"[ERROR] _seed_rescheduling_items: {e}")


# =============================================================================
# Public wrapper  (called by /generate-schedule via `from algorithm import …`)
# =============================================================================

def generate_machine_schedule(
    db:         Session,
    start_date: Optional[datetime] = None,
    end_date:   Optional[datetime] = None,
) -> Dict:
    """Instantiate SchedulerEngine and run generate_schedule."""
    return SchedulerEngine(db).generate_schedule(start_date, end_date)




# =============================================================================
# Dynamic Scheduler Engine
# =============================================================================
 
class DynamicSchedulerEngine(SchedulerEngine):
    """
    Dynamic re-scheduling layer built on top of SchedulerEngine.
 
    Triggered after every supervisor approval / production log submission.
 
    Table contract
    ──────────────
    rescheduling_items.status = 'scheduled'
        Seeded once at generate_schedule() time.  NEVER modified here.
        This is the frozen baseline for Gantt comparison (blue row).
 
    rescheduling_items.status = 'rescheduled'
        Written by this engine.  For each affected part:
          DELETE WHERE part_id = X AND status = 'rescheduled'
          INSERT fresh rows for every operation from the first changed
          operation onwards (cascaded sequentially).
        These are the Gantt red rows.
 
    Scenario map
    ────────────
    completed  → skip; use actual_end from production_logs as cursor
                 for the next operation in sequence
    inprogress (has logs) → remaining_qty = total_qty - approved_so_far
                            schedule remaining from actual_end of latest log
                            cascade all downstream ops from this op's new end
    inprogress (no logs)  → operator mid-job, leave untouched
                            use baseline end as cascade cursor
    pending    → schedule full total_qty from cascaded cursor
    """
 
    # ------------------------------------------------------------------ #
    #  Production-log readers                                              #
    # ------------------------------------------------------------------ #
 
    def _approved_so_far(self, operation_id: int) -> int:
        """SUM(approved_quantity) from ALL production_logs for this operation."""
        try:
            rows = self.db.query(ProductionLog).filter(
                ProductionLog.operation_id == operation_id
            ).all()
            return sum((r.approved_quantity or 0) for r in rows)
        except Exception as e:
            print(f"[ERROR] _approved_so_far op={operation_id}: {e}")
            return 0
 
    def _actual_end(self, operation_id: int) -> Optional[datetime]:
        """
        MAX(to_date + to_time) from production_logs for this operation.
        Returns None if no logs exist yet.
        Used as the downstream cascade cursor when an operation has logs.
        """
        try:
            rows = self.db.query(ProductionLog).filter(
                ProductionLog.operation_id == operation_id
            ).all()
            candidates = [
                datetime.combine(r.to_date, r.to_time)
                for r in rows if r.to_date and r.to_time
            ]
            return max(candidates) if candidates else None
        except Exception as e:
            print(f"[ERROR] _actual_end op={operation_id}: {e}")
            return None
 
    def _has_any_log(self, operation_id: int) -> bool:
        """True when at least one production_log row exists."""
        try:
            return self.db.query(ProductionLog).filter(
                ProductionLog.operation_id == operation_id
            ).first() is not None
        except Exception as e:
            print(f"[ERROR] _has_any_log op={operation_id}: {e}")
            return False
 

 
    def _baseline_end(self, operation_id: int) -> Optional[datetime]:
        """Latest end_time from rescheduling_items for this op (any status)."""
        try:
            row = (
                self.db.query(Rescheduling)
                .filter(Rescheduling.operation_id == operation_id)
                .order_by(Rescheduling.end_time.desc())
                .first()
            )
            return row.end_time if row else None
        except Exception as e:
            print(f"[ERROR] _baseline_end op={operation_id}: {e}")
            return None
 
    # ------------------------------------------------------------------ #
    #  Version helper                                                      #
    # ------------------------------------------------------------------ #
 
    def _next_version(self) -> int:
        """MAX(schedule_version) + 1 from rescheduling_items, or 2."""
        try:
            from sqlalchemy import func
            result = self.db.query(
                func.max(Rescheduling.schedule_version)
            ).scalar()
            return (result + 1) if result else 2
        except Exception:
            return 2
 
    # ------------------------------------------------------------------ #
    #  Machine selection                                                   #
    # ------------------------------------------------------------------ #
 
    def _select_machine(
        self,
        operation:      Operation,
        all_machines:   Dict[int, Machine],
        machines_by_wc: Dict[int, List[Machine]],
        op_cursor:      datetime,
    ) -> Tuple[Optional[Machine], datetime]:
        """
        Three-tier machine selection (same logic as static engine).
        Tier 1: pinned machine (operation.machine_id) if available.
        Tier 2: best alternative in WorkCenter if pinned is OFF.
        Tier 3: best machine in WorkCenter if no pin.
        """
        machine:    Optional[Machine] = None
        cand_start: datetime          = op_cursor
 
        if operation.machine_id and operation.machine_id in all_machines:
            pinned   = all_machines[operation.machine_id]
            free     = self.machine_end_time.get(pinned.id, op_cursor)
            earliest = max(op_cursor, free)
            avail    = self._machine_next_available(pinned, earliest)
            if avail is not None:
                machine, cand_start = pinned, avail
            else:
                alt, alt_s = self._pick_best_machine(
                    operation.workcenter_id, machines_by_wc, op_cursor
                )
                if alt:
                    machine, cand_start = alt, alt_s
 
        if machine is None:
            machine, cand_start = self._pick_best_machine(
                operation.workcenter_id, machines_by_wc, op_cursor
            )
        return machine, cand_start
 
    # ------------------------------------------------------------------ #
    #  Convert schedule blocks → Rescheduling rows                        #
    # ------------------------------------------------------------------ #
 
    def _to_rescheduling_rows(
        self,
        blocks:           List[PlannedScheduleItem],
        operation:        Operation,
        part_data:        Dict,
        order_id:         int,
        total_qty:        int,
        completed_qty:    int,
        schedule_version: int,
    ) -> List[Rescheduling]:
        """
        Convert _schedule_operation_blocks() output into Rescheduling rows
        with status='rescheduled'.
 
        remaining_qty decrements across blocks so each row shows how many
        units are still outstanding after that block completes.
        """
        rows: List[Rescheduling] = []
        # remaining starts at total not-yet-completed
        running_remaining = total_qty - completed_qty
 
        for idx, block in enumerate(blocks):
            # units produced in this block
            if idx == 0:
                units_in_block = block.total_quantity - block.remaining_quantity
            else:
                units_in_block = (
                    blocks[idx - 1].remaining_quantity - block.remaining_quantity
                )
            running_remaining = max(0, running_remaining - units_in_block)
 
            rows.append(
                Rescheduling(
                    order_id         = order_id,
                    order_number     = part_data['sale_order_number'],
                    part_id          = part_data['part_id'],
                    part_number      = part_data['part_number'],
                    operation_id     = block.operation_id,
                    operation_number = str(operation.operation_number),
                    machine_id       = block.machine_id,
                    start_time       = block.planned_start_time,
                    end_time         = block.planned_end_time,
                    total_qty        = total_qty,
                    completed_qty    = completed_qty,
                    remaining_qty    = running_remaining,
                    status           = 'rescheduled',
                    schedule_version = schedule_version,
                )
            )
        return rows
 
    # ------------------------------------------------------------------ #
    #  Main entry-point                                                    #
    # ------------------------------------------------------------------ #
 
    def dynamic_reschedule(
        self,
        triggered_by_part_id: Optional[int] = None,
        triggered_by_op_id:   Optional[int] = None,
    ) -> Dict:
        """
        Re-plan rescheduling_items after a production log is submitted.
 
        Parameters
        ──────────
        triggered_by_part_id  Pass the part_id that had a log submitted.
                              The engine will re-plan that part's entire
                              operation chain.
                              Pass None to re-plan ALL active parts (full run).
 
        triggered_by_op_id    Informational only (used in log messages).
 
        DB writes
        ─────────
        For each affected part:
          1. Walk operations in sequence order
          2. Build new Rescheduling rows for every op from the first
             changed op onwards (complete cascade)
          3. DELETE existing 'rescheduled' rows for that part
          4. INSERT new rows (bulk)
        """
        result: Dict = {
            'success':             False,
            'message':             '',
            'reschedule_version':  None,
            'parts_rescheduled':   0,
            'operations_inserted': 0,
            'skipped_parts':       [],
        }
 
        try:
            # ── 1. Load orders + parts ────────────────────────────────── #
            active_orders = self._load_active_orders()
            if not active_orders:
                # Clear rescheduling_items when there are no active orders
                self.db.query(Rescheduling).delete()
                self.db.commit()
                result.update({
                    'success': True,
                    'message': 'No active orders. Rescheduling items cleared.',
                    'reschedule_version': None,
                    'parts_rescheduled': 0,
                    'operations_inserted': 0,
                })
                return result
 
            order_parts_map: Dict[int, List[Dict]] = {}
            all_part_ids:    List[int] = []
            for order in active_orders:
                parts = self._load_parts_for_order(order)
                order_parts_map[order['order_id']] = parts
                all_part_ids.extend(p['part_id'] for p in parts)
 
            # ── 2. Scope: specific part or all parts ──────────────────── #
            if triggered_by_part_id:
                scope = [
                    (order, pd)
                    for order in active_orders
                    for pd in order_parts_map.get(order['order_id'], [])
                    if pd['part_id'] == triggered_by_part_id
                ]
            else:
                scope = [
                    (order, pd)
                    for order in active_orders
                    for pd in order_parts_map.get(order['order_id'], [])
                ]
 
            if not scope:
                # Clear rescheduling_items when there are no parts in scope
                self.db.query(Rescheduling).delete()
                self.db.commit()
                result.update({
                    'success': True,
                    'message': 'No parts in scope. Rescheduling items cleared.',
                    'reschedule_version': None,
                    'parts_rescheduled': 0,
                    'operations_inserted': 0,
                })
                return result
 
            # ── 3. Load ops + machines ────────────────────────────────── #
            ops_by_part    = self._load_operations(all_part_ids)
            machines_by_wc = self._load_machines_by_workcenter()
            all_machines: Dict[int, Machine] = {
                m.id: m
                for wc_list in machines_by_wc.values()
                for m in wc_list
            }
 
            # ── 4. Pre-block machines occupied by inprogress ops ──────── #
            # Read latest actual end time from production logs for each inprogress operation
            # An operation is in-progress if approved_so_far > 0 and < total_qty
            try:
                # Get all operations that have production logs
                ops_with_logs = (
                    self.db.query(ProductionLog.operation_id)
                    .distinct()
                    .all()
                )
                
                for (op_id,) in ops_with_logs:
                    approved = self._approved_so_far(op_id)
                    
                    # Get total_qty for this operation's part from rescheduling_items
                    ri = (
                        self.db.query(Rescheduling)
                        .filter(Rescheduling.operation_id == op_id)
                        .first()
                    )
                    
                    if not ri:
                        continue
                        
                    total_qty = ri.total_qty
                    
                    # Only pre-block if we have work in progress
                    if approved <= 0 or approved >= total_qty:
                        continue
                        
                    # First check actual end time from production logs
                    actual_end = self._actual_end(op_id)
                    if actual_end is not None:
                        end_time = actual_end
                    else:
                        # Fallback to baseline if no actual logs
                        end_time = self._baseline_end(op_id)
                        if end_time is None:
                            continue
                            
                    # Find which machine this op is on from rescheduling_items
                    ri = (
                        self.db.query(Rescheduling)
                        .filter(Rescheduling.operation_id == op_id)
                        .order_by(Rescheduling.end_time.desc())
                        .first()
                    )
                    if ri and ri.machine_id:
                        existing = self.machine_end_time.get(ri.machine_id)
                        if existing is None or end_time > existing:
                            self.machine_end_time[ri.machine_id] = end_time
                            print(
                                f"[DYNAMIC] Pre-blocked machine {ri.machine_id} "
                                f"until {end_time} (inprogress op {op_id})"
                            )
            except Exception as e:
                print(f"[ERROR] pre-block machines: {e}")
 
            version       = self._next_version()
            all_new_rows: List[Rescheduling] = []
            parts_done:   set = set()
 
            # ── 5. Process each (order, part) ─────────────────────────── #
            for order, part_data in scope:
                order_id  = order['order_id']
                part_id   = part_data['part_id']
                total_qty = part_data['quantity']
 
                operations = ops_by_part.get(part_id, [])
                if not operations:
                    continue
 
                order_activation    = self.adjust_to_shift(order['activation_time'])
                part_activation     = self.adjust_to_shift(
                                          part_data['part_activation_time']
                                      )
                earliest_part_start = max(order_activation, part_activation)
 
                # cascade_cursor: earliest datetime the NEXT op can start
                cascade_cursor         = earliest_part_start
                part_rescheduled_rows: List[Rescheduling] = []
                cascade_active         = False  # True once we start inserting rows
 
                for operation in operations:
                    op_id       = operation.id
                    approved    = self._approved_so_far(op_id)
                    has_logs    = self._has_any_log(op_id)

                    # ── Out-Source operation ───────────────────────────── #
                    if operation.part_type_id == OUT_SOURCE_TYPE_ID:
                        os_status = (
                            self.db.query(OutSourceOperationStatus)
                            .filter(
                                OutSourceOperationStatus.operation_id == op_id,
                                OutSourceOperationStatus.part_id      == part_id,
                                OutSourceOperationStatus.order_id     == order_id,
                            )
                            .first()
                        )
                        if (
                            os_status
                            and os_status.status == 'delivered'
                            and os_status.delivered_date
                        ):
                            # Delivered: snap delivered_date to next valid shift start
                            cascade_cursor = self.adjust_to_shift(
                                _strip_tz(os_status.delivered_date)
                            )
                            print(
                                f"[DYNAMIC] Out-Source Op {op_id} "
                                f"({operation.operation_number}) DELIVERED — "
                                f"delivered_date={os_status.delivered_date}, "
                                f"cursor → {cascade_cursor}"
                            )
                        else:
                            # Pending / in-transit: plan the outsource window
                            if operation.from_date and operation.to_date:
                                os_start = _strip_tz(operation.from_date)   # fixed vendor window
                                os_end   = _strip_tz(operation.to_date)
                            else:
                                os_start = cascade_cursor                    # fallback only
                                os_end   = os_start + OUT_SOURCE_PROVISION
                            cascade_cursor = os_end
                            cascade_active = True
                            part_rescheduled_rows.append(
                                Rescheduling(
                                    order_id         = order_id,
                                    order_number     = part_data['sale_order_number'],
                                    part_id          = part_id,
                                    part_number      = part_data['part_number'],
                                    operation_id     = op_id,
                                    operation_number = str(operation.operation_number),
                                    machine_id       = None,
                                    start_time       = os_start,
                                    end_time         = os_end,
                                    total_qty        = total_qty,
                                    completed_qty    = 0,
                                    remaining_qty    = total_qty,
                                    status           = 'rescheduled',
                                    schedule_version = version,
                                )
                            )
                            print(
                                f"[DYNAMIC] Out-Source Op {op_id} "
                                f"({operation.operation_number}) PENDING/IN-TRANSIT — "
                                f"window {os_start} → {os_end}"
                            )
                        continue

                    # ── completed: use actual_end, skip insertion ──────── #
                    if approved >= total_qty:
                        actual = self._actual_end(op_id)
                        if actual:
                            cascade_cursor = self.adjust_to_shift(actual)
                            print(
                                f"[DYNAMIC] Op {op_id} ({operation.operation_number}) "
                                f"COMPLETED — actual_end={actual}, cursor → {cascade_cursor}"
                            )
                        else:
                            b = self._baseline_end(op_id)
                            if b:
                                cascade_cursor = self.adjust_to_shift(b)
                                print(
                                    f"[DYNAMIC] Op {op_id} ({operation.operation_number}) "
                                    f"COMPLETED — NO ACTUAL END, using baseline={b}, cursor → {cascade_cursor}"
                                )
                            else:
                                print(
                                    f"[DYNAMIC] Op {op_id} ({operation.operation_number}) "
                                    f"COMPLETED — NO ACTUAL END OR BASELINE, keeping cursor={cascade_cursor}"
                                )
                        continue
 
                    # ── inprogress ──────────────────────────────────── #
                    elif approved > 0:
                        # inprogress, no log: operator mid-job, leave alone ─ #
                        if not has_logs:
                            b = self._baseline_end(op_id)
                            if b:
                                cascade_cursor = self.adjust_to_shift(b)
                            print(
                                f"[DYNAMIC] Op {op_id} ({operation.operation_number}) "
                                f"INPROGRESS (no log) — untouched."
                            )
                            continue

                        # inprogress with logs: schedule remaining qty ────── #
                        remaining_qty = max(0, total_qty - approved)
 
                        if remaining_qty == 0:
                            # All units approved; status update may be lagging
                            actual = self._actual_end(op_id)
                            if actual:
                                cascade_cursor = self.adjust_to_shift(actual)
                            print(
                                f"[DYNAMIC] Op {op_id} ({operation.operation_number}) "
                                f"fully approved (status lag) — skip."
                            )
                            continue
 
                        # Start from when the operator's last log ended
                        actual = self._actual_end(op_id)
                        op_cursor = (
                            self.adjust_to_shift(actual) if actual
                            else cascade_cursor
                        )
 
                        machine, cand_start = self._select_machine(
                            operation, all_machines, machines_by_wc, op_cursor
                        )
                        if machine is None:
                            result['skipped_parts'].append(
                                f"Part {part_data['part_number']} "
                                f"Op {operation.operation_number}: no machine available."
                            )
                            continue
 
                        print(
                            f"[DYNAMIC] Op {op_id} ({operation.operation_number}) "
                            f"INPROGRESS — approved={approved}, remaining={remaining_qty}, "
                            f"start={cand_start}"
                        )
 
                        blocks, op_end = self._schedule_operation_blocks(
                            operation           = operation,
                            machine             = machine,
                            quantity            = remaining_qty,
                            op_start            = cand_start,
                            schedule_history_id = 0,   # not used here
                            part_data           = part_data,
                        )
                        self.machine_end_time[machine.id] = op_end
                        cascade_cursor = op_end
                        cascade_active = True
 
                        part_rescheduled_rows.extend(
                            self._to_rescheduling_rows(
                                blocks=blocks, operation=operation,
                                part_data=part_data, order_id=order_id,
                                total_qty=total_qty, completed_qty=approved,
                                schedule_version=version,
                            )
                        )
                        continue
 
                    # ── pending: schedule full qty from cascade_cursor ──── #
                    # Also handles: cascade_active=True (downstream of changed op)
                    machine, cand_start = self._select_machine(
                        operation, all_machines, machines_by_wc, cascade_cursor
                    )
                    if machine is None:
                        result['skipped_parts'].append(
                            f"Part {part_data['part_number']} "
                            f"Op {operation.operation_number}: no machine available."
                        )
                        continue
 
                    print(
                        f"[DYNAMIC] Op {op_id} ({operation.operation_number}) "
                        f"PENDING — full {total_qty} units, start={cand_start}"
                    )
 
                    blocks, op_end = self._schedule_operation_blocks(
                        operation           = operation,
                        machine             = machine,
                        quantity            = total_qty,
                        op_start            = cand_start,
                        schedule_history_id = 0,
                        part_data           = part_data,
                    )
                    self.machine_end_time[machine.id] = op_end
                    cascade_cursor = op_end
                    cascade_active = True
 
                    part_rescheduled_rows.extend(
                        self._to_rescheduling_rows(
                            blocks=blocks, operation=operation,
                            part_data=part_data, order_id=order_id,
                            total_qty=total_qty, completed_qty=0,
                            schedule_version=version,
                        )
                    )
 
                # ── 6. Replace rescheduled rows for this part ─────────── #
                # ALWAYS delete old rows for this part (both 'scheduled' and 'rescheduled') —
                # even when all operations are completed and part_rescheduled_rows
                # is empty. Without this, stale rows from previous runs would remain 
                # in the table after the part is fully done, including completed operations.
                deleted = self.db.query(Rescheduling).filter(
                    Rescheduling.part_id == part_id,
                    Rescheduling.status.in_(['scheduled', 'rescheduled']),
                ).delete(synchronize_session=False)
                if deleted:
                    print(
                        f"[DYNAMIC] Part {part_id}: deleted {deleted} old "
                        f"'scheduled'/'rescheduled' rows (including completed ops)."
                    )

                if part_rescheduled_rows:
                    print(
                        f"[DYNAMIC] Part {part_id}: inserting "
                        f"{len(part_rescheduled_rows)} new 'rescheduled' rows."
                    )
                    all_new_rows.extend(part_rescheduled_rows)
                    parts_done.add(part_id)
                else:
                    print(
                        f"[DYNAMIC] Part {part_id}: all operations completed — "
                        f"no new rescheduled rows needed."
                    )
                    parts_done.add(part_id)
 
            # ── 7. Bulk INSERT + commit ───────────────────────────────── #
            if all_new_rows:
                self.db.add_all(all_new_rows)
            self.db.commit()
 
            result.update({
                'success':             True,
                'message':             (
                    f"Dynamic reschedule complete — "
                    f"{len(parts_done)} part(s), "
                    f"{len(all_new_rows)} row(s) inserted "
                    f"(version {version})."
                ),
                'reschedule_version':  version,
                'parts_rescheduled':   len(parts_done),
                'operations_inserted': len(all_new_rows),
            })
            return result
 
        except Exception as e:
            self.db.rollback()
            print(f"[ERROR] dynamic_reschedule: {e}")
            result['message'] = f'Dynamic reschedule failed: {str(e)}'
            return result
 
 
# =============================================================================
# Public wrapper — dynamic reschedule
# =============================================================================
 
def dynamic_reschedule(
    db:                   Session,
    triggered_by_part_id: Optional[int] = None,
    triggered_by_op_id:   Optional[int] = None,
) -> Dict:
    """
    Re-plan rescheduling_items after a production log is submitted.
 
    Call this from your router after supervisor approves a log:
 
        from algorithm import dynamic_reschedule
        result = dynamic_reschedule(db, triggered_by_part_id=part_id)
 
    Passing triggered_by_part_id scopes the run to that part only
    (faster).  Passing nothing reruns all active parts (full refresh).
 
    Gantt reads:
        Blue  → planned_schedule_items              (frozen baseline)
        Green → production_logs                     (actual output)
        Red   → rescheduling_items status=rescheduled (remaining live plan)
    """
    return DynamicSchedulerEngine(db).dynamic_reschedule(
        triggered_by_part_id=triggered_by_part_id,
        triggered_by_op_id=triggered_by_op_id,
    )