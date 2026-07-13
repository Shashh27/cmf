from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import select, func, text, cast, DateTime as SQLAlchemyDateTime
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from DB.database import get_db
from DB.models.production import ShiftSummary
from DB.models.monitoring import MachineLiveStatus
from DB.models.configuration import Machine, workcenter
from DB.models.oms import Operation, Part
from DB.schemas.production_analytics import (
    OverallOEEAnalysis, OEELosses, OEETrend, ShiftOEE, MachineOEE,
    DetailedShiftSummary, CombinedScheduleProductionResponse, PlannedOperation, ActualProductionLog, MachineInfo
)

router = APIRouter(
    prefix="/production-analytics",
    tags=["production-analytics"]
)

def get_correct_shift(timestamp, db):
    """
    Calculate correct shift based on 8-hour shifts starting from 8:30 AM
    Shift Number Assignment:
    - Shift 1: 08:30:00 → 16:30:00 (8 hours)
    - Shift 2: 16:30:00 → 00:30:00 (8 hours) 
    - Shift 3: 00:30:00 → 08:30:00 (8 hours)
    """
    try:
        hour = timestamp.hour
        minute = timestamp.minute
        time_in_minutes = hour * 60 + minute
        
        # Convert shift times to minutes from midnight
        # Shift 1: 08:30 (8:30 AM = 8*60 + 30 = 510 minutes)
        # Shift 2: 16:30 (4:30 PM = 16*60 + 30 = 990 minutes) 
        # Shift 3: 00:30 (12:30 AM = 0*60 + 30 = 30 minutes)
        
        if 510 <= time_in_minutes < 990:  # 08:30 to 16:30
            return 1
        elif 990 <= time_in_minutes < 1440 or 0 <= time_in_minutes < 30:  # 16:30 to 00:30
            return 2
        else:  # 00:30 to 08:30
            return 3
            
    except Exception as e:
        # Fallback logic in case of error
        hour = timestamp.hour
        if 8 <= hour < 16:
            return 1
        elif 16 <= hour < 24:
            return 2
        else:
            return 3

@router.get("/overall-oee-analytics/", response_model=OverallOEEAnalysis)
def get_overall_oee_analytics(
    date_str: Optional[str] = Query(None, alias="date", description="Date for analysis (YYYY-MM-DD)"),
    shift: Optional[str] = Query("all", description="Filter by shift: '1', '2', '3', or 'all'"),
    db: Session = Depends(get_db)
):
    """
    Get overall OEE analytics for the entire factory across all machines for a specific date.
    Calculated from migrated production logs in shift_summary.
    """
    try:
        # Parse date
        if date_str:
            try:
                analysis_date = datetime.strptime(date_str, "%Y-%m-%d")
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
        else:
            analysis_date = datetime.utcnow()

        # Set start and end times for the entire day
        start_date = analysis_date.replace(hour=0, minute=0, second=0, microsecond=0)
        end_date = analysis_date.replace(hour=23, minute=59, second=59, microsecond=999999)

        # Build query from ShiftSummary
        query = db.query(ShiftSummary).filter(
            ShiftSummary.timestamp >= start_date,
            ShiftSummary.timestamp <= end_date
        )

        # Add shift filter
        if shift and shift.lower() != 'all':
            try:
                shift_number = int(shift)
                query = query.filter(ShiftSummary.shift == shift_number)
            except ValueError:
                raise HTTPException(status_code=400, detail="Shift must be '1', '2', '3', or 'all'")

        summaries = query.all()

        if not summaries:
            return OverallOEEAnalysis(
                period_start=start_date,
                period_end=end_date,
                overall_oee=0.0,
                overall_availability=0.0,
                overall_performance=0.0,
                overall_quality=0.0,
                shift_breakdown=[],
                machine_breakdown=[],
                detailed_summaries=[],
                daily_trends=[],
                losses=OEELosses(
                    availability_loss=0.0,
                    performance_loss=0.0,
                    quality_loss=0.0
                ),
                total_production=0,
                total_good_parts=0,
                total_bad_parts=0,
                machine_count=0
            )

        # Calculate metrics
        total_parts = sum(s.total_parts or 0 for s in summaries)
        total_good_parts = sum(s.good_parts or 0 for s in summaries)
        total_bad_parts = sum(s.bad_parts or 0 for s in summaries)

        record_count = len(summaries)
        total_oee = sum(s.oee or 0 for s in summaries)
        total_availability = sum(s.availability or 0 for s in summaries)
        total_performance = sum(s.performance or 0 for s in summaries)
        total_quality = sum(s.quality or 0 for s in summaries)

        unique_machines = set(s.machine_id for s in summaries)
        machine_count = len(unique_machines)

        avg_oee = total_oee / record_count
        avg_availability = total_availability / record_count
        avg_performance = total_performance / record_count
        avg_quality = total_quality / record_count

        # Recalculate loss based on the pillars (Loss = 100 - Pillar)
        avg_availability_loss = 100 - avg_availability
        avg_performance_loss = 100 - avg_performance
        avg_quality_loss = 100 - avg_quality

        # Calculate machine-wise breakdown
        machine_breakdown = []
        detailed_summaries = []
        machine_data = {}
        for s in summaries:
            if s.machine_id not in machine_data:
                machine_data[s.machine_id] = {
                    "oee": 0, "avail": 0, "perf": 0, "qual": 0, 
                    "count": 0, "t_parts": 0, "g_parts": 0, "b_parts": 0,
                    "a_loss": 0, "p_loss": 0, "q_loss": 0
                }
            md = machine_data[s.machine_id]
            md["oee"] += s.oee or 0
            md["avail"] += s.availability or 0
            md["perf"] += s.performance or 0
            md["qual"] += s.quality or 0
            md["count"] += 1
            md["t_parts"] += s.total_parts or 0
            md["g_parts"] += s.good_parts or 0
            md["b_parts"] += s.bad_parts or 0
            md["a_loss"] += s.availability_loss or 0
            md["p_loss"] += s.performance_loss or 0
            md["q_loss"] += s.quality_loss or 0
        
        for mid, data in machine_data.items():
            machine = db.query(Machine).filter(Machine.id == mid).first()
            m_name = f"{machine.make or ''} {machine.model or ''}".strip() if machine else f"Machine {mid}"
            count = data["count"]
            
            m_avail = data["avail"] / count
            m_perf = data["perf"] / count
            m_qual = data["qual"] / count
            
            machine_breakdown.append(MachineOEE(
                machine_id=mid,
                machine_name=m_name,
                oee=data["oee"] / count,
                availability=m_avail,
                performance=m_perf,
                quality=m_qual,
                total_parts=data["t_parts"],
                good_parts=data["g_parts"],
                bad_parts=data["b_parts"],
                losses=OEELosses(
                    availability_loss=100 - m_avail,
                    performance_loss=100 - m_perf,
                    quality_loss=100 - m_qual
                )
            ))

            # Add to detailed summaries
            detailed_summaries.append(DetailedShiftSummary(
                date=analysis_date.strftime("%Y-%m-%d"),
                shift="all",
                machine_name=m_name,
                machine_id=mid,
                production_time=480,
                idle_time=(100 - m_avail) / 100 * 480,
                off_time=0,
                total_parts=data["t_parts"],
                good_parts=data["g_parts"],
                bad_parts=data["b_parts"],
                oee_metrics={
                    "oee": data["oee"] / count,
                    "availability": m_avail,
                    "performance": m_perf,
                    "quality": m_qual
                },
                updatedate=analysis_date
            ))

        shift_breakdown = []
        if shift and shift.lower() == 'all':
            shift_data = {}
            for s in summaries:
                if s.shift not in shift_data:
                    shift_data[s.shift] = {
                        "shift": s.shift,
                        "total_oee": 0,
                        "total_availability": 0,
                        "total_performance": 0,
                        "total_quality": 0,
                        "count": 0,
                        "total_parts": 0,
                        "good_parts": 0,
                        "bad_parts": 0
                    }
                sd = shift_data[s.shift]
                sd["total_oee"] += s.oee or 0
                sd["total_availability"] += s.availability or 0
                sd["total_performance"] += s.performance or 0
                sd["total_quality"] += s.quality or 0
                sd["count"] += 1
                sd["total_parts"] += s.total_parts or 0
                sd["good_parts"] += s.good_parts or 0
                sd["bad_parts"] += s.bad_parts or 0

            for sid, data in shift_data.items():
                count = data["count"]
                shift_breakdown.append(ShiftOEE(
                    shift=sid,
                    oee=data["total_oee"] / count,
                    availability=data["total_availability"] / count,
                    performance=data["total_performance"] / count,
                    quality=data["total_quality"] / count,
                    total_parts=data["total_parts"],
                    good_parts=data["good_parts"],
                    bad_parts=data["bad_parts"]
                ))

        daily_trends = [OEETrend(
            date=analysis_date.date(),
            oee=avg_oee,
            availability=avg_availability,
            performance=avg_performance,
            quality=avg_quality
        )]

        return OverallOEEAnalysis(
            period_start=start_date,
            period_end=end_date,
            overall_oee=avg_oee,
            overall_availability=avg_availability,
            overall_performance=avg_performance,
            overall_quality=avg_quality,
            shift_breakdown=shift_breakdown,
            machine_breakdown=machine_breakdown,
            detailed_summaries=detailed_summaries,
            daily_trends=daily_trends,
            losses=OEELosses(
                availability_loss=avg_availability_loss,
                performance_loss=avg_performance_loss,
                quality_loss=avg_quality_loss
            ),
            total_production=total_parts,
            total_good_parts=total_good_parts,
            total_bad_parts=total_bad_parts,
            machine_count=machine_count
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/detailed-shift-summary/")
def get_detailed_shift_summary(
    date_str: Optional[str] = Query(None, alias="date", description="Date for analysis (YYYY-MM-DD)"),
    shift: Optional[str] = Query("all", description="Filter by shift: '1', '2', '3', or 'all'"),
    machine_id: Optional[int] = Query(None, description="Filter by machine ID"),
    db: Session = Depends(get_db)
):
    """
    Get detailed shift-wise summary for each machine.
    Calculated directly from production logs.
    """
    try:
        if date_str:
            analysis_date = datetime.strptime(date_str, "%Y-%m-%d")
        else:
            analysis_date = datetime.utcnow()

        # Build query using raw SQL
        query = """
            SELECT pl.operation_id, pl.produced_quantity, pl.approved_quantity, mls.machine_id
            FROM scheduling.production_logs pl
            JOIN production_monitoring.machine_live_status mls ON pl.operation_id = mls.current_operation_id
            WHERE pl.from_date = :analysis_date
        """
        params = {'analysis_date': analysis_date.date()}
        
        if machine_id:
            query += " AND mls.machine_id = :machine_id"
            params['machine_id'] = machine_id

        logs = db.execute(text(query), params).fetchall()
        
        # Group logs by machine
        machine_logs = {}
        for log in logs:
            m_id = log.machine_id
            if m_id not in machine_logs:
                machine_logs[m_id] = {"produced": 0, "approved": 0}
            
            machine_logs[m_id]["produced"] += (log.produced_quantity or 0)
            machine_logs[m_id]["approved"] += (log.approved_quantity or 0)

        results = []
        for m_id, stats in machine_logs.items():
            machine = db.query(Machine).filter(Machine.id == m_id).first()
            m_name = f"{machine.work_center.work_center_name}-{machine.type}" if machine and machine.work_center else (machine.type if machine else f"Machine {m_id}")
            
            quality = (stats["approved"] / stats["produced"] * 100) if stats["produced"] > 0 else 0
            
            results.append({
                "date": analysis_date.strftime("%Y-%m-%d"),
                "shift": "all",
                "machine_name": m_name,
                "machine_id": m_id,
                "production_time": 480,
                "idle_time": 0,
                "off_time": 0,
                "total_parts": stats["produced"],
                "good_parts": stats["approved"],
                "bad_parts": stats["produced"] - stats["approved"],
                "oee_metrics": {
                    "oee": (85.0 * 80.0 * (quality/100)) * 100,
                    "availability": 85.0,
                    "performance": 80.0,
                    "quality": quality
                }
            })
        
        return results
    except Exception as e:
        print(f"Error in detailed-shift-summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/machine-oee-analysis/{machine_id}")
def get_machine_oee_analysis(
    machine_id: int,
    date_str: Optional[str] = Query(None, alias="date", description="Date for analysis (YYYY-MM-DD)"),
    shift: Optional[str] = Query("all", description="Filter by shift: '1', '2', '3', or 'all'"),
    db: Session = Depends(get_db)
):
    """
    Get detailed OEE analysis for a specific machine from production logs.
    """
    try:
        if date_str:
            analysis_date = datetime.strptime(date_str, "%Y-%m-%d")
        else:
            analysis_date = datetime.utcnow()

        # Build query using raw SQL
        query = """
            SELECT pl.produced_quantity, pl.approved_quantity
            FROM scheduling.production_logs pl
            JOIN production_monitoring.machine_live_status mls ON pl.operation_id = mls.current_operation_id
            WHERE pl.from_date = :analysis_date AND mls.machine_id = :machine_id
        """
        logs = db.execute(text(query), {
            'analysis_date': analysis_date.date(),
            'machine_id': machine_id
        }).fetchall()

        machine = db.query(Machine).filter(Machine.id == machine_id).first()
        m_name = f"{machine.work_center.work_center_name}-{machine.type}" if machine and machine.work_center else (machine.type if machine else f"Machine {machine_id}")

        if not logs:
            return {
                "machine_id": machine_id,
                "machine_name": m_name,
                "average_oee": 0.0,
                "average_availability": 0.0,
                "average_performance": 0.0,
                "average_quality": 0.0,
                "losses": {"availability_loss": 0.0, "performance_loss": 0.0, "quality_loss": 0.0},
                "oee_trends": []
            }

        total_produced = sum(log.produced_quantity or 0 for log in logs)
        total_approved = sum(log.approved_quantity or 0 for log in logs)
        
        quality = (total_approved / total_produced * 100) if total_produced > 0 else 0
            
        # Calculate availability based on actual downtime
        downtime_data = db.execute(text('''
            SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (end_time - start_time))/60), 0) as total_downtime_minutes
            FROM scheduling.machine_downtimes 
            WHERE machine_id = :machine_id 
            AND DATE(start_time) = :date
        '''), {'machine_id': machine_id, 'date': analysis_date.date()}).fetchone()
        
        total_downtime = downtime_data[0] or 0
        planned_shift_time = 480  # 8 hours
        actual_runtime = max(0, planned_shift_time - total_downtime)
        avail = (actual_runtime / planned_shift_time) * 100
        
        # Calculate performance based on production efficiency
        if logs and actual_runtime > 0:
            total_produced_logs = sum(log.produced_quantity or 0 for log in logs)
            avg_parts_per_hour = total_produced_logs / (actual_runtime / 60)
            perf = min(95.0, (avg_parts_per_hour / 10) * 100)
            perf = max(70.0, perf)
        else:
            perf = 85.0
        
        oee = (avail/100 * perf/100 * quality/100) * 100

        return {
            "machine_id": machine_id,
            "machine_name": m_name,
            "average_oee": oee,
            "average_availability": avail,
            "average_performance": perf,
            "average_quality": quality,
            "losses": {
                "availability_loss": 100 - avail,
                "performance_loss": 100 - perf,
                "quality_loss": 100 - quality
            },
            "oee_trends": [{
                "date": analysis_date.strftime("%Y-%m-%d"),
                "oee": oee,
                "availability": avail,
                "performance": perf,
                "quality": quality
            }]
        }
    except Exception as e:
        print(f"Error in machine-oee-analysis: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/combined-schedule-production/", response_model=CombinedScheduleProductionResponse)
def get_combined_schedule_production(
    start_date: Optional[datetime] = Query(None, description="Filter from this date"),
    end_date: Optional[datetime] = Query(None, description="Filter until this date"),
    machine_id: Optional[int] = Query(None, description="Filter by machine ID"),
    admin_id: Optional[int] = Query(None),
    project_coordinator_id: Optional[int] = Query(None),
    manufacturing_coordinator_id: Optional[int] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Retrieve combined planned schedule items and actual production logs with optional filtering.
    Planned data comes from planned_schedule_items (planned_start_time, planned_end_time).
    Actual data comes from production_logs (from_time, to_time).
    An operation is considered completed when approved_qty matches the total part quantity.
    """
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

        return CombinedScheduleProductionResponse(
            planned_operations=planned_operations,
            actual_production_logs=actual_production_logs,
            all_machines=all_machines_info
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
