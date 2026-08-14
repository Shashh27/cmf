from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from DB.database import get_db
from DB.models.production import ShiftSummary
from DB.models.monitoring import MachineLiveHistory
from DB.models.configuration import Machine
from DB.models.oms import Operation, Part
from DB.models.access_control import AccessUser
from auth.deps import get_current_user
from auth.scope import scope_ids_from_user
from DB.schemas.production_analytics import (
    OverallOEEAnalysis, OEELosses, OEETrend, ShiftOEE, MachineOEE,
    DetailedShiftSummary, CombinedScheduleProductionResponse, PlannedOperation,
    ActualProductionLog, MachineInfo, LiveStatusSegment, OperatorIssueSegment
)

router = APIRouter(
    prefix="/production-analytics",
    tags=["production-analytics"]
)

def build_machine_display_name(machine: Optional[Machine]) -> str:
    if not machine:
        return ""
    make_model = f"{machine.make or ''} {machine.model or ''}".strip()
    return make_model or machine.type or f"Machine {machine.id}"


def _avg(values: List[float]) -> float:
    return (sum(values) / len(values)) if values else 0.0



def _parse_dt(value: Optional[str], field_name: str) -> Optional[datetime]:
    if value is None or str(value).strip() == "":
        return None
    raw = str(value).strip().replace("Z", "")
    for fmt in (
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%Y-%m-%dT%H:%M",
        "%Y-%m-%d",
    ):
        try:
            candidate = raw[:19] if ("T" in raw and len(raw) > 19) else raw
            return datetime.strptime(candidate, fmt)
        except ValueError:
            continue
    raise HTTPException(status_code=400, detail=f"Invalid {field_name}. Use YYYY-MM-DD or YYYY-MM-DD HH:MM:SS")


def _secs_to_hms(total_seconds: Optional[float]) -> Optional[str]:
    if total_seconds is None:
        return None
    secs = int(max(0, round(float(total_seconds))))
    h, rem = divmod(secs, 3600)
    m, s = divmod(rem, 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


def _resolve_oee_range(
    date_str: Optional[str],
    start_date: Optional[str],
    end_date: Optional[str],
) -> tuple:
    """Resolve analysis window; prefer start/end; cap to protect DB."""
    max_days = 366
    parsed_start = _parse_dt(start_date, "start_date")
    parsed_end = _parse_dt(end_date, "end_date")

    if parsed_start or parsed_end:
        if not parsed_start or not parsed_end:
            raise HTTPException(status_code=400, detail="Both start_date and end_date are required")
        if parsed_end < parsed_start:
            raise HTTPException(status_code=400, detail="end_date must be >= start_date")
        if end_date and len(str(end_date).strip()) <= 10:
            parsed_end = parsed_end.replace(hour=23, minute=59, second=59, microsecond=999999)
        if (parsed_end - parsed_start) > timedelta(days=max_days):
            raise HTTPException(
                status_code=400,
                detail=f"Date range too large. Maximum allowed is {max_days} days.",
            )
        return parsed_start, parsed_end

    if date_str:
        analysis_date = _parse_dt(date_str, "date")
    else:
        analysis_date = datetime.now()
    start = analysis_date.replace(hour=0, minute=0, second=0, microsecond=0)
    end = analysis_date.replace(hour=23, minute=59, second=59, microsecond=999999)
    return start, end


def _shift_filter_id(shift: Optional[str]) -> Optional[int]:
    if not shift or str(shift).lower() == "all":
        return None
    try:
        shift_id = int(shift)
    except ValueError:
        raise HTTPException(status_code=400, detail="Shift must be '1', '2', or 'all'")
    if shift_id not in (1, 2):
        raise HTTPException(status_code=400, detail="Shift must be '1', '2', or 'all'")
    return shift_id


def build_live_status_segments(
    db: Session,
    machine_details: Dict[int, str],
    start_date: Optional[datetime],
    end_date: Optional[datetime],
    machine_id: Optional[int] = None,
) -> List[LiveStatusSegment]:
    """
    Convert machine_live_history rows into status segments.
    Status at last_updated_i runs until last_updated_{i+1}.
    The latest row runs from its last_updated until current time (clipped to range).
    Example: 08:00 ON, 09:30 OFF, 10:00 PRODUCTION →
      ON 08:00–09:30, OFF 09:30–10:00, PRODUCTION 10:00–now.
    """
    now = datetime.now()
    range_end = end_date or now
    range_start = start_date

    query = db.query(MachineLiveHistory)
    if machine_id is not None:
        query = query.filter(MachineLiveHistory.machine_id == machine_id)
    # Include history before the window so a segment that started earlier can be clipped in
    query = query.filter(MachineLiveHistory.last_updated <= range_end)
    rows = query.order_by(MachineLiveHistory.machine_id, MachineLiveHistory.last_updated.asc()).all()

    by_machine: Dict[int, list] = {}
    for row in rows:
        by_machine.setdefault(row.machine_id, []).append(row)

    segments: List[LiveStatusSegment] = []
    seg_idx = 0
    for mid, history in by_machine.items():
        machine_name = machine_details.get(mid, f"Machine-{mid}")
        for i, rec in enumerate(history):
            seg_start = rec.last_updated
            if i + 1 < len(history):
                seg_end = history[i + 1].last_updated
            else:
                # Last row: extend to current time (within the selected range)
                seg_end = min(now, range_end)

            if seg_end <= seg_start:
                continue
            if range_start and seg_end <= range_start:
                continue
            if seg_start >= range_end:
                continue

            clipped_start = max(seg_start, range_start) if range_start else seg_start
            clipped_end = min(seg_end, range_end)
            if clipped_end <= clipped_start:
                continue

            status = (rec.status or "OFF").strip().upper()

            seg_idx += 1
            segments.append(LiveStatusSegment(
                id=f"live-{mid}-{seg_idx}",
                machine_id=mid,
                machine_name=machine_name,
                status=status,
                start_time=clipped_start,
                end_time=clipped_end,
            ))

    return segments


def build_operator_issue_segments(
    db: Session,
    machine_details: Dict[int, str],
    start_date: Optional[datetime],
    end_date: Optional[datetime],
    machine_id: Optional[int] = None,
) -> List[OperatorIssueSegment]:
    """Load maintenance.oee_issues overlapping the selected window."""
    now = datetime.now()
    range_end = end_date or now
    range_start = start_date

    issues_query = """
        SELECT id, machine_id, issue_category, issue_reason, start_time, end_time
        FROM maintenance.oee_issues
        WHERE start_time IS NOT NULL
          AND (:machine_id IS NULL OR machine_id = :machine_id)
          AND (:range_end IS NULL OR start_time <= :range_end)
          AND (
                end_time IS NULL
                OR :range_start IS NULL
                OR end_time >= :range_start
              )
        ORDER BY machine_id, start_time
    """
    rows = db.execute(text(issues_query), {
        "machine_id": machine_id,
        "range_start": range_start,
        "range_end": range_end,
    }).fetchall()

    segments: List[OperatorIssueSegment] = []
    for row in rows:
        seg_start = row.start_time
        seg_end = row.end_time or min(now, range_end)
        if seg_end <= seg_start:
            continue
        if range_start and seg_end <= range_start:
            continue
        if seg_start >= range_end:
            continue

        clipped_start = max(seg_start, range_start) if range_start else seg_start
        clipped_end = min(seg_end, range_end)
        if clipped_end <= clipped_start:
            continue

        mid = row.machine_id
        segments.append(OperatorIssueSegment(
            id=f"issue-{row.id}",
            machine_id=mid,
            machine_name=machine_details.get(mid, f"Machine-{mid}"),
            issue_category=row.issue_category,
            issue_reason=row.issue_reason,
            start_time=clipped_start,
            end_time=clipped_end,
        ))

    return segments


@router.get("/overall-oee-analytics/", response_model=OverallOEEAnalysis)
def get_overall_oee_analytics(
    date_str: Optional[str] = Query(None, alias="date", description="Legacy single day (YYYY-MM-DD)"),
    start_date: Optional[str] = Query(None, description="Range start (YYYY-MM-DD[ HH:MM:SS])"),
    end_date: Optional[str] = Query(None, description="Range end (YYYY-MM-DD[ HH:MM:SS])"),
    shift: Optional[str] = Query("all", description="Filter by shift id: '1', '2', or 'all'"),
    db: Session = Depends(get_db)
):
    """
    Aggregate production_monitoring.shift_summary for a date/time range.
    times + parts: SUM; percentage metrics: AVG. Aggregation runs in SQL.
    """
    try:
        range_start, range_end = _resolve_oee_range(date_str, start_date, end_date)
        shift_id = _shift_filter_id(shift)

        all_machines = db.query(Machine).order_by(Machine.id).all()
        machines = {m.id: m for m in all_machines}

        params = {
            "start_ts": range_start,
            "end_ts": range_end,
            "shift_id": shift_id,
        }

        overall_sql = text("""
            SELECT
                COUNT(*)::int AS row_count,
                COALESCE(AVG(availability), 0) AS availability,
                COALESCE(AVG(performance), 0) AS performance,
                COALESCE(AVG(quality), 0) AS quality,
                COALESCE(AVG(oee), 0) AS oee,
                COALESCE(AVG(COALESCE(availability_loss, 100 - COALESCE(availability, 0))), 0) AS availability_loss,
                COALESCE(AVG(COALESCE(performance_loss, 100 - COALESCE(performance, 0))), 0) AS performance_loss,
                COALESCE(AVG(COALESCE(quality_loss, 100 - COALESCE(quality, 0))), 0) AS quality_loss,
                COALESCE(SUM(total_parts), 0)::int AS total_parts,
                COALESCE(SUM(good_parts), 0)::int AS good_parts,
                COALESCE(SUM(bad_parts), 0)::int AS bad_parts
            FROM production_monitoring.shift_summary
            WHERE timestamp >= :start_ts
              AND timestamp <= :end_ts
              AND (:shift_id IS NULL OR shift = :shift_id)
        """)
        overall = db.execute(overall_sql, params).mappings().first() or {}
        row_count = int(overall.get("row_count") or 0)

        machine_sql = text("""
            SELECT
                machine_id,
                COALESCE(AVG(availability), 0) AS availability,
                COALESCE(AVG(performance), 0) AS performance,
                COALESCE(AVG(quality), 0) AS quality,
                COALESCE(AVG(oee), 0) AS oee,
                COALESCE(AVG(COALESCE(availability_loss, 100 - COALESCE(availability, 0))), 0) AS availability_loss,
                COALESCE(AVG(COALESCE(performance_loss, 100 - COALESCE(performance, 0))), 0) AS performance_loss,
                COALESCE(AVG(COALESCE(quality_loss, 100 - COALESCE(quality, 0))), 0) AS quality_loss,
                COALESCE(SUM(total_parts), 0)::int AS total_parts,
                COALESCE(SUM(good_parts), 0)::int AS good_parts,
                COALESCE(SUM(bad_parts), 0)::int AS bad_parts
            FROM production_monitoring.shift_summary
            WHERE timestamp >= :start_ts
              AND timestamp <= :end_ts
              AND (:shift_id IS NULL OR shift = :shift_id)
            GROUP BY machine_id
        """)
        machine_rows = db.execute(machine_sql, params).mappings().all()
        machine_agg = {int(r["machine_id"]): r for r in machine_rows}

        shift_sql = text("""
            SELECT
                shift,
                COALESCE(AVG(availability), 0) AS availability,
                COALESCE(AVG(performance), 0) AS performance,
                COALESCE(AVG(quality), 0) AS quality,
                COALESCE(AVG(oee), 0) AS oee,
                COALESCE(SUM(total_parts), 0)::int AS total_parts,
                COALESCE(SUM(good_parts), 0)::int AS good_parts,
                COALESCE(SUM(bad_parts), 0)::int AS bad_parts
            FROM production_monitoring.shift_summary
            WHERE timestamp >= :start_ts
              AND timestamp <= :end_ts
              AND (:shift_id IS NULL OR shift = :shift_id)
            GROUP BY shift
            ORDER BY shift
        """)
        shift_rows = db.execute(shift_sql, params).mappings().all()

        detail_sql = text("""
            SELECT
                machine_id,
                shift,
                COUNT(*)::int AS row_count,
                MIN(timestamp) AS first_ts,
                MAX(timestamp) AS last_ts,
                COALESCE(SUM(EXTRACT(EPOCH FROM off_time)), 0) AS off_secs,
                COALESCE(SUM(EXTRACT(EPOCH FROM idle_time)), 0) AS idle_secs,
                COALESCE(SUM(EXTRACT(EPOCH FROM production_time)), 0) AS production_secs,
                COALESCE(SUM(total_parts), 0)::int AS total_parts,
                COALESCE(SUM(good_parts), 0)::int AS good_parts,
                COALESCE(SUM(bad_parts), 0)::int AS bad_parts,
                COALESCE(AVG(availability), 0) AS availability,
                COALESCE(AVG(performance), 0) AS performance,
                COALESCE(AVG(quality), 0) AS quality,
                COALESCE(AVG(COALESCE(availability_loss, 100 - COALESCE(availability, 0))), 0) AS availability_loss,
                COALESCE(AVG(COALESCE(performance_loss, 100 - COALESCE(performance, 0))), 0) AS performance_loss,
                COALESCE(AVG(COALESCE(quality_loss, 100 - COALESCE(quality, 0))), 0) AS quality_loss,
                COALESCE(AVG(oee), 0) AS oee
            FROM production_monitoring.shift_summary
            WHERE timestamp >= :start_ts
              AND timestamp <= :end_ts
              AND (:shift_id IS NULL OR shift = :shift_id)
            GROUP BY machine_id, shift
            ORDER BY machine_id, shift
            LIMIT 5000
        """)
        detail_rows = db.execute(detail_sql, params).mappings().all()

        same_day = range_start.date() == range_end.date()
        date_label = (
            range_start.strftime("%Y-%m-%d")
            if same_day
            else f"{range_start.strftime('%Y-%m-%d')} → {range_end.strftime('%Y-%m-%d')}"
        )

        detailed_summaries: List[DetailedShiftSummary] = []
        for r in detail_rows:
            mid = int(r["machine_id"])
            machine = machines.get(mid)
            m_name = build_machine_display_name(machine) or f"Machine {mid}"
            avail = float(r["availability"] or 0)
            perf = float(r["performance"] or 0)
            qual = float(r["quality"] or 0)
            oee_v = float(r["oee"] or 0)
            detailed_summaries.append(DetailedShiftSummary(
                date=date_label,
                shift=str(r["shift"]),
                machine_name=m_name,
                machine_id=mid,
                timestamp=r["last_ts"],
                production_time=_secs_to_hms(r["production_secs"]),
                idle_time=_secs_to_hms(r["idle_secs"]),
                off_time=_secs_to_hms(r["off_secs"]),
                total_parts=int(r["total_parts"] or 0),
                good_parts=int(r["good_parts"] or 0),
                bad_parts=int(r["bad_parts"] or 0),
                availability=round(avail, 2),
                performance=round(perf, 2),
                quality=round(qual, 2),
                availability_loss=round(float(r["availability_loss"] or 0), 2),
                performance_loss=round(float(r["performance_loss"] or 0), 2),
                quality_loss=round(float(r["quality_loss"] or 0), 2),
                oee=round(oee_v, 2),
                oee_metrics={
                    "oee": round(oee_v, 2),
                    "availability": round(avail, 2),
                    "performance": round(perf, 2),
                    "quality": round(qual, 2),
                },
                row_count=int(r["row_count"] or 0),
            ))

        machine_breakdown = []
        for machine in all_machines:
            mid = machine.id
            m_name = build_machine_display_name(machine)
            data = machine_agg.get(mid)
            if not data:
                machine_breakdown.append(MachineOEE(
                    machine_id=mid,
                    machine_name=m_name,
                    oee=None,
                    availability=None,
                    performance=None,
                    quality=None,
                    total_parts=None,
                    good_parts=None,
                    bad_parts=None,
                    losses=None,
                ))
                continue

            machine_breakdown.append(MachineOEE(
                machine_id=mid,
                machine_name=m_name,
                oee=round(float(data["oee"] or 0), 2),
                availability=round(float(data["availability"] or 0), 2),
                performance=round(float(data["performance"] or 0), 2),
                quality=round(float(data["quality"] or 0), 2),
                total_parts=int(data["total_parts"] or 0),
                good_parts=int(data["good_parts"] or 0),
                bad_parts=int(data["bad_parts"] or 0),
                losses=OEELosses(
                    availability_loss=round(float(data["availability_loss"] or 0), 2),
                    performance_loss=round(float(data["performance_loss"] or 0), 2),
                    quality_loss=round(float(data["quality_loss"] or 0), 2),
                ),
            ))

        shift_breakdown = [
            ShiftOEE(
                shift=int(r["shift"]),
                oee=round(float(r["oee"] or 0), 2),
                availability=round(float(r["availability"] or 0), 2),
                performance=round(float(r["performance"] or 0), 2),
                quality=round(float(r["quality"] or 0), 2),
                total_parts=int(r["total_parts"] or 0),
                good_parts=int(r["good_parts"] or 0),
                bad_parts=int(r["bad_parts"] or 0),
            )
            for r in shift_rows
        ]

        overall_oee = round(float(overall.get("oee") or 0), 2) if row_count else 0.0
        overall_availability = round(float(overall.get("availability") or 0), 2) if row_count else 0.0
        overall_performance = round(float(overall.get("performance") or 0), 2) if row_count else 0.0
        overall_quality = round(float(overall.get("quality") or 0), 2) if row_count else 0.0

        return OverallOEEAnalysis(
            period_start=range_start,
            period_end=range_end,
            overall_oee=overall_oee,
            overall_availability=overall_availability,
            overall_performance=overall_performance,
            overall_quality=overall_quality,
            shift_breakdown=shift_breakdown,
            machine_breakdown=machine_breakdown,
            detailed_summaries=detailed_summaries,
            daily_trends=[OEETrend(
                date=range_end.date(),
                oee=overall_oee,
                availability=overall_availability,
                performance=overall_performance,
                quality=overall_quality,
            )],
            losses=OEELosses(
                availability_loss=round(float(overall.get("availability_loss") or (100 - overall_availability)), 2) if row_count else 0.0,
                performance_loss=round(float(overall.get("performance_loss") or (100 - overall_performance)), 2) if row_count else 0.0,
                quality_loss=round(float(overall.get("quality_loss") or (100 - overall_quality)), 2) if row_count else 0.0,
            ),
            total_production=int(overall.get("total_parts") or 0) if row_count else 0,
            total_good_parts=int(overall.get("good_parts") or 0) if row_count else 0,
            total_bad_parts=int(overall.get("bad_parts") or 0) if row_count else 0,
            machine_count=len(all_machines),
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/detailed-shift-summary/")
def get_detailed_shift_summary(
    date_str: Optional[str] = Query(None, alias="date", description="Legacy single day (YYYY-MM-DD)"),
    start_date: Optional[str] = Query(None, description="Range start"),
    end_date: Optional[str] = Query(None, description="Range end"),
    shift: Optional[str] = Query("all", description="Filter by shift id: '1', '2', or 'all'"),
    machine_id: Optional[int] = Query(None, description="Filter by machine ID"),
    db: Session = Depends(get_db)
):
    """Aggregated shift_summary rows for the selected range (SUM times/parts, AVG %)."""
    try:
        range_start, range_end = _resolve_oee_range(date_str, start_date, end_date)
        shift_id = _shift_filter_id(shift)

        params = {
            "start_ts": range_start,
            "end_ts": range_end,
            "shift_id": shift_id,
            "machine_id": machine_id,
        }
        detail_sql = text("""
            SELECT
                machine_id,
                shift,
                COUNT(*)::int AS row_count,
                MAX(timestamp) AS last_ts,
                COALESCE(SUM(EXTRACT(EPOCH FROM off_time)), 0) AS off_secs,
                COALESCE(SUM(EXTRACT(EPOCH FROM idle_time)), 0) AS idle_secs,
                COALESCE(SUM(EXTRACT(EPOCH FROM production_time)), 0) AS production_secs,
                COALESCE(SUM(total_parts), 0)::int AS total_parts,
                COALESCE(SUM(good_parts), 0)::int AS good_parts,
                COALESCE(SUM(bad_parts), 0)::int AS bad_parts,
                COALESCE(AVG(availability), 0) AS availability,
                COALESCE(AVG(performance), 0) AS performance,
                COALESCE(AVG(quality), 0) AS quality,
                COALESCE(AVG(oee), 0) AS oee
            FROM production_monitoring.shift_summary
            WHERE timestamp >= :start_ts
              AND timestamp <= :end_ts
              AND (:shift_id IS NULL OR shift = :shift_id)
              AND (:machine_id IS NULL OR machine_id = :machine_id)
            GROUP BY machine_id, shift
            ORDER BY machine_id, shift
            LIMIT 5000
        """)
        rows = db.execute(detail_sql, params).mappings().all()
        machine_ids = {int(r["machine_id"]) for r in rows}
        machines = {
            m.id: m
            for m in db.query(Machine).filter(Machine.id.in_(machine_ids)).all()
        } if machine_ids else {}

        same_day = range_start.date() == range_end.date()
        date_label = (
            range_start.strftime("%Y-%m-%d")
            if same_day
            else f"{range_start.strftime('%Y-%m-%d')} → {range_end.strftime('%Y-%m-%d')}"
        )

        results = []
        for r in rows:
            mid = int(r["machine_id"])
            machine = machines.get(mid)
            m_name = build_machine_display_name(machine) or f"Machine {mid}"
            results.append({
                "date": date_label,
                "shift": str(r["shift"]),
                "machine_name": m_name,
                "machine_id": mid,
                "production_time": _secs_to_hms(r["production_secs"]),
                "idle_time": _secs_to_hms(r["idle_secs"]),
                "off_time": _secs_to_hms(r["off_secs"]),
                "total_parts": int(r["total_parts"] or 0),
                "good_parts": int(r["good_parts"] or 0),
                "bad_parts": int(r["bad_parts"] or 0),
                "oee_metrics": {
                    "oee": round(float(r["oee"] or 0), 2),
                    "availability": round(float(r["availability"] or 0), 2),
                    "performance": round(float(r["performance"] or 0), 2),
                    "quality": round(float(r["quality"] or 0), 2),
                },
                "row_count": int(r["row_count"] or 0),
            })
        return results
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/machine-oee-analysis/{machine_id}")
def get_machine_oee_analysis(
    machine_id: int,
    date_str: Optional[str] = Query(None, alias="date", description="Date for analysis (YYYY-MM-DD)"),
    shift: Optional[str] = Query("all", description="Filter by shift id: '1', '2', or 'all'"),
    db: Session = Depends(get_db)
):
    """
    Machine card averages for the selected date/shift, plus a 7-day trend
    from production_monitoring.shift_summary rows.
    """
    try:
        if date_str:
            analysis_date = datetime.strptime(date_str, "%Y-%m-%d")
        else:
            analysis_date = datetime.utcnow()

        day_start = analysis_date.replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = analysis_date.replace(hour=23, minute=59, second=59, microsecond=999999)
        trend_start = (analysis_date - timedelta(days=6)).replace(hour=0, minute=0, second=0, microsecond=0)

        machine = db.query(Machine).filter(Machine.id == machine_id).first()
        m_name = build_machine_display_name(machine) or f"Machine {machine_id}"

        day_query = db.query(ShiftSummary).filter(
            ShiftSummary.machine_id == machine_id,
            ShiftSummary.timestamp >= day_start,
            ShiftSummary.timestamp <= day_end,
        )
        trend_query = db.query(ShiftSummary).filter(
            ShiftSummary.machine_id == machine_id,
            ShiftSummary.timestamp >= trend_start,
            ShiftSummary.timestamp <= day_end,
        )

        if shift and str(shift).lower() != "all":
            try:
                shift_id = int(shift)
                if shift_id not in (1, 2):
                    raise HTTPException(status_code=400, detail="Shift must be '1', '2', or 'all'")
            except ValueError:
                raise HTTPException(status_code=400, detail="Shift must be '1', '2', or 'all'")
            day_query = day_query.filter(ShiftSummary.shift == shift_id)
            trend_query = trend_query.filter(ShiftSummary.shift == shift_id)

        summaries = day_query.order_by(ShiftSummary.shift).all()
        trend_rows = trend_query.order_by(ShiftSummary.timestamp, ShiftSummary.shift).all()

        avg_oee = _avg([s.oee or 0 for s in summaries]) if summaries else 0.0
        avg_avail = _avg([s.availability or 0 for s in summaries]) if summaries else 0.0
        avg_perf = _avg([s.performance or 0 for s in summaries]) if summaries else 0.0
        avg_qual = _avg([s.quality or 0 for s in summaries]) if summaries else 0.0

        return {
            "machine_id": machine_id,
            "machine_name": m_name,
            "average_oee": avg_oee,
            "average_availability": avg_avail,
            "average_performance": avg_perf,
            "average_quality": avg_qual,
            "losses": {
                "availability_loss": 100 - avg_avail,
                "performance_loss": 100 - avg_perf,
                "quality_loss": 100 - avg_qual,
            },
            "oee_trends": [{
                "date": (s.timestamp.strftime("%Y-%m-%d") if s.timestamp else analysis_date.strftime("%Y-%m-%d")),
                "label": f"{(s.timestamp.strftime('%m/%d') if s.timestamp else analysis_date.strftime('%m/%d'))} S{s.shift}",
                "shift": s.shift,
                "oee": s.oee or 0,
                "availability": s.availability or 0,
                "performance": s.performance or 0,
                "quality": s.quality or 0,
            } for s in trend_rows],
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/combined-schedule-production/", response_model=CombinedScheduleProductionResponse)
def get_combined_schedule_production(
    start_date: Optional[datetime] = Query(None, description="Filter from this date"),
    end_date: Optional[datetime] = Query(None, description="Filter until this date"),
    machine_id: Optional[int] = Query(None, description="Filter by machine ID"),
    admin_id: Optional[int] = Query(None, description="Filter by admin ID"),
    project_coordinator_id: Optional[int] = Query(None, description="Filter by project coordinator ID"),
    manufacturing_coordinator_id: Optional[int] = Query(None, description="Filter by manufacturing coordinator ID"),
    db: Session = Depends(get_db),
    current_user: AccessUser = Depends(get_current_user),
):
    """
    Retrieve combined planned schedule items and actual production logs.
    Role scope is taken from the JWT user (client role ids ignored).
    """
    scope = scope_ids_from_user(current_user)
    admin_id = scope["admin_id"]
    project_coordinator_id = scope["project_coordinator_id"]
    manufacturing_coordinator_id = scope["manufacturing_coordinator_id"]
    try:
        # First, get ALL machines from configuration to ensure we show all machines
        all_machines = db.query(Machine).all()
        machine_details = {}
        for machine in all_machines:
            make_model = f"{machine.make or ''} {machine.model or ''}".strip()
            machine_details[machine.id] = make_model
        
        # Create all_machines list for the response
        all_machines_info = [
            MachineInfo(
                id=machine.id,
                name=machine_details[machine.id],
                work_center=machine.work_center.work_center_name if machine.work_center else None,
                type=machine.type
            )
            for machine in all_machines
        ]

        # Get planned schedule items using raw SQL since table is in another microservice
        planned_query = """
            SELECT psi.id, psi.part_id, psi.part_number, psi.sale_order_id, psi.sale_order_number, 
                   psi.operation_id, psi.machine_id, psi.planned_start_time, psi.planned_end_time,
                   psi.total_quantity, psi.remaining_quantity, psi.status, psi.created_at,
                   psi.schedule_history_id
            FROM scheduling.planned_schedule_items psi
            LEFT JOIN oms.orders o ON psi.sale_order_id = o.id
            WHERE (:start_date IS NULL OR psi.planned_start_time >= :start_date)
            AND (:end_date IS NULL OR psi.planned_end_time <= :end_date)
            AND (:machine_id IS NULL OR psi.machine_id = :machine_id)
            AND (:admin_id IS NULL OR o.admin_id = :admin_id)
            AND (:project_coordinator_id IS NULL OR o.project_coordinator_id = :project_coordinator_id)
            AND (:manufacturing_coordinator_id IS NULL OR o.manufacturing_coordinator_id = :manufacturing_coordinator_id)
            ORDER BY psi.planned_start_time
        """
        
        planned_result = db.execute(text(planned_query), {
            'start_date': start_date,
            'end_date': end_date,
            'machine_id': machine_id,
            'admin_id': admin_id,
            'project_coordinator_id': project_coordinator_id,
            'manufacturing_coordinator_id': manufacturing_coordinator_id
        }).fetchall()

        # Build planned operations response
        planned_operations = []

        for item in planned_result:
            machine_name = machine_details.get(item.machine_id, f"Machine-{item.machine_id}") if item.machine_id else None

            # Get operation details
            operation = db.query(Operation).filter(Operation.id == item.operation_id).first()
            operation_name = operation.operation_name if operation else None
            operation_number = operation.operation_number if operation else None

            planned_operations.append(PlannedOperation(
                id=item.id,
                part_number=item.part_number,
                operation_id=item.operation_id,
                operation_name=operation_name,
                operation_number=operation_number,
                machine_id=item.machine_id,
                machine_name=machine_name,
                planned_start_time=item.planned_start_time,
                planned_end_time=item.planned_end_time,
                total_quantity=item.total_quantity,
                remaining_quantity=item.remaining_quantity,
                status=item.status,
                sale_order_number=item.sale_order_number
            ))

        # Get production logs (actual) using raw SQL as requested
        logs_query = """
            SELECT pl.id, pl.operation_id, pl.operator_id, pl.from_date, pl.from_time, pl.to_date, pl.to_time, 
                   pl.status, pl.produced_quantity, pl.approved_quantity,
                   o.operation_name, o.operation_number, o.machine_id,
                   p.part_number, p.qty as total_part_qty,
                   u.user_name as operator_name,
                   psi.sale_order_number
            FROM scheduling.production_logs pl
            LEFT JOIN oms.operations o ON pl.operation_id = o.id
            LEFT JOIN oms.parts p ON o.part_id = p.id
            LEFT JOIN oms.products pr ON p.product_id = pr.id
            LEFT JOIN oms.orders ord ON pr.id = ord.product_id
            LEFT JOIN accesscontrol.access_users u ON pl.operator_id = u.id
            LEFT JOIN (
                SELECT DISTINCT ON (operation_id) operation_id, sale_order_number 
                FROM scheduling.planned_schedule_items
            ) psi ON pl.operation_id = psi.operation_id
            WHERE (:start_date IS NULL OR (COALESCE(pl.from_date, '1900-01-01'::date) + COALESCE(pl.from_time, '00:00:00'::time) >= :start_date))
            AND (:end_date IS NULL OR (COALESCE(pl.to_date, pl.from_date, '2099-12-31'::date) + COALESCE(pl.to_time, pl.from_time, '23:59:59'::time) <= :end_date))
            AND (:machine_id IS NULL OR o.machine_id = :machine_id)
            AND (:admin_id IS NULL OR ord.admin_id = :admin_id)
            AND (:project_coordinator_id IS NULL OR ord.project_coordinator_id = :project_coordinator_id)
            AND (:manufacturing_coordinator_id IS NULL OR ord.manufacturing_coordinator_id = :manufacturing_coordinator_id)
            ORDER BY pl.from_date DESC, pl.from_time DESC
        """

        logs = db.execute(text(logs_query), {
            'start_date': start_date,
            'end_date': end_date,
            'machine_id': machine_id,
            'admin_id': admin_id,
            'project_coordinator_id': project_coordinator_id,
            'manufacturing_coordinator_id': manufacturing_coordinator_id
        }).fetchall()

        # Build actual production logs response
        actual_production_logs = []
        for log in logs:
            try:
                machine_name = machine_details.get(log.machine_id, f"Machine-{log.machine_id}") if log.machine_id else None

                # Determine if operation is completed
                is_completed = False
                if log.total_part_qty and log.total_part_qty > 0:
                    total_approved = db.execute(text("""
                        SELECT COALESCE(SUM(approved_quantity), 0)
                        FROM scheduling.production_logs
                        WHERE operation_id = :op_id AND approved_quantity IS NOT NULL
                    """), {"op_id": log.operation_id}).scalar()
                    
                    # Ensure total_approved and total_part_qty are valid for comparison
                    if total_approved is not None and log.total_part_qty is not None:
                        is_completed = total_approved >= log.total_part_qty

                actual_production_logs.append(ActualProductionLog(
                    id=log.id,
                    operation_id=log.operation_id,
                    operation_name=log.operation_name,
                    operation_number=log.operation_number,
                    part_number=log.part_number,
                    sale_order_number=log.sale_order_number,
                    from_date=log.from_date,
                    from_time=str(log.from_time) if log.from_time else None,
                    to_date=log.to_date,
                    to_time=str(log.to_time) if log.to_time else None,
                    status=log.status,
                    produced_quantity=log.produced_quantity,
                    approved_quantity=log.approved_quantity,
                    operator_name=log.operator_name,
                    machine_id=log.machine_id,
                    machine_name=machine_name,
                    is_completed=is_completed
                ))
            except Exception as e:
                print(f"Error processing production log row {log.id}: {e}")
                continue

        live_status_segments = build_live_status_segments(
            db=db,
            machine_details=machine_details,
            start_date=start_date,
            end_date=end_date,
            machine_id=machine_id,
        )

        operator_issue_segments = build_operator_issue_segments(
            db=db,
            machine_details=machine_details,
            start_date=start_date,
            end_date=end_date,
            machine_id=machine_id,
        )

        return CombinedScheduleProductionResponse(
            planned_operations=planned_operations,
            actual_production_logs=actual_production_logs,
            all_machines=all_machines_info,
            live_status_segments=live_status_segments,
            operator_issue_segments=operator_issue_segments,
        )

    except Exception as e:
        error_msg = f"Error retrieving combined schedule and production data: {str(e)}"
        print(error_msg)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "message": "Failed to retrieve combined data",
                "error": str(e)
            }
        )
