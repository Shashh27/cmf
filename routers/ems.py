import asyncio
import json
import math
from collections import defaultdict
from datetime import datetime, timedelta
from enum import Enum
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from DB.database import get_db
from DB.models.ems import MachineEMSLive, MachineEMSHistory, ShiftwiseEnergyLive, ShiftwiseEnergyHistory
from DB.models.configuration import Machine
from DB.schemas.ems import ShiftwiseEnergyResponse

router = APIRouter(prefix="/energy-monitoring", tags=["Energy Monitoring"])


# ──────────────────────────────────────────────
# SSE Connection Managers
# ──────────────────────────────────────────────

class SSEConnectionManager:
    def __init__(self):
        self.active_connections: set = set()

    async def connect(self) -> asyncio.Queue:
        queue = asyncio.Queue()
        self.active_connections.add(queue)
        return queue

    def disconnect(self, queue: asyncio.Queue):
        self.active_connections.discard(queue)

    async def broadcast(self, data: str):
        for queue in list(self.active_connections):
            await queue.put(data)


status_connection_manager = SSEConnectionManager()
parameter_connection_manager = SSEConnectionManager()
machine_parameter_managers = defaultdict(SSEConnectionManager)
history_connection_manager = defaultdict(SSEConnectionManager)


# ──────────────────────────────────────────────
# Change Trackers
# ──────────────────────────────────────────────

class MachineStatusTracker:
    def __init__(self):
        self.previous_states = {}
        self.NUMERIC_THRESHOLD = 0.0001
        self.last_broadcast_time = {}
        self.MIN_BROADCAST_INTERVAL = 1.0

    def _is_significant_change(self, curr, prev):
        if curr is None or prev is None:
            return curr != prev
        if isinstance(curr, (int, float)) and isinstance(prev, (int, float)):
            return abs(curr - prev) > self.NUMERIC_THRESHOLD
        return curr != prev

    def detect_changes(self, current_data):
        if not current_data:
            return None
        now = datetime.now()
        changed = []
        current_states = {str(m['machine_id']): m for m in current_data}
        for mid, state in current_states.items():
            prev = self.previous_states.get(mid)
            if not prev:
                changed.append(state)
                continue
            last = self.last_broadcast_time.get(mid, datetime.min)
            if (now - last).total_seconds() < self.MIN_BROADCAST_INTERVAL:
                continue
            if any(self._is_significant_change(state.get(k), prev.get(k)) for k in state):
                changed.append(state)
                self.last_broadcast_time[mid] = now
        for mid in list(self.previous_states.keys()):
            if mid not in current_states:
                changed.append({"machine_id": mid, "status": "OFFLINE", "timestamp": now.isoformat()})
        self.previous_states = current_states
        return changed if changed else None


class MachineParameterTracker:
    PARAMS = [
        'phase_a_voltage', 'phase_b_voltage', 'phase_c_voltage', 'avg_phase_voltage',
        'line_ab_voltage', 'line_bc_voltage', 'line_ca_voltage', 'avg_line_voltage',
        'phase_a_current', 'phase_b_current', 'phase_c_current', 'avg_three_phase_current',
        'power_factor', 'frequency', 'total_instantaneous_power', 'active_energy_delivered', 'status'
    ]

    def __init__(self):
        self.previous_states = {}

    def detect_parameter_changes(self, current_data):
        changed = []
        current_states = {m["machine_id"]: m for m in current_data}
        for mid, state in current_states.items():
            prev = self.previous_states.get(mid)
            if prev is None:
                changed.append(state)
            else:
                for p in self.PARAMS:
                    cv, pv = state.get(p), prev.get(p)
                    if isinstance(cv, (int, float)) and isinstance(pv, (int, float)):
                        if abs(cv - pv) > 0.0001:
                            changed.append(state)
                            break
                    elif cv != pv:
                        changed.append(state)
                        break
        for mid in list(self.previous_states.keys()):
            if mid not in current_states:
                changed.append({"machine_id": mid, "status": "OFFLINE", "timestamp": datetime.now().isoformat()})
        self.previous_states = current_states
        return changed if changed else None


status_tracker = MachineStatusTracker()
parameter_tracker = MachineParameterTracker()


# ──────────────────────────────────────────────
# DB Query Helpers
# ──────────────────────────────────────────────

def _machine_dict(db: Session):
    return {m.id: m.make for m in db.query(Machine).all()}


def _all_statuses(db: Session):
    md = _machine_dict(db)
    return [
        {
            "machine_id": r.machine_id,
            "machine_name": md.get(r.machine_id, f"Machine-{r.machine_id}"),
            "status": r.status,
            "timestamp": r.timestamp.isoformat(),
            "total_power": r.total_instantaneous_power,
            "energy_consumed": r.active_energy_delivered,
        }
        for r in db.query(MachineEMSLive).all()
    ]


def _all_parameters(db: Session):
    md = _machine_dict(db)
    return [
        {
            "machine_id": r.machine_id,
            "machine_name": md.get(r.machine_id, f"Machine-{r.machine_id}"),
            "status": r.status,
            "timestamp": r.timestamp.isoformat(),
            "phase_a_voltage": r.phase_a_voltage,
            "phase_b_voltage": r.phase_b_voltage,
            "phase_c_voltage": r.phase_c_voltage,
            "avg_phase_voltage": r.avg_phase_voltage,
            "line_ab_voltage": r.line_ab_voltage,
            "line_bc_voltage": r.line_bc_voltage,
            "line_ca_voltage": r.line_ca_voltage,
            "avg_line_voltage": r.avg_line_voltage,
            "phase_a_current": r.phase_a_current,
            "phase_b_current": r.phase_b_current,
            "phase_c_current": r.phase_c_current,
            "avg_three_phase_current": r.avg_three_phase_current,
            "power_factor": r.power_factor,
            "frequency": r.frequency,
            "total_instantaneous_power": r.total_instantaneous_power,
            "active_energy_delivered": r.active_energy_delivered,
        }
        for r in db.query(MachineEMSLive).all()
    ]


def _single_machine_params(db: Session, machine_id: int):
    machine = db.query(Machine).filter(Machine.id == machine_id).first()
    name = machine.make if machine else f"Machine-{machine_id}"
    row = db.query(MachineEMSLive).filter(MachineEMSLive.machine_id == machine_id).first()
    if not row:
        return {"machine_id": machine_id, "machine_name": name, "status": "OFFLINE", "timestamp": datetime.now().isoformat()}
    return {
        "machine_id": machine_id, "machine_name": name, "status": row.status,
        "timestamp": row.timestamp.isoformat(),
        "phase_a_voltage": row.phase_a_voltage, "phase_b_voltage": row.phase_b_voltage,
        "phase_c_voltage": row.phase_c_voltage, "avg_phase_voltage": row.avg_phase_voltage,
        "line_ab_voltage": row.line_ab_voltage, "line_bc_voltage": row.line_bc_voltage,
        "line_ca_voltage": row.line_ca_voltage, "avg_line_voltage": row.avg_line_voltage,
        "phase_a_current": row.phase_a_current, "phase_b_current": row.phase_b_current,
        "phase_c_current": row.phase_c_current, "avg_three_phase_current": row.avg_three_phase_current,
        "power_factor": row.power_factor, "frequency": row.frequency,
        "total_instantaneous_power": row.total_instantaneous_power,
        "active_energy_delivered": row.active_energy_delivered,
    }


# ──────────────────────────────────────────────
# Background Broadcast Tasks
# ──────────────────────────────────────────────

async def _status_broadcast_loop(db: Session):
    while True:
        try:
            changed = status_tracker.detect_changes(_all_statuses(db))
            if changed:
                await status_connection_manager.broadcast(f"data: {json.dumps(changed)}\n\n")
            await asyncio.sleep(1)
        except Exception as e:
            print(f"EMS status broadcast error: {e}")
            await asyncio.sleep(1)


async def _parameter_broadcast_loop(db: Session):
    while True:
        try:
            changed = parameter_tracker.detect_parameter_changes(_all_parameters(db))
            if changed:
                await parameter_connection_manager.broadcast(f"data: {json.dumps(changed)}\n\n")
            await asyncio.sleep(1)
        except Exception as e:
            print(f"EMS parameter broadcast error: {e}")
            await asyncio.sleep(1)


# ──────────────────────────────────────────────
# Routes
# ──────────────────────────────────────────────

class MachineInfo(BaseModel):
    machine_id: int
    machine_name: str


@router.get("/machines", response_model=List[MachineInfo])
def get_machines(db: Session = Depends(get_db)):
    return [MachineInfo(machine_id=m.id, machine_name=m.make) for m in db.query(Machine).all()]


@router.get("/machine-status-stream")
async def stream_machine_status(request: Request, db: Session = Depends(get_db)):
    async def generator():
        client_queue = await status_connection_manager.connect()
        try:
            yield f"data: {json.dumps(_all_statuses(db))}\n\n"
            asyncio.create_task(_status_broadcast_loop(db))
            while not await request.is_disconnected():
                try:
                    data = await asyncio.wait_for(client_queue.get(), timeout=30)
                    if data is None:
                        break
                    yield data
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            status_connection_manager.disconnect(client_queue)

    return StreamingResponse(generator(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"})


@router.get("/machine-parameters-stream")
async def stream_machine_parameters(request: Request, db: Session = Depends(get_db)):
    async def generator():
        client_queue = await parameter_connection_manager.connect()
        try:
            yield f"data: {json.dumps(_all_parameters(db))}\n\n"
            asyncio.create_task(_parameter_broadcast_loop(db))
            while not await request.is_disconnected():
                try:
                    data = await asyncio.wait_for(client_queue.get(), timeout=30)
                    if data is None:
                        break
                    yield data
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            parameter_connection_manager.disconnect(client_queue)

    return StreamingResponse(generator(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"})


@router.get("/machine/{machine_id}/parameters-stream")
async def stream_single_machine(machine_id: int, request: Request, db: Session = Depends(get_db)):
    if not db.query(Machine).filter(Machine.id == machine_id).first():
        raise HTTPException(status_code=404, detail=f"Machine {machine_id} not found")
    connection_key = (machine_id, "parameters")

    async def generator():
        client_queue = await machine_parameter_managers[connection_key].connect()
        try:
            yield f"data: {json.dumps(_single_machine_params(db, machine_id))}\n\n"
            while not await request.is_disconnected():
                try:
                    data = await asyncio.wait_for(client_queue.get(), timeout=30)
                    if data is None:
                        break
                    yield data
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            machine_parameter_managers[connection_key].disconnect(client_queue)

    return StreamingResponse(generator(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"})


@router.get("/shiftwise-energy/live")
def shiftwise_live(db: Session = Depends(get_db)):
    from DB.models.configuration import Machine
    machine_names = {m.id: m.make for m in db.query(Machine.id, Machine.make).all()}
    return [
        {"machine_id": r.machine_id, "machine_name": machine_names.get(r.machine_id, f"Machine-{r.machine_id}"),
         "timestamp": r.timestamp.isoformat(),
         "first_shift": r.first_shift, "second_shift": r.second_shift, "total_energy": r.total_energy}
        for r in db.query(ShiftwiseEnergyLive).all()
    ]


@router.get("/shiftwise-energy/history", response_model=ShiftwiseEnergyResponse)
def shiftwise_history(machine_id: Optional[int] = None, db: Session = Depends(get_db)):
    from DB.models.configuration import Machine
    machine_names = {m.id: m.make for m in db.query(Machine.id, Machine.make).all()}
    q = db.query(ShiftwiseEnergyHistory)
    if machine_id:
        q = q.filter(ShiftwiseEnergyHistory.machine_id == machine_id)
    rows = q.order_by(ShiftwiseEnergyHistory.timestamp.desc()).all()
    data = [
        {"machine_id": r.machine_id, "machine_name": machine_names.get(r.machine_id, f"Machine-{r.machine_id}"),
         "timestamp": r.timestamp.isoformat(),
         "first_shift": r.first_shift, "second_shift": r.second_shift, "total_energy": r.total_energy}
        for r in rows
    ]
    return ShiftwiseEnergyResponse(data=data, timestamp=datetime.now().isoformat())


# ──────────────────────────────────────────────
# Parameter Enum
# ──────────────────────────────────────────────

class ParameterEnum(str, Enum):
    phase_a_voltage = "phase_a_voltage"
    phase_b_voltage = "phase_b_voltage"
    phase_c_voltage = "phase_c_voltage"
    avg_phase_voltage = "avg_phase_voltage"
    line_ab_voltage = "line_ab_voltage"
    line_bc_voltage = "line_bc_voltage"
    line_ca_voltage = "line_ca_voltage"
    avg_line_voltage = "avg_line_voltage"
    phase_a_current = "phase_a_current"
    phase_b_current = "phase_b_current"
    phase_c_current = "phase_c_current"
    avg_three_phase_current = "avg_three_phase_current"
    power_factor = "power_factor"
    frequency = "frequency"
    total_instantaneous_power = "total_instantaneous_power"
    active_energy_delivered = "active_energy_delivered"


# ──────────────────────────────────────────────
# energyMonitoring.js endpoints (Machines.jsx / MachineOverlay.jsx)
# ──────────────────────────────────────────────

@router.get("/energy_summary/")
def energy_summary(db: Session = Depends(get_db)):
    rows = db.query(MachineEMSLive).all()
    total_power = sum((r.total_instantaneous_power or 0) for r in rows)
    total_energy = sum((r.active_energy_delivered or 0) for r in rows)
    cost_per_kwh = 7.0
    return {"total_energy": round(total_energy, 2), "total_cost": round(total_energy * cost_per_kwh, 2), "total_power": round(total_power, 2)}


@router.get("/machines/")
def list_machines(db: Session = Depends(get_db)):
    machines = db.query(Machine).all()
    return [{"id": m.id, "machine_name": m.make} for m in machines]


@router.get("/live_recent")
def live_recent(machine_id: int, db: Session = Depends(get_db)):
    row = db.query(MachineEMSLive).filter(MachineEMSLive.machine_id == machine_id).first()
    if not row:
        raise HTTPException(status_code=404, detail=f"No live data for machine {machine_id}")
    machine = db.query(Machine).filter(Machine.id == machine_id).first()
    return {
        "machine_id": machine_id,
        "machine_name": machine.make if machine else f"Machine-{machine_id}",
        "power": row.total_instantaneous_power,
        "energy": row.active_energy_delivered,
        "power_factor": row.power_factor,
        "frequency": row.frequency,
        "timestamp": row.timestamp.isoformat(),
        "status": row.status,
        "phase_a_voltage": row.phase_a_voltage,
        "phase_b_voltage": row.phase_b_voltage,
        "phase_c_voltage": row.phase_c_voltage,
        "line_ab_voltage": row.line_ab_voltage,
        "line_bc_voltage": row.line_bc_voltage,
        "line_ca_voltage": row.line_ca_voltage,
        "phase_a_current": row.phase_a_current,
        "phase_b_current": row.phase_b_current,
        "phase_c_current": row.phase_c_current,
    }


@router.get("/all_machine_states")
def all_machine_states(db: Session = Depends(get_db)):
    # Fetch status from production_monitoring.machine_live_status
    query = text("""
        SELECT machine_id, status, last_updated
        FROM production_monitoring.machine_live_status
        ORDER BY machine_id
    """)
    rows = db.execute(query).fetchall()
    return [
        {
            "machine_id": row[0],
            "state": row[1],  # This will be "OFF", "ON", "PRODUCTION"
            "timestamp": row[2].isoformat()
        }
        for row in rows
    ]


@router.get("/get_machine_history/{machine_id}")
def get_machine_history(
    machine_id: int,
    start_time: str = Query(...),
    end_time: str = Query(...),
    db: Session = Depends(get_db),
):
    try:
        start_dt = datetime.fromisoformat(start_time)
        end_dt = datetime.fromisoformat(end_time)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid datetime format. Use YYYY-MM-DD HH:MM:SS")
    rows = (
        db.query(MachineEMSHistory)
        .filter(
            MachineEMSHistory.machine_id == machine_id,
            MachineEMSHistory.timestamp >= start_dt,
            MachineEMSHistory.timestamp <= end_dt,
        )
        .order_by(MachineEMSHistory.timestamp.asc())
        .all()
    )
    return [
        {
            "timestamp": r.timestamp.isoformat(),
            "current": r.avg_three_phase_current,
            "power": r.total_instantaneous_power,
            "energy": r.active_energy_delivered,
        }
        for r in rows
    ]


@router.get("/get_production_data")
def get_production_data(date: str, machine_id: int, db: Session = Depends(get_db)):
    try:
        day_start = datetime.strptime(date, "%Y-%m-%d")
        day_end = day_start + timedelta(days=1)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    
    # Fetch status data from production_monitoring.machine_live_history using raw SQL
    query = text("""
        SELECT last_updated, status
        FROM production_monitoring.machine_live_history
        WHERE machine_id = :machine_id
          AND last_updated >= :day_start
          AND last_updated < :day_end
        ORDER BY last_updated ASC
    """)
    rows = db.execute(query, {
        "machine_id": machine_id,
        "day_start": day_start,
        "day_end": day_end
    }).fetchall()
    
    data_points = [
        {
            "timestamp": row[0].isoformat(),
            "status": 2 if row[1] == "PRODUCTION" else (1 if row[1] == "ON" else 0),
        }
        for row in rows
    ]
    return {"machine_id": machine_id, "date": date, "dataPoints": data_points}


@router.get("/average_energy_time/")
def average_energy_time(machine_name: int, date: str, db: Session = Depends(get_db)):
    try:
        day_start = datetime.strptime(date, "%d-%m-%Y")
        day_end = day_start + timedelta(days=1)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use DD-MM-YYYY")
    rows = (
        db.query(MachineEMSHistory)
        .filter(
            MachineEMSHistory.machine_id == machine_name,
            MachineEMSHistory.timestamp >= day_start,
            MachineEMSHistory.timestamp < day_end,
        )
        .all()
    )
    if not rows:
        return {"machine_id": machine_name, "date": date, "average_energy": 0, "data_points": []}
    energies = [r.active_energy_delivered or 0 for r in rows]
    return {
        "machine_id": machine_name,
        "date": date,
        "average_energy": round(sum(energies) / len(energies), 4),
        "data_points": [{"timestamp": r.timestamp.isoformat(), "energy": r.active_energy_delivered} for r in rows],
    }


@router.get("/shift_live_data/")
def shift_live_data(db: Session = Depends(get_db)):
    rows = db.query(ShiftwiseEnergyLive).all()
    machines = {m.id: m.make for m in db.query(Machine).all()}
    return [
        {
            "id": r.machine_id,
            "machine_name": machines.get(r.machine_id, f"Machine-{r.machine_id}"),
            "timestamp": r.timestamp.isoformat(),
            "first_shift": r.first_shift,
            "second_shift": r.second_shift,
            "total_energy": r.total_energy,
        }
        for r in rows
    ]


@router.get("/shift_live_history/")
def shift_live_history(date: str, db: Session = Depends(get_db)):
    try:
        day_start = datetime.strptime(date, "%Y-%m-%d")
        day_end = day_start + timedelta(days=1)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    rows = (
        db.query(ShiftwiseEnergyHistory)
        .filter(
            ShiftwiseEnergyHistory.timestamp >= day_start,
            ShiftwiseEnergyHistory.timestamp < day_end,
        )
        .order_by(ShiftwiseEnergyHistory.timestamp.asc())
        .all()
    )
    machines = {m.id: m.machine_name for m in db.query(Machine).all()}
    return [
        {
            "id": r.machine_id,
            "machine_name": machines.get(r.machine_id, f"Machine-{r.machine_id}"),
            "timestamp": r.timestamp.isoformat(),
            "first_shift": r.first_shift,
            "second_shift": r.second_shift,
            "total_energy": r.total_energy,
        }
        for r in rows
    ]


@router.get("/daily_energy_consumption")
def daily_energy_consumption(date: str, db: Session = Depends(get_db)):
    try:
        day_start = datetime.strptime(date, "%Y-%m-%d")
        day_end = day_start + timedelta(days=1)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    rows = (
        db.query(MachineEMSHistory)
        .filter(MachineEMSHistory.timestamp >= day_start, MachineEMSHistory.timestamp < day_end)
        .order_by(MachineEMSHistory.timestamp.asc())
        .all()
    )
    machine_energy = defaultdict(float)
    for r in rows:
        machine_energy[r.machine_id] += r.active_energy_delivered or 0
    machines = {m.id: m.machine_name for m in db.query(Machine).all()}
    return {
        "date": date,
        "daily_energy_consumption": [
            {"machine_id": mid, "machine_name": machines.get(mid, f"Machine-{mid}"), "energy": round(energy, 4)}
            for mid, energy in machine_energy.items()
        ],
    }


@router.get("/total_energy_costs")
def total_energy_costs(date: str, db: Session = Depends(get_db)):
    cost_per_kwh = 7.0
    try:
        day = datetime.strptime(date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    week_start = day - timedelta(days=day.weekday())
    month_start = day.replace(day=1)
    def sum_energy(start, end):
        rows = db.query(MachineEMSHistory).filter(
            MachineEMSHistory.timestamp >= start,
            MachineEMSHistory.timestamp < end,
        ).all()
        return sum(r.active_energy_delivered or 0 for r in rows)
    weekly = sum_energy(week_start, week_start + timedelta(days=7))
    monthly = sum_energy(month_start, (month_start + timedelta(days=32)).replace(day=1))
    return {
        "total_weekly_cost": round(weekly * cost_per_kwh, 2),
        "total_monthly_cost": round(monthly * cost_per_kwh, 2),
    }


@router.get("/get_graph_data")
def get_graph_data(date: str, db: Session = Depends(get_db)):
    try:
        day_start = datetime.strptime(date, "%Y-%m-%d")
        day_end = day_start + timedelta(days=1)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    rows = (
        db.query(MachineEMSHistory)
        .filter(MachineEMSHistory.timestamp >= day_start, MachineEMSHistory.timestamp < day_end)
        .order_by(MachineEMSHistory.machine_id, MachineEMSHistory.timestamp)
        .all()
    )
    data_points = [
        {
            "machine_id": r.machine_id,
            "name": "PRODUCTION" if r.status == 1 else ("ON" if r.status == 2 else "IDLE"),
            "value": [
                int(r.timestamp.timestamp() * 1000),
                int((r.timestamp + timedelta(minutes=1)).timestamp() * 1000),
            ],
        }
        for r in rows
    ]
    return {"date": date, "dataPoints": data_points}


# ──────────────────────────────────────────────
# energyMonitoringCMF.js endpoints
# ──────────────────────────────────────────────

@router.get("/machine/{machine_id}/parameter/{parameter}/history-stream")
async def stream_machine_parameter_history(
    machine_id: int, parameter: ParameterEnum, request: Request, db: Session = Depends(get_db)
):
    exists = db.query(MachineEMSHistory).filter(MachineEMSHistory.machine_id == machine_id).first()
    if not exists:
        raise HTTPException(status_code=404, detail=f"Machine {machine_id} not found in history")
    connection_key = (machine_id, parameter.value)

    async def generator():
        client_queue = await history_connection_manager[connection_key].connect()
        try:
            data = _get_history_window(db, machine_id, parameter.value)
            yield f"data: {json.dumps(data)}\n\n"
            while not await request.is_disconnected():
                try:
                    payload = await asyncio.wait_for(client_queue.get(), timeout=30)
                    if payload is None:
                        break
                    yield payload
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            history_connection_manager[connection_key].disconnect(client_queue)

    return StreamingResponse(generator(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"})


@router.get("/machine/{machine_id}/parameter/{parameter}/history")
def get_machine_parameter_history(
    machine_id: int,
    parameter: ParameterEnum,
    start_time: int = Query(..., description="Start epoch seconds"),
    end_time: int = Query(..., description="End epoch seconds"),
    db: Session = Depends(get_db),
):
    if end_time <= start_time:
        raise HTTPException(status_code=400, detail="end_time must be greater than start_time")
    if end_time - start_time > 7 * 86400:
        raise HTTPException(status_code=400, detail="Time range cannot exceed 7 days")
    start_dt = datetime.fromtimestamp(start_time)
    end_dt = datetime.fromtimestamp(end_time)
    rows = (
        db.query(MachineEMSHistory)
        .filter(
            MachineEMSHistory.machine_id == machine_id,
            MachineEMSHistory.timestamp >= start_dt,
            MachineEMSHistory.timestamp <= end_dt,
        )
        .order_by(MachineEMSHistory.timestamp.asc())
        .all()
    )
    data_points = [
        {"timestamp": r.timestamp.isoformat(), "epoch": int(r.timestamp.timestamp()), "value": getattr(r, parameter.value)}
        for r in rows if getattr(r, parameter.value) is not None
    ]
    values = [p["value"] for p in data_points]
    statistics = {
        "count": len(values),
        "min": min(values) if values else None,
        "max": max(values) if values else None,
        "average": round(sum(values) / len(values), 4) if values else None,
    }
    return JSONResponse(content={
        "machine_id": machine_id, "parameter": parameter.value,
        "start_time": start_dt.isoformat(), "end_time": end_dt.isoformat(),
        "data_points": data_points, "statistics": statistics,
    })


@router.get("/shiftwise-energy-stream")
async def stream_shiftwise_energy(request: Request, db: Session = Depends(get_db)):
    shiftwise_sse_manager = SSEConnectionManager()

    async def generator():
        client_queue = await shiftwise_sse_manager.connect()
        try:
            initial = _get_shiftwise_live_data(db)
            yield f"data: {json.dumps(initial)}\n\n"
            asyncio.create_task(_shiftwise_broadcast_loop(db, shiftwise_sse_manager))
            while not await request.is_disconnected():
                try:
                    payload = await asyncio.wait_for(client_queue.get(), timeout=30)
                    if payload is None:
                        break
                    yield payload
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            shiftwise_sse_manager.disconnect(client_queue)

    return StreamingResponse(generator(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"})


@router.get("/combined-history/")
def get_combined_history(
    from_timestamp: int = Query(...),
    to_timestamp: int = Query(...),
    db: Session = Depends(get_db),
):
    if from_timestamp > to_timestamp:
        raise HTTPException(status_code=400, detail="from_timestamp must be earlier than to_timestamp")
    from_dt = datetime.fromtimestamp(from_timestamp)
    to_dt = datetime.fromtimestamp(to_timestamp)
    rows = (
        db.query(ShiftwiseEnergyHistory)
        .filter(ShiftwiseEnergyHistory.timestamp >= from_dt, ShiftwiseEnergyHistory.timestamp <= to_dt)
        .all()
    )
    machines = {m.id: m.machine_name for m in db.query(Machine).all()}
    machine_aggregates = {}
    grand = {"first_shift": 0.0, "second_shift": 0.0, "total_energy": 0.0}
    for h in rows:
        mid = h.machine_id
        if mid not in machine_aggregates:
            machine_aggregates[mid] = {"machine_id": mid, "machine_name": machines.get(mid, f"Machine-{mid}"),
                                        "first_shift": 0.0, "second_shift": 0.0, "total_energy": 0.0}
        machine_aggregates[mid]["first_shift"] += h.first_shift or 0
        machine_aggregates[mid]["second_shift"] += h.second_shift or 0
        machine_aggregates[mid]["total_energy"] += h.total_energy or 0
        grand["first_shift"] += h.first_shift or 0
        grand["second_shift"] += h.second_shift or 0
        grand["total_energy"] += h.total_energy or 0
    for m in machine_aggregates.values():
        for k in ["first_shift", "second_shift", "total_energy"]:
            m[k] = round(m[k], 2)
    for k in grand:
        grand[k] = round(grand[k], 2)
    return JSONResponse(content={
        "from_timestamp": from_dt.isoformat(), "to_timestamp": to_dt.isoformat(),
        "epoch_range": {"from": from_timestamp, "to": to_timestamp},
        "grand_totals": {"total_first_shift": grand["first_shift"], "total_second_shift": grand["second_shift"], "grand_total_energy": grand["total_energy"]},
        "machines": list(machine_aggregates.values()),
    })


@router.get("/filtered_history_data/{machine_id}")
def filtered_history_data(
    machine_id: int,
    start_date: str = Query(...),
    end_date: str = Query(...),
    column_name: str = Query(...),
    db: Session = Depends(get_db),
):
    valid_columns = {f.key for f in MachineEMSHistory.__table__.columns} - {"id", "machine_id", "timestamp"}
    if column_name not in valid_columns:
        raise HTTPException(status_code=400, detail=f"Invalid column_name: {column_name}")
    try:
        start_dt = datetime.strptime(start_date, "%Y-%m-%d")
        end_dt = datetime.strptime(end_date, "%Y-%m-%d") + timedelta(days=1)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    rows = (
        db.query(MachineEMSHistory)
        .filter(
            MachineEMSHistory.machine_id == machine_id,
            MachineEMSHistory.timestamp >= start_dt,
            MachineEMSHistory.timestamp < end_dt,
        )
        .order_by(MachineEMSHistory.timestamp.asc())
        .all()
    )
    return {
        "machine_id": machine_id, "column_name": column_name,
        "start_date": start_date, "end_date": end_date,
        "data": [{"timestamp": r.timestamp.isoformat(), "value": getattr(r, column_name)} for r in rows if getattr(r, column_name) is not None],
    }


# ──────────────────────────────────────────────
# Internal helpers for history stream
# ──────────────────────────────────────────────

def _get_history_window(db: Session, machine_id: int, parameter: str, window_minutes: int = 30):
    machine = db.query(Machine).filter(Machine.id == machine_id).first()
    machine_name = machine.make if machine else f"Machine-{machine_id}"
    latest = (
        db.query(MachineEMSHistory)
        .filter(MachineEMSHistory.machine_id == machine_id)
        .order_by(MachineEMSHistory.timestamp.desc())
        .first()
    )
    if not latest:
        return {"machine_id": machine_id, "machine_name": machine_name, "parameter": parameter, "data_points": []}
    start_time = latest.timestamp - timedelta(minutes=window_minutes)
    rows = (
        db.query(MachineEMSHistory)
        .filter(MachineEMSHistory.machine_id == machine_id,
                MachineEMSHistory.timestamp >= start_time,
                MachineEMSHistory.timestamp <= latest.timestamp)
        .order_by(MachineEMSHistory.timestamp.asc())
        .all()
    )
    return {
        "machine_id": machine_id, "machine_name": machine_name, "parameter": parameter,
        "data_points": [{"timestamp": r.timestamp.isoformat(), "value": getattr(r, parameter)}
                        for r in rows if getattr(r, parameter) is not None],
    }


def _get_shiftwise_live_data(db: Session):
    rows = db.query(ShiftwiseEnergyLive).all()
    machines = {m.id: m.machine_name for m in db.query(Machine).all()}
    return [
        {"machine_id": r.machine_id, "machine_name": machines.get(r.machine_id, f"Machine-{r.machine_id}"),
         "timestamp": r.timestamp.isoformat(), "first_shift": r.first_shift,
         "second_shift": r.second_shift, "total_energy": r.total_energy}
        for r in rows
    ]


async def _shiftwise_broadcast_loop(db: Session, manager: SSEConnectionManager):
    prev_states = {}
    while True:
        try:
            current = _get_shiftwise_live_data(db)
            current_map = {str(d["machine_id"]): d for d in current}
            changed = []
            for mid, state in current_map.items():
                prev = prev_states.get(mid)
                if not prev or any(
                    abs(state.get(k, 0) - prev.get(k, 0)) > 0.01
                    for k in ["first_shift", "second_shift", "total_energy"]
                ):
                    changed.append(state)
            if changed:
                await manager.broadcast(f"data: {json.dumps(changed)}\n\n")
                prev_states = current_map
            await asyncio.sleep(5)
        except Exception as e:
            print(f"Shiftwise broadcast error: {e}")
            await asyncio.sleep(5)
