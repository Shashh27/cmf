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

from sqlalchemy.orm import Session
from sqlalchemy import and_

# ── OMS models ────────────────────────────────────────────────────────────
from DB.models.oms import (
    Order,                        # id, sale_order_number, product_id, quantity, due_date, status
    Part,                         # id, part_number, part_name, type_id (1=IN-House), product_id
    Product,                      # id, product_name
    Operation,                    # id, operation_number, setup_time (TIME), cycle_time (TIME),
                                  # workcenter_id (plain Integer – no FK), part_id
    OrderPartPriority,            # id, order_id, part_id, product_id, priority
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
    MachineStatus,           # machine_id, status_id (1=ON / 2=OFF), available_from, available_to
    EfficiencyFactor,        # efficiency_factor (Float)
)

# ── Constants ─────────────────────────────────────────────────────────────
DEFAULT_SHIFT_START = time(hour=8, minute=30)
DEFAULT_SHIFT_END   = time(hour=17, minute=0)
SHIFT_HOURS_PER_DAY = 8   # fallback if only number_of_shifts exists
STATUS_OFF          = 2   # MachineStatus.status_id value meaning OFF
IN_HOUSE_TYPE_ID    = 1   # Part.type_id for IN-House parts
OUT_SOURCE_TYPE_ID  = 2   # Operation.part_type_id value for Out-Source (oms.part_types id=2)
OUT_SOURCE_PROVISION = timedelta(days=7)  # Maximum vendor turnaround: 1 week


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
        # Fallback: number_of_shifts × 8 hours per shift
        return float(cfg.number_of_shifts * SHIFT_HOURS_PER_DAY)

    def _load_efficiency(self) -> float:
        record = self.db.query(EfficiencyFactor).first()
        return record.efficiency_factor if record else 0.85

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

    def _shift_window(self, dt: datetime) -> Tuple[time, time]:
        """
        Returns shift start/end times for a date.
        Priority:
          1) linked ShiftTimingConfiguration rows (min start, max end)
          2) number_of_shifts fallback
          3) default GENERAL shift
        """
        cfg = (
            self.db.query(ShiftHoursConfiguration)
            .filter(ShiftHoursConfiguration.date == dt.date())
            .first()
        )
        if cfg and cfg.shift_timings:
            starts = [st.shift_start for st in cfg.shift_timings]
            ends = [st.shift_end for st in cfg.shift_timings]
            return min(starts), max(ends)

        n = cfg.number_of_shifts if (cfg and cfg.number_of_shifts) else 1
        shift_start = DEFAULT_SHIFT_START
        shift_end_dt = datetime.combine(dt.date(), shift_start) + timedelta(hours=n * SHIFT_HOURS_PER_DAY)
        return shift_start, shift_end_dt.time()

    def _shift_start_dt(self, dt: datetime) -> datetime:
        shift_start, _ = self._shift_window(dt)
        return dt.replace(
            hour=shift_start.hour,
            minute=shift_start.minute,
            second=0,
            microsecond=0,
        )

    def _shift_end_dt(self, dt: datetime) -> datetime:
        _, shift_end = self._shift_window(dt)
        return dt.replace(
            hour=shift_end.hour,
            minute=shift_end.minute,
            second=0,
            microsecond=0,
        )

    def _next_shift_start(self, dt: datetime) -> datetime:
        """Shift-start datetime of the next working day after dt."""
        candidate = dt + timedelta(days=1)
        for _ in range(730):                          # guard: ~2 years
            if self._is_working_day(candidate):
                return self._shift_start_dt(candidate)
            candidate += timedelta(days=1)
        raise RuntimeError(
            "No working day found in the next 730 days — "
            "check ShiftHoursConfiguration."
        )

    def adjust_to_shift(self, dt: datetime) -> datetime:
        """
        Snap dt forward to the nearest valid working-shift moment.

        Rules (applied in order, repeated until stable):
          1. Non-working day     → jump to next shift start.
          2. Before shift start  → set to shift start of that day.
          3. At/after shift end  → jump to next shift start.
        """
        for _ in range(1460):                         # guard: ~4 years
            if not self._is_working_day(dt):
                dt = self._next_shift_start(dt)
                continue

            s = self._shift_start_dt(dt)
            e = self._shift_end_dt(dt)

            if dt < s:
                return s
            if dt >= e:
                dt = self._next_shift_start(dt)
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
                candidate = self.adjust_to_shift(off.available_to)
                continue

            return self.adjust_to_shift(candidate)

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

        Returns (list_of_items, op_end_time).
        """
        remaining_hours = self._operation_duration_hours(operation, quantity)
        items: List[PlannedScheduleItem] = []
        cur = op_start

        while remaining_hours > 1e-9:              # float guard
            shift_end = self._shift_end_dt(cur)

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
                        cur = self.adjust_to_shift(next_off.available_to)
                    else:
                        break                       # machine permanently OFF
                else:
                    cur = self._next_shift_start(cur)
                continue

            segment_hours = min(remaining_hours, window_hours)
            segment_end   = cur + timedelta(hours=segment_hours)

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
                    remaining_quantity  = 0,
                    status              = 'pending',
                    schedule_history_id = schedule_history_id,
                )
            )
            remaining_hours -= segment_hours

            if remaining_hours > 1e-9:
                if next_off and segment_end >= next_off.available_from:
                    if next_off.available_to:
                        cur = self.adjust_to_shift(next_off.available_to)
                    else:
                        break
                else:
                    cur = self._next_shift_start(segment_end)

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
            active_rows = (
                self.db.query(PartScheduleStatus, Part)
                .join(Part, Part.id == PartScheduleStatus.part_id)
                .filter(
                    and_(
                        PartScheduleStatus.sale_order_id == order_id,
                        PartScheduleStatus.status        == 'active',
                        Part.type_id                     == IN_HOUSE_TYPE_ID,
                        Part.product_id                  == product_id,
                    )
                )
                .all()
            )

            if not active_rows:
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

            # ── Raw-material gate ────────────────────────────────────── #
            rm_status_map: Dict[int, str] = {}
            for pid, part in part_map.items():
                if part.raw_material_id is None:
                    rm_status_map[pid] = 'No Raw Material'   # not assigned → block
                else:
                    rm = part.raw_material
                    if rm is None:
                        rm_status_map[pid] = 'No Raw Material'
                    else:
                        rm_status_map[pid] = (rm.status or '').strip().title()

            # ── Build result list ────────────────────────────────────── #
            result = []
            for pid in ordered_ids:
                p = part_map[pid]
                rm_stat = rm_status_map.get(pid, 'Available')
                result.append({
                    'part_id':              p.id,
                    'part_number':          p.part_number,
                    'part_name':            p.part_name,
                    'order_id':             order_id,
                    'sale_order_number':    order['sale_order_number'],
                    'quantity':             order['quantity'],
                    'raw_material_ok':      rm_stat == 'Available',
                    'raw_material_status':  rm_stat,
                    # Used in C2.1 to apply/break the cascade per part
                    'part_activation_time': part_activation_map[pid],
                })
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
                .order_by(Operation.part_id, Operation.operation_number.asc())
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
        """
        try:
            self.db.query(PlannedScheduleItem).delete()
            self.db.query(ScheduleHistory).delete()
            self.db.commit()
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

            if not active_orders:
                # Do NOT clear existing schedule when nothing replaces it
                return {
                    'success':             False,
                    'message':             'No active orders with a valid activation time found.',
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

            # Clear only after confirming there is new work
            self._clear_existing_schedule()

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
                order_parts_map[order['order_id']] = parts
                all_part_ids.extend(p['part_id'] for p in parts)

            # ── Schedule order: by global OrderPartPriority (1, 2, 3, …) ── #
            scheduled_items = self._load_scheduled_items_by_priority(
                active_orders, order_parts_map
            )
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

            # ── Phase B: initialise global clock ──────────────────────── #
            first_activation = active_orders[0]['activation_time']
            clock_seed       = max(start_date or first_activation, first_activation)
            current_time     = self.adjust_to_shift(clock_seed)

            # ── Phase C: main loop (by global priority) ─────────────────── #
            orders_scheduled = 0
            seen_orders: set = set()

            for order, part_data in scheduled_items:
                order_id = order['order_id']
                quantity = order['quantity']

                # Count distinct orders for reporting
                if order_id not in seen_orders:
                    seen_orders.add(order_id)

                # Edge case: zero quantity
                if quantity == 0:
                    skipped_orders.append(
                        f"Order {order['sale_order_number']}: quantity=0, skipped."
                    )
                    continue

                # C1: enforce order activation time + shift
                current_time = self.adjust_to_shift(
                    max(current_time, order['activation_time'])
                )

                # C2: schedule this part (single part per iteration)
                # ── C2.1: determine this part's start time ─────────── #
                #
                # MODIFICATION 2 — cascade-break for late-added parts:
                #
                # part_start = max(current_time, part_activation_time)
                #
                # • Original parts (activated WITH the order):
                #     part_activation_time ≈ order.activated_at
                #     → max() == current_time → cascade applies normally
                #       (part starts right after the previous part ends)
                #
                # • Late-added parts (activated AFTER the order went live):
                #     part_activation_time > order.activated_at
                #     → if cascade end < activation_time, max() picks
                #       activation_time → part cannot start before it was
                #       even added to the system
                part_start = self.adjust_to_shift(
                    max(current_time, part_data['part_activation_time'])
                )

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
                    continue                      # do NOT advance current_time

                # C2.2: operations for this part
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
                    continue                      # do NOT advance current_time

                # C2.3: schedule each operation sequentially
                op_cursor = part_start

                for operation in operations:

                    # ── MODIFICATION 3 — Out-Source operation ──────── #
                    #
                    # Identified by Operation.part_type_id == 2
                    # (oms.part_types: id=1 IN-House, id=2 Out-Source)
                    #
                    # Rules:
                    #   • No machine is allocated (machine_id = NULL)
                    #   • planned_start_time = end time of the previous
                    #     IN-HOUSE operation (op_cursor)
                    #   • planned_end_time   = planned_start_time + 7 days
                    #     (maximum provision for vendor turnaround)
                    #   • Status set to 'outsource_pending'
                    #   • op_cursor advances by 7 days so the next
                    #     IN-HOUSE operation waits for the vendor
                    if operation.part_type_id == OUT_SOURCE_TYPE_ID:
                        os_start = op_cursor
                        os_end   = op_cursor + OUT_SOURCE_PROVISION
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
                        op_cursor = os_end        # next op waits for vendor
                        continue                  # skip machine-selection logic

                    # ── IN-HOUSE operation: machine selection ──────── #
                    #
                    # Tier 1: operation.machine_id pinned + schedulable
                    # Tier 2: pinned but not in schedulable WC → WC fallback
                    # Tier 3: no pin → earliest-free in work center (FIFO)

                    if operation.machine_id and operation.machine_id in all_machines:
                        # Tier 1 – pinned machine
                        pinned = all_machines[operation.machine_id]
                        machine_free = self.machine_end_time.get(
                            pinned.id, op_cursor
                        )
                        earliest = max(op_cursor, machine_free)
                        avail    = self._machine_next_available(pinned, earliest)

                        if avail is None:
                            skipped_parts.append(
                                f"Part {part_data['part_number']}, "
                                f"Op {operation.operation_number}: "
                                f"pinned machine {operation.machine_id} is "
                                f"permanently OFF — skipped."
                            )
                            continue

                        machine, cand_start = pinned, avail

                    else:
                        # Tier 2 / 3 – earliest-free within the work center
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
                        continue                  # op_cursor unchanged

                    # Schedule with shift / machine-OFF splitting
                    blocks, op_end = self._schedule_operation_blocks(
                        operation           = operation,
                        machine             = machine,
                        quantity            = quantity,
                        op_start            = cand_start,
                        schedule_history_id = history_id,
                        part_data           = part_data,
                    )
                    all_items.extend(blocks)

                    # Update machine clock and op cursor
                    self.machine_end_time[machine.id] = op_end
                    op_cursor = op_end

                # C2.4: part complete → advance global clock
                current_time = op_cursor
                parts_processed += 1

            orders_scheduled = len(seen_orders)

            # ── Phase D: persist ──────────────────────────────────────── #
            if all_items:
                self.db.add_all(all_items)
            self.db.commit()

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
                'end_date':                  current_time,
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