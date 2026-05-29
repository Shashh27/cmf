from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from typing import List
from datetime import date, datetime


from DB import AccessUser as AccessUserModel, Machine
from DB.schemas.access_control_pydantic import AccessUserResponseForOperator
from DB.schemas.machine_operator_shift_pydantic import (
    MachineOperatorShiftAssignmentCreate,
    MachineOperatorShiftAssignmentUpdate,
    MachineOperatorShiftAssignmentResponse,
    MachineOperatorInfo,
    MachineShiftConfigurationResponse,
    ShiftConfigDetails,
    ShiftTimingInfo
)

from DB.database import get_db
from DB.models.scheduling import (
    ShiftHoursConfiguration, 
    ShiftTimingConfiguration,
    MachineOperatorShiftAssignment
)
from DB.models.configuration import WorkCenter
from DB.schemas.shift_hours_pydantic import (
    ShiftHoursConfigCreate,
    ShiftHoursConfigUpdate,
    ShiftHoursConfigResponse,
    ShiftTimingResponse,
    ShiftCode,
    SHIFT_TIME_LOOKUP,
    # ShiftHoursCalendarResponse
)

router = APIRouter(
    prefix="/shift-hours",
    tags=["Shift Hours"]
)


def _sync_shift_timings(config, selected_shifts, db: Session, custom_start=None, custom_end=None):
    config.shift_timings.clear()
    
    db.flush()  # 👈 IMPORTANT FIX

    for shift_code in selected_shifts:
        if shift_code == "CUSTOM":
            start_time = custom_start
            end_time = custom_end
        else:
            start_time, end_time = SHIFT_TIME_LOOKUP[shift_code]
        
        timing_config = ShiftTimingConfiguration(
            shift_code=shift_code,
            shift_start=start_time,
            shift_end=end_time,
        )
        
        # Add custom times for CUSTOM shifts
        if shift_code == "CUSTOM":
            timing_config.custom_start = custom_start
            timing_config.custom_end = custom_end
            
        config.shift_timings.append(timing_config)

    # number_of_shifts is 2 only when both GENERAL and NEXT are selected
    if "GENERAL" in selected_shifts and "NEXT" in selected_shifts:
        config.number_of_shifts = 2
    else:
        config.number_of_shifts = len(selected_shifts)



# def _sync_shift_timings(
#     config: ShiftHoursConfiguration,
#     selected_shifts: list[ShiftCode],
# ) -> None:
#     config.shift_timings.clear()
#     for shift_code in selected_shifts:
#         start_time, end_time = SHIFT_TIME_LOOKUP[shift_code]
#         config.shift_timings.append(
#             ShiftTimingConfiguration(
#                 shift_code=shift_code,
#                 shift_start=start_time,
#                 shift_end=end_time,
#             )
#         )
    # Keep parent table strictly in sync with linked timings.
    # config.number_of_shifts = len(selected_shifts)


def _enforce_shift_count_consistency(config: ShiftHoursConfiguration) -> None:
    """Ensure number_of_shifts matches the actual shift timings count."""
    timing_count = len(config.shift_timings)
    if timing_count > 0:
        # number_of_shifts is 2 only when both GENERAL and NEXT are selected
        has_general = any(t.shift_code == "GENERAL" for t in config.shift_timings)
        has_next = any(t.shift_code == "NEXT" for t in config.shift_timings)
        if has_general and has_next:
            config.number_of_shifts = 2
        else:
            config.number_of_shifts = timing_count
    else:
        config.number_of_shifts = 0 if not config.working_day else 1


def _build_response(config: ShiftHoursConfiguration) -> ShiftHoursConfigResponse:
    _enforce_shift_count_consistency(config)
    sorted_timings = sorted(config.shift_timings, key=lambda t: t.shift_start)
    selected_shifts = [timing.shift_code for timing in sorted_timings]
    return ShiftHoursConfigResponse(
        id=config.id,
        date=config.date,
        working_day=config.working_day,
        number_of_shifts=config.number_of_shifts,
        selected_shifts=selected_shifts,
        shift_timings=[
            ShiftTimingResponse(
                id=timing.id,
                shift_code=timing.shift_code,
                shift_start=timing.shift_start,
                shift_end=timing.shift_end,
                custom_start=timing.custom_start,
                custom_end=timing.custom_end
            ) for timing in sorted_timings
        ],
    )

# ----------------------------------------------------
# Admin configures shift for operators by machine-wise
# ----------------------------------------------------

# 1. Pull in the list of operators available for that machine
@router.get("/operators", response_model = List[AccessUserResponseForOperator])
def get_operators(db: Session = Depends(get_db)):
    """Get all operators"""

    operators = (
        db.query(AccessUserModel)
        .filter(AccessUserModel.role == "operator")
        .order_by(AccessUserModel.id.asc())
        .all()
    )

    return operators


# ----------------------------------------------------
# Machine-Operator Shift Configuration
# ----------------------------------------------------

@router.get("/machine/{machine_id}/operators", response_model = List[AccessUserResponseForOperator])
def get_operators_for_machine(machine_id: int, db: Session = Depends(get_db)):
    """Get operators available for a specific machine"""
    
    operators = (
        db.query(AccessUserModel)
        .filter(AccessUserModel.role == "operator")
        .order_by(AccessUserModel.id.asc())
        .all()
    )

    return operators


@router.get("/machine/{machine_id}/operator/{operator_id}/shifts", response_model=MachineShiftConfigurationResponse)
def get_operator_shifts_for_machine(
    machine_id: int, 
    operator_id: int, 
    db: Session = Depends(get_db)
):
    """Get shift configuration for a specific operator on a specific machine"""
    
    # Get machine details
    machine = db.query(Machine).options(joinedload(Machine.work_center)).filter(
        Machine.id == machine_id
    ).first()
    
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")
    
    # Find all shift assignments for this machine and operator with shift config and timings
    assignments = db.query(MachineOperatorShiftAssignment).options(
        joinedload(MachineOperatorShiftAssignment.shift_config).joinedload(ShiftHoursConfiguration.shift_timings)
    ).filter(
        MachineOperatorShiftAssignment.machine_id == machine_id,
        MachineOperatorShiftAssignment.operator_id == operator_id
    ).all()
    
    # Sort assignments by date in Python to avoid SQL alias issues
    assignments.sort(key=lambda x: x.shift_config.date)
    
    if not assignments:
        raise HTTPException(
            status_code=404, 
            detail=f"No shift assignment found for machine {machine_id} and operator {operator_id}"
        )
    
    # Get operator details
    operator = db.query(AccessUserModel).filter(AccessUserModel.id == operator_id).first()
    if not operator:
        raise HTTPException(status_code=404, detail="Operator not found")
    
    # Create operator info
    operator_info = MachineOperatorInfo(
        id=operator.id,
        user_name=operator.user_name,
        gmail=operator.gmail,
        role=operator.role,
        center=operator.center,
        group=operator.group
    )
    
    # Create shift config details for all assignments
    shift_configs = []
    for assignment in assignments:
        # Create shift timing info for this assignment
        shift_timing_infos = []
        for timing in assignment.shift_config.shift_timings:
            timing_info = ShiftTimingInfo(
                shift_code=timing.shift_code,
                shift_start=timing.shift_start,
                shift_end=timing.shift_end,
                custom_start=timing.custom_start,
                custom_end=timing.custom_end
            )
            shift_timing_infos.append(timing_info)
        
        # Create shift config details for this assignment
        shift_config_details = ShiftConfigDetails(
            id=assignment.shift_config.id,
            date=assignment.shift_config.date,
            working_day=assignment.shift_config.working_day,
            number_of_shifts=assignment.shift_config.number_of_shifts,
            shift_timings=shift_timing_infos
        )
        shift_configs.append(shift_config_details)
    
    return MachineShiftConfigurationResponse(
        machine_id=machine.id,
        machine_make=machine.make,
        work_center_name=machine.work_center.work_center_name if machine.work_center else None,
        operators_selected=[operator_info],
        shift_configs=shift_configs  # Return all shift configs
    )


@router.post("/machine/{machine_id}/operator/{operator_id}/shifts", response_model=MachineOperatorShiftAssignmentResponse)
def create_operator_shift_for_machine(
    machine_id: int,
    operator_id: int,
    data: MachineOperatorShiftAssignmentCreate,
    db: Session = Depends(get_db)
):
    """Create shift assignment for a specific operator on a specific machine"""
    
    # Check if machine exists
    machine = db.query(Machine).filter(Machine.id == machine_id).first()
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")
    
    # Check if operator exists
    operator = db.query(AccessUserModel).filter(AccessUserModel.id == operator_id).first()
    if not operator:
        raise HTTPException(status_code=404, detail="Operator not found")
    
    # Check if shift configuration exists with timings
    shift_config = db.query(ShiftHoursConfiguration).options(
        joinedload(ShiftHoursConfiguration.shift_timings)
    ).filter(
        ShiftHoursConfiguration.id == data.shift_config_id
    ).first()
    if not shift_config:
        raise HTTPException(status_code=404, detail="Shift configuration not found")
    
    # Check if assignment already exists
    existing = db.query(MachineOperatorShiftAssignment).filter(
        MachineOperatorShiftAssignment.machine_id == machine_id,
        MachineOperatorShiftAssignment.operator_id == operator_id,
        MachineOperatorShiftAssignment.shift_config_id == data.shift_config_id
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Shift assignment already exists for machine {machine_id}, operator {operator_id}, and shift config {data.shift_config_id}. Use PUT to update."
        )
    
    # Check if operator is already assigned to a different machine for the same shift date
    # Get the shift date from the shift configuration
    shift_date = shift_config.date
    
    # Find all assignments for this operator on the same date
    operator_assignments = db.query(MachineOperatorShiftAssignment).options(
        joinedload(MachineOperatorShiftAssignment.shift_config)
    ).filter(
        MachineOperatorShiftAssignment.operator_id == operator_id
    ).all()
    
    # Check if operator is assigned to any other machine on the same date
    for assignment in operator_assignments:
        if assignment.shift_config.date == shift_date and assignment.machine_id != machine_id:
            raise HTTPException(
                status_code=400,
                detail=f"Operator {operator_id} is already assigned to machine {assignment.machine_id} on {shift_date}. An operator can only be assigned to one machine at a time."
            )
    
    # Create new assignment
    assignment = MachineOperatorShiftAssignment(
        machine_id=machine_id,
        operator_id=operator_id,
        shift_config_id=data.shift_config_id
    )
    
    db.add(assignment)
    db.commit()
    db.refresh(assignment)
    
    # Create shift timing info
    shift_timing_infos = []
    for timing in shift_config.shift_timings:
        timing_info = ShiftTimingInfo(
            shift_code=timing.shift_code,
            shift_start=timing.shift_start,
            shift_end=timing.shift_end,
            custom_start=timing.custom_start,
            custom_end=timing.custom_end
        )
        shift_timing_infos.append(timing_info)
    
    # Create detailed response with shift configuration
    shift_config_details = ShiftConfigDetails(
        id=shift_config.id,
        date=shift_config.date,
        working_day=shift_config.working_day,
        number_of_shifts=shift_config.number_of_shifts,
        shift_timings=shift_timing_infos
    )
    
    return MachineOperatorShiftAssignmentResponse(
        id=assignment.id,
        machine_id=assignment.machine_id,
        operator_id=assignment.operator_id,
        shift_config=shift_config_details,
        created_at=assignment.created_at,
        updated_at=assignment.updated_at
    )


@router.put("/machine/{machine_id}/operator/{operator_id}/shifts/{assignment_id}", response_model=MachineOperatorShiftAssignmentResponse)
def update_operator_shift_for_machine(
    machine_id: int,
    operator_id: int,
    assignment_id: int,
    data: MachineOperatorShiftAssignmentUpdate,
    db: Session = Depends(get_db)
):
    """Update shift assignment for a specific operator on a specific machine"""
    
    # Get existing assignment with shift config and timings
    assignment = db.query(MachineOperatorShiftAssignment).options(
        joinedload(MachineOperatorShiftAssignment.shift_config).joinedload(ShiftHoursConfiguration.shift_timings)
    ).filter(
        MachineOperatorShiftAssignment.id == assignment_id,
        MachineOperatorShiftAssignment.machine_id == machine_id,
        MachineOperatorShiftAssignment.operator_id == operator_id
    ).first()
    
    if not assignment:
        raise HTTPException(
            status_code=404,
            detail=f"Shift assignment not found for assignment_id {assignment_id}, machine {machine_id}, and operator {operator_id}"
        )
    
    # Update assignment
    if data.operator_id is not None:
        assignment.operator_id = data.operator_id
    if data.shift_config_id is not None:
        assignment.shift_config_id = data.shift_config_id
    
    assignment.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(assignment)
    
    # Create shift timing info
    shift_timing_infos = []
    for timing in assignment.shift_config.shift_timings:
        timing_info = ShiftTimingInfo(
            shift_code=timing.shift_code,
            shift_start=timing.shift_start,
            shift_end=timing.shift_end,
            custom_start=timing.custom_start,
            custom_end=timing.custom_end
        )
        shift_timing_infos.append(timing_info)
    
    # Create detailed response with shift configuration
    shift_config_details = ShiftConfigDetails(
        id=assignment.shift_config.id,
        date=assignment.shift_config.date,
        working_day=assignment.shift_config.working_day,
        number_of_shifts=assignment.shift_config.number_of_shifts,
        shift_timings=shift_timing_infos
    )
    
    return MachineOperatorShiftAssignmentResponse(
        id=assignment.id,
        machine_id=assignment.machine_id,
        operator_id=assignment.operator_id,
        shift_config=shift_config_details,
        created_at=assignment.created_at,
        updated_at=assignment.updated_at
    )


@router.delete("/machine/{machine_id}/operator/{operator_id}/shifts/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_operator_shift_for_machine(
    machine_id: int,
    operator_id: int,
    assignment_id: int,
    db: Session = Depends(get_db)
):
    """Delete shift assignment for a specific operator on a specific machine"""
    
    # Get existing assignment
    assignment = db.query(MachineOperatorShiftAssignment).filter(
        MachineOperatorShiftAssignment.id == assignment_id,
        MachineOperatorShiftAssignment.machine_id == machine_id,
        MachineOperatorShiftAssignment.operator_id == operator_id
    ).first()
    
    if not assignment:
        raise HTTPException(
            status_code=404,
            detail=f"Shift assignment not found for assignment_id {assignment_id}, machine {machine_id}, and operator {operator_id}"
        )
    
    db.delete(assignment)
    db.commit()
    return None


@router.get("/assignments/{shift_config_id}", response_model=List[MachineOperatorShiftAssignmentResponse])
def get_assignments_by_shift_config(
    shift_config_id: int,
    db: Session = Depends(get_db)
):
    """Get all machine operator assignments for a specific shift configuration"""
    
    # Check if shift configuration exists
    shift_config = db.query(ShiftHoursConfiguration).filter(
        ShiftHoursConfiguration.id == shift_config_id
    ).first()
    if not shift_config:
        raise HTTPException(status_code=404, detail="Shift configuration not found")
    
    # Get all assignments for this shift config with related data
    assignments = db.query(MachineOperatorShiftAssignment).options(
        joinedload(MachineOperatorShiftAssignment.shift_config).joinedload(ShiftHoursConfiguration.shift_timings),
        joinedload(MachineOperatorShiftAssignment.operator),
        joinedload(MachineOperatorShiftAssignment.machine)
    ).filter(
        MachineOperatorShiftAssignment.shift_config_id == shift_config_id
    ).all()
    
    # Create detailed responses
    detailed_assignments = []
    for assignment in assignments:
        # Create shift timing info
        shift_timing_infos = []
        for timing in assignment.shift_config.shift_timings:
            timing_info = ShiftTimingInfo(
                shift_code=timing.shift_code,
                shift_start=timing.shift_start,
                shift_end=timing.shift_end,
                custom_start=timing.custom_start,
                custom_end=timing.custom_end
            )
            shift_timing_infos.append(timing_info)
        
        shift_config_details = ShiftConfigDetails(
            id=assignment.shift_config.id,
            date=assignment.shift_config.date,
            working_day=assignment.shift_config.working_day,
            number_of_shifts=assignment.shift_config.number_of_shifts,
            shift_timings=shift_timing_infos
        )
        
        detailed_assignment = MachineOperatorShiftAssignmentResponse(
            id=assignment.id,
            machine_id=assignment.machine_id,
            operator_id=assignment.operator_id,
            shift_config=shift_config_details,
            created_at=assignment.created_at,
            updated_at=assignment.updated_at
        )
        detailed_assignments.append(detailed_assignment)
    
    return detailed_assignments


@router.get("/machine/{machine_id}/assignments", response_model=List[MachineOperatorShiftAssignmentResponse])
def get_machine_assignments(
    machine_id: int,
    db: Session = Depends(get_db)
):
    """Get all shift assignments for a specific machine"""
    
    # Check if machine exists
    machine = db.query(Machine).filter(Machine.id == machine_id).first()
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")
    
    # Get all assignments for this machine with related data
    assignments = db.query(MachineOperatorShiftAssignment).options(
        joinedload(MachineOperatorShiftAssignment.shift_config).joinedload(ShiftHoursConfiguration.shift_timings),
        joinedload(MachineOperatorShiftAssignment.operator)
    ).filter(
        MachineOperatorShiftAssignment.machine_id == machine_id
    ).all()
    
    # Create detailed responses
    detailed_assignments = []
    for assignment in assignments:
        # Create shift timing info
        shift_timing_infos = []
        for timing in assignment.shift_config.shift_timings:
            timing_info = ShiftTimingInfo(
                shift_code=timing.shift_code,
                shift_start=timing.shift_start,
                shift_end=timing.shift_end,
                custom_start=timing.custom_start,
                custom_end=timing.custom_end
            )
            shift_timing_infos.append(timing_info)
        
        shift_config_details = ShiftConfigDetails(
            id=assignment.shift_config.id,
            date=assignment.shift_config.date,
            working_day=assignment.shift_config.working_day,
            number_of_shifts=assignment.shift_config.number_of_shifts,
            shift_timings=shift_timing_infos
        )
        
        detailed_assignment = MachineOperatorShiftAssignmentResponse(
            id=assignment.id,
            machine_id=assignment.machine_id,
            operator_id=assignment.operator_id,
            shift_config=shift_config_details,
            created_at=assignment.created_at,
            updated_at=assignment.updated_at
        )
        detailed_assignments.append(detailed_assignment)
    
    return detailed_assignments


# ---------------- CREATE ----------------
@router.post("/", response_model=ShiftHoursConfigResponse)
def create_shift_config(data: ShiftHoursConfigCreate, db: Session = Depends(get_db)):
    # Check if configuration already exists for this date
    existing = db.query(ShiftHoursConfiguration).filter(
        ShiftHoursConfiguration.date == data.date
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Shift configuration already exists for {data.date}. Use PUT to update."
        )
    
    selected_shifts = data.selected_shifts
    custom_start = data.custom_start
    custom_end = data.custom_end
    number_of_shifts = len(selected_shifts)

    # Default behaviour: non-working day with no selected shifts has 0 shifts.
    # Dedicated non-working-day shifts are still allowed when selected.
    if data.working_day and number_of_shifts == 0:
        number_of_shifts = 1
        selected_shifts = ["GENERAL"]

    new_config = ShiftHoursConfiguration(
        date=data.date,
        working_day=data.working_day,
        number_of_shifts=0,  # Will be set correctly by _sync_shift_timings and _enforce_shift_count_consistency
    )
    _sync_shift_timings(new_config, selected_shifts, db, custom_start, custom_end)
    _enforce_shift_count_consistency(new_config)
    db.add(new_config)
    db.commit()
    db.refresh(new_config)

    return _build_response(new_config)




# ---------------- GET ALL ----------------
@router.get("/", response_model=list[ShiftHoursConfigResponse])
def get_all_shift_configs(year: int = None, db: Session = Depends(get_db)):
    today = datetime.today()
    
    # Default to current year if not provided
    if year is None:
        year = today.year
    
    # Calculate start and end dates for the year
    start_date = date(year, 1, 1)
    end_date = date(year + 1, 1, 1)
    
    configs = (
        db.query(ShiftHoursConfiguration)
        .filter(
            ShiftHoursConfiguration.date >= start_date,
            ShiftHoursConfiguration.date < end_date
        )
        .order_by(ShiftHoursConfiguration.date.asc())
        .all()
    )

    return [_build_response(c) for c in configs]


# ---------------- GET ONE ----------------
@router.get("/{config_id}", response_model=ShiftHoursConfigResponse)
def get_shift_config(config_id: int, db: Session = Depends(get_db)):
    config = db.query(ShiftHoursConfiguration).filter(
        ShiftHoursConfiguration.id == config_id
    ).first()

    if not config:
        raise HTTPException(404, "Shift configuration not found")

    return _build_response(config)







# ---------------- GET ALL ----------------
# @router.get("/", response_model=List[ShiftHoursConfigResponse])
# def get_all_shift_configs(db: Session = Depends(get_db)):
#     configs = db.query(ShiftHoursConfiguration).all()
#     return configs


# ---------------- GET ONE ----------------
# @router.get("/{config_id}", response_model=ShiftHoursConfigResponse)
# def get_shift_config(config_id: int, db: Session = Depends(get_db)):
#     config = db.query(ShiftHoursConfiguration).filter(
#         ShiftHoursConfiguration.id == config_id
#     ).first()

#     if not config:
#         raise HTTPException(404, "Shift configuration not found")

#     return config



# ---------------- UPDATE ----------------
@router.put("/{config_id}", response_model=ShiftHoursConfigResponse)
def update_shift_config(
    config_id: int, data: ShiftHoursConfigUpdate, 
    db: Session = Depends(get_db)
):
    config = db.query(ShiftHoursConfiguration).filter(
        ShiftHoursConfiguration.id == config_id
    ).first()

    if not config:
        raise HTTPException(404, "Shift configuration not found")

    if data.working_day is not None:
        config.working_day = data.working_day

    if data.selected_shifts is not None:
        selected_shifts = data.selected_shifts
        custom_start = data.custom_start
        custom_end = data.custom_end
        number_of_shifts = len(selected_shifts)

        if config.working_day and number_of_shifts == 0:
            number_of_shifts = 1
            selected_shifts = ["GENERAL"]

        _sync_shift_timings(config, selected_shifts, db, custom_start, custom_end)
    elif data.working_day is not None and config.working_day and not config.shift_timings:
        _sync_shift_timings(config, ["GENERAL"], db)

    _enforce_shift_count_consistency(config)

    db.commit()
    db.refresh(config)

    return _build_response(config)



# ---------------- DELETE ----------------
@router.delete("/{config_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_shift_config(config_id: int, db: Session = Depends(get_db)):
    config = db.query(ShiftHoursConfiguration).filter(
        ShiftHoursConfiguration.id == config_id
    ).first()

    if not config:
        raise HTTPException(404, "Shift configuration not found")

    db.delete(config)
    db.commit()
    return None


