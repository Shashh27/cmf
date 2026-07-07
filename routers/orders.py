from fastapi import APIRouter, Depends, HTTPException, status, Query

from pydantic import BaseModel

from sqlalchemy.orm import Session, joinedload

from sqlalchemy import text, func, literal

from typing import List, Optional

from datetime import datetime

from DB.database import get_db

from DB.models.oms import (

    Order,

    Product,

    OrderDocument,

    Part,

    OrderPartPriority,

    PartType,

    Operation,

)

from DB.models.configuration import Customer, Machine, workcenter

from DB.models.inventory import InventoryRequest, InventoryReturnRequest, RawMaterialStock

from DB.models.access_control import AccessUser

from DB.schemas.oms import (

    Order as OrderResponse,

    OrderCreate,

    OrderUpdate,

    OrderAssign,

    OrderApproval,

    OrderWithCustomer,

    OrderWithCustomerAndProduct,

    OrderWithHierarchy,

    OrderPartPriority as OrderPartPrioritySchema,

    OrderPartPriorityUpdate,

    OrderPartPriorityGlobalUpdate,

    OrderPartPrioritySwap,

    OrderWisePriority,

)

from .products import fetch_product_hierarchy, delete_product_cascade

from DB.minio_client import get_minio_client

from DB.models.notifications import OrderNotification as OrderNotificationModel



router = APIRouter(prefix="/orders", tags=["orders"])



@router.get("/shop-floor/hierarchical")

def get_shop_floor_hierarchical_data(

    admin_id: int | None = None,

    manufacturing_coordinator_id: int | None = None,

    db: Session = Depends(get_db)

):

    """

    Get shop floor hierarchical data with machines, orders, parts, and operations.

    Returns:

    - All machines with their status

    - Orders assigned to each machine (through operations)

    - Parts with their status from scheduling schema

    - Operations with their status from scheduling schema

    """

    try:

        # Rollback any existing failed transaction to clear the state

        db.rollback()

        

        # Get all machines

        machines = db.query(Machine).options(

            joinedload(Machine.work_center)

        ).all()

        

        # Filter orders based on admin_id or manufacturing_coordinator_id

        order_query = db.query(Order).options(

            joinedload(Order.product),

            joinedload(Order.customer)

        )

        if admin_id is not None:

            order_query = order_query.filter(Order.admin_id == admin_id)

        if manufacturing_coordinator_id is not None:

            order_query = order_query.filter(Order.manufacturing_coordinator_id == manufacturing_coordinator_id)

        

        orders = order_query.all()

        

        # Get all operations for all machines (simplified approach)

        all_operations = db.query(Operation).all()

        

        # Build machine-operation mapping

        machine_operations = {}

        for op in all_operations:

            if op.machine_id and op.machine_id not in machine_operations:

                machine_operations[op.machine_id] = []

            if op.machine_id:

                machine_operations[op.machine_id].append(op)

        

        # Get all parts for the orders

        part_ids = []

        if orders:

            product_ids = [o.product_id for o in orders]

            parts = db.query(Part).filter(Part.product_id.in_(product_ids)).all()

            part_ids = [p.id for p in parts]

        

        # Fetch part status from scheduling schema (direct SQL)

        part_status_map = {}

        if part_ids:

            try:

                # Use string formatting for IN clause instead of parameter binding

                placeholders = ','.join([str(pid) for pid in part_ids])

                result = db.execute(

                    text(f"""

                        SELECT part_id, status, start_date, sale_order_id

                        FROM scheduling.part_schedule_status

                        WHERE part_id IN ({placeholders})

                    """)

                )

                for row in result:

                    part_status_map[row[0]] = {

                        "status": row[1] if row[1] else "Not Started",

                        "start_date": row[2],

                        "sale_order_id": row[3]

                    }

                db.commit()  # Commit successful query

            except Exception as e:

                print(f"Error fetching part schedule status: {e}")

                db.rollback()  # Rollback to clear failed transaction

                # Initialize with default values if table doesn't exist or query fails

                for pid in part_ids:

                    part_status_map[pid] = {

                        "status": "Not Started",

                        "start_date": None,

                        "sale_order_id": None

                    }

        

        # Fetch operation status from scheduling schema (direct SQL)

        operation_status_map = {}

        operation_ids = [op.id for op in all_operations]

        if operation_ids:

            try:

                placeholders = ','.join([str(oid) for oid in operation_ids])

                result = db.execute(

                    text(f"""

                        SELECT operation_id, status, started_at, completed_at, operator_id

                        FROM scheduling.operation_status

                        WHERE operation_id IN ({placeholders})

                    """)

                )

                for row in result:

                    operation_status_map[row[0]] = {

                        "status": row[1] if row[1] else "Pending",

                        "started_at": row[2],

                        "completed_at": row[3],

                        "operator_id": row[4]

                    }

                db.commit()  # Commit successful query

            except Exception as e:

                print(f"Error fetching operation status: {e}")

                db.rollback()  # Rollback to clear failed transaction

                # Initialize with default values if table doesn't exist or query fails

                for oid in operation_ids:

                    operation_status_map[oid] = {

                        "status": "Pending",

                        "started_at": None,

                        "completed_at": None,

                        "operator_id": None

                    }

        

        # Fetch machine status from scheduling schema (direct SQL)

        machine_status_map = {}

        machine_ids_db = [m.id for m in machines]

        if machine_ids_db:

            try:

                placeholders = ','.join([str(mid) for mid in machine_ids_db])

                result = db.execute(

                    text(f"""

                        SELECT machine_id, status_id, description, available_from, available_to

                        FROM scheduling.machine_status

                        WHERE machine_id IN ({placeholders})

                    """)

                )

                for row in result:

                    machine_status_map[row[0]] = {

                        "status_id": row[1],

                        "description": row[2],

                        "available_from": row[3],

                        "available_to": row[4]

                    }

                db.commit()  # Commit successful query

            except Exception as e:

                print(f"Error fetching machine status: {e}")

                db.rollback()  # Rollback to clear failed transaction

                # Initialize with default values if table doesn't exist or query fails

                for mid in machine_ids_db:

                    machine_status_map[mid] = {

                        "status_id": None,

                        "description": None,

                        "available_from": None,

                        "available_to": None

                    }



        # Fetch planned schedule items from scheduling schema (direct SQL)

        planned_schedule_map = {}

        if operation_ids:

            try:

                # First, get the actual column names from the table

                columns_result = db.execute(

                    text("""

                        SELECT column_name

                        FROM information_schema.columns

                        WHERE table_schema = 'scheduling'

                        AND table_name = 'planned_schedule_items'

                        ORDER BY ordinal_position

                    """)

                )

                columns = [row[0] for row in columns_result]



                # Build SELECT clause with only existing columns

                select_columns = []

                column_map = {}

                for col in ['id', 'operation_id', 'planned_start_time', 'planned_end_time',

                           'sale_order_id', 'part_number', 'operation_name', 'operation_number',

                           'machine_id', 'total_quantity']:

                    if col in columns:

                        select_columns.append(col)

                        column_map[col] = len(select_columns) - 1



                if select_columns:

                    placeholders = ','.join([str(oid) for oid in operation_ids])

                    query = f"""

                        SELECT {', '.join(select_columns)}

                        FROM scheduling.planned_schedule_items

                        WHERE operation_id IN ({placeholders})

                    """

                    result = db.execute(text(query))

                    rows = list(result)



                    for row in rows:

                        row_dict = {}

                        for col in select_columns:

                            row_dict[col] = row[column_map[col]]

                        # Use operation_id as key

                        op_id = row_dict.get('operation_id')

                        if op_id:

                            planned_schedule_map[op_id] = row_dict



                    db.commit()  # Commit successful query



            except Exception as e:

                db.rollback()  # Rollback to clear failed transaction

                # Initialize with empty map if table doesn't exist or query fails

        

        # Build hierarchical response

        shop_floor_data = []

        

        # Create order map for quick lookup

        order_map = {o.id: o for o in orders}

        

        # Create part map for quick lookup

        parts_for_orders = []

        if orders:

            product_ids = [o.product_id for o in orders]

            parts_for_orders = db.query(Part).filter(Part.product_id.in_(product_ids)).all()

        part_map = {p.id: p for p in parts_for_orders}

        

        for machine in machines:

            machine_ops = machine_operations.get(machine.id, [])

            

            # Get unique orders for this machine

            machine_order_ids = set()

            machine_parts = []

            

            for op in machine_ops:

                if op.part_id and op.part_id in part_map:

                    part = part_map[op.part_id]

                    

                    # Find which order this part belongs to

                    order_for_part = None

                    for order in orders:

                        if order.product_id == part.product_id:

                            order_for_part = order

                            break

                    

                    if order_for_part:

                        machine_order_ids.add(order_for_part.id)

                        

                        # Get part status

                        part_status = part_status_map.get(part.id, {

                            "status": "Not Started",

                            "start_date": None,

                            "sale_order_id": None

                        })

                        

                        # Get operation status

                        op_status = operation_status_map.get(op.id, {

                            "status": "Pending",

                            "started_at": None,

                            "completed_at": None,

                            "operator_id": None

                        })



                        # Get planned schedule data

                        planned_schedule = planned_schedule_map.get(op.id, {})



                        machine_parts.append({

                            "part_id": part.id,

                            "part_name": part.part_name,

                            "part_number": part.part_number,

                            "part_status": part_status,

                            "operation_id": op.id,

                            "operation_name": op.operation_name,

                            "operation_number": op.operation_number,

                            "operation_status": op_status,

                            "order_id": order_for_part.id,

                            "sale_order_number": order_for_part.sale_order_number,

                            "planned_schedule": planned_schedule

                        })

            

            # Get order details

            machine_orders = []

            for order_id in machine_order_ids:

                if order_id in order_map:

                    order = order_map[order_id]

                    machine_orders.append({

                        "order_id": order.id,

                        "sale_order_number": order.sale_order_number,

                        "quantity": order.quantity,

                        "status": order.status,

                        "due_date": order.due_date,

                        "product_name": order.product.product_name if order.product else None

                    })

            

            # Get machine status

            machine_status = machine_status_map.get(machine.id, {

                "status_id": None,

                "description": None,

                "available_from": None,

                "available_to": None

            })

            

            shop_floor_data.append({

                "machine_id": machine.id,

                "machine_type": machine.type,

                "machine_make": machine.make,

                "machine_model": machine.model,

                "work_center": machine.work_center.work_center_name if machine.work_center else None,

                "work_center_id": machine.work_center_id,

                "machine_status": machine_status,

                "orders": machine_orders,

                "parts_operations": machine_parts,

                "total_orders": len(machine_orders),

                "total_operations": len(machine_ops)

            })

        

        # Calculate overall statistics

        total_machines = len(machines)

        active_machines = len([m for m in shop_floor_data if m["machine_status"]["status_id"] in [1, 2]])  # Assuming status_id 1,2 are active

        idle_machines = total_machines - active_machines

        total_orders = len(orders)

        total_operations = len(all_operations)

        

        return {

            "summary": {

                "total_machines": total_machines,

                "active_machines": active_machines,

                "idle_machines": idle_machines,

                "total_orders": total_orders,

                "total_operations": total_operations

            },

            "machines": shop_floor_data

        }

    except Exception as e:

        print(f"Error in shop floor endpoint: {e}")

        import traceback

        traceback.print_exc()

        # Rollback to clear any failed transaction state

        db.rollback()

        raise HTTPException(status_code=500, detail=f"Error fetching shop floor data: {str(e)}")



# CRUD operations

def _order_to_response(order, db: Session):

    """Build order response dict with customer, product, and role user names."""

    # Check if ALL parts in the order have raw materials linked

    from DB.models.oms import Part, Operation

    # from DB.models.scheduling import ProductionLog removed as requested

    

    # Get all parts for this order's product

    all_parts = db.query(Part).filter(Part.product_id == order.product_id).all()

    total_parts = len(all_parts)

    

    if total_parts == 0:

        has_raw_materials = False

        calculated_status = "Pending"

    else:

        # Count parts that have raw materials linked (either general stock or order stock)

        parts_with_raw_materials = 0

        

        for part in all_parts:

            # Check if part has unit assigned (unit-based tracking)

            if part.raw_material_unit_id:

                parts_with_raw_materials += 1

            else:

                # Check if part has order-linked raw materials (part_id stored as comma-separated string)

                order_stock = db.query(RawMaterialStock).filter(

                    RawMaterialStock.source_order_id == order.id,

                    RawMaterialStock.source_type == "order",

                    RawMaterialStock.part_id.like(f'%{part.id}%')

                ).first()

                if order_stock:

                    parts_with_raw_materials += 1

        

        # Only set has_raw_materials = true if ALL parts have raw materials

        has_raw_materials = parts_with_raw_materials >= total_parts

        

        # Calculate order status based on part statuses (same logic as order_tracking.py)

        completed_parts_count = 0

        scheduled_parts_count = 0

        

        for part in all_parts:

            # Get operations for this part

            part_operations = db.query(Operation).filter(Operation.part_id == part.id).all()

            required_qty = part.qty or 0

            

            if not part_operations:

                continue

            

            # Get operation ids

            operation_ids = [op.id for op in part_operations]

            

            # Get production logs for these operations

            production_logs_summary = {}

            if operation_ids:

                # Get production logs using raw SQL

                logs_query = text("""

                    SELECT operation_id, SUM(approved_quantity) as total_approved,

                           BOOL_OR(operator_status = 'In Progress') as is_in_progress,

                           COUNT(*) as log_count

                    FROM scheduling.production_logs

                    WHERE operation_id IN :op_ids

                    GROUP BY operation_id

                """)

                logs_result = db.execute(logs_query, {"op_ids": tuple(operation_ids)}).fetchall()

                for row in logs_result:

                    production_logs_summary[row.operation_id] = {

                        "total_approved": row.total_approved or 0,

                        "is_in_progress": row.is_in_progress,

                        "has_logs": row.log_count > 0

                    }

            

            # Calculate part status based on operations

            completed_operations_count = 0

            scheduled_ops_count = 0

            

            for op in part_operations:

                summary = production_logs_summary.get(op.id, {

                    "total_approved": 0,

                    "is_in_progress": False,

                    "has_logs": False

                })

                

                # Determine operation status

                # 1. Completed if total_approved >= required_qty

                # 2. Scheduled if summary says so or has any logs

                

                if required_qty > 0 and summary["total_approved"] >= required_qty:

                    status = "Completed"

                elif summary["is_in_progress"] or summary["has_logs"]:

                    status = "Scheduled"

                else:

                    status = "Pending"

                

                if status == "Completed":

                    completed_operations_count += 1

                elif status == "Scheduled":

                    scheduled_ops_count += 1

            

            # Calculate part status

            total_ops = len(part_operations)

            if completed_operations_count == total_ops:

                completed_parts_count += 1

            elif scheduled_ops_count > 0 or completed_operations_count > 0:

                scheduled_parts_count += 1



        # Check if the order is planned in scheduling

        is_order_planned = db.execute(text("""

            SELECT EXISTS(

                SELECT 1 FROM scheduling.planned_schedule_items 

                WHERE sale_order_id = :order_id

            )

        """), {"order_id": order.id}).scalar()



        # Check if any production logs exist for this order's operations

        has_any_logs = False

        if total_parts > 0:

            # We already have production_logs_summary from the loop above

            # Let's check if any operation has logs

            has_any_logs = scheduled_parts_count > 0 or completed_parts_count > 0



        # Calculate order status (Pending, Scheduled, In Progress, Completed)

        # Priority: Completed > In Progress (if logs exist) > Scheduled (planned only) > Pending

        if total_parts > 0 and completed_parts_count == total_parts:

            calculated_status = "Completed"

        elif has_any_logs:

            # If any production logs exist, it's In Progress (even if it's also in the planned table)

            calculated_status = "In Progress"

        elif is_order_planned:

            # If it's in the planned table but has NO logs yet, it's Scheduled

            calculated_status = "Scheduled"

        else:

            calculated_status = "Pending"

    

    return {

        "id": order.id,

        "sale_order_number": order.sale_order_number,

        "project_name": order.project_name,

        "order_date": order.order_date,

        "customer_id": order.customer_id,

        "product_id": order.product_id,

        "user_id": order.user_id or 0,

        "user_role": order.user.role if order.user else None,

        "project_coordinator_id": order.project_coordinator_id,

        "admin_id": order.admin_id,

        "manufacturing_coordinator_id": order.manufacturing_coordinator_id,

        "quantity": order.quantity,

        "due_date": order.due_date,

        "status": calculated_status,

        "company_name": order.customer.company_name if order.customer else None,

        "product_name": order.product.product_name if order.product else None,

        "user_name": order.user.user_name if order.user else None,

        "user_role": order.user.role if order.user else None,

        "project_coordinator_name": order.project_coordinator.user_name if order.project_coordinator else None,

        "admin_name": order.admin.user_name if order.admin else None,

        "manufacturing_coordinator_name": order.manufacturing_coordinator.user_name if order.manufacturing_coordinator else None,

        "approval_status": order.approval_status,

        "approval_remarks": order.approval_remarks,

        "approved_at": order.approved_at,

        "has_raw_materials": has_raw_materials,

        "created_at": order.created_at,

        "updated_at": order.updated_at,

    }



@router.post("/", response_model=OrderResponse)

def create_order(order: OrderCreate, db: Session = Depends(get_db)):

    """

    Create a new order.

    Can be created by project_coordinator or admin.

    project_coordinator_id is optional (no PC when admin creates directly).

    admin_id is required. manufacturing_coordinator_id is set when admin assigns later.

    """

    # Trim and normalize case for the sale_order_number

    order.sale_order_number = order.sale_order_number.strip().upper() if order.sale_order_number else order.sale_order_number



    # Case-insensitive check if sale_order_number already exists

    existing_order = (

        db.query(Order)

        .filter(func.lower(Order.sale_order_number) == order.sale_order_number.lower())

        .first()

    )

    if existing_order:

        raise HTTPException(

            status_code=400,

            detail=f"Order with Project Number '{order.sale_order_number}' already exists."

        )



    # Check if customer exists

    customer = db.query(Customer).filter(Customer.id == order.customer_id).first()

    if not customer:

        raise HTTPException(status_code=404, detail="Customer not found")



    # Validate admin_id (required)

    admin_user = db.query(AccessUser).filter(AccessUser.id == order.admin_id).first()

    if not admin_user:

        raise HTTPException(status_code=404, detail="Admin user not found")

    if order.project_coordinator_id is not None:

        pc_user = db.query(AccessUser).filter(AccessUser.id == order.project_coordinator_id).first()

        if not pc_user:

            raise HTTPException(status_code=404, detail="Project coordinator user not found")

    if order.manufacturing_coordinator_id is not None:

        mc_user = db.query(AccessUser).filter(AccessUser.id == order.manufacturing_coordinator_id).first()

        if not mc_user:

            raise HTTPException(status_code=404, detail="Manufacturing coordinator user not found")

    if order.user_id is not None:

        creator = db.query(AccessUser).filter(AccessUser.id == order.user_id).first()

        if not creator:

            raise HTTPException(status_code=404, detail="Creator user not found")



    # Exclude legacy project_name field (column dropped, property is read-only)

    data = order.model_dump(exclude={"project_name"})

    db_order = Order(**data)

    # If order is created by admin, set approval_status to "Auto-Approved" instead of "Pending Approval"
    if order.user_id:
        creator = db.query(AccessUser).filter(AccessUser.id == order.user_id).first()
        if creator and 'admin' in creator.role.lower():
            db_order.approval_status = "Auto-Approved"
            db_order.approved_at = func.now()

    db.add(db_order)

    db.commit()

    db.refresh(db_order)



    notif = OrderNotificationModel(order_id=db_order.id)

    db.add(notif)

    db.commit()



    # Reload with relationships for response

    order_with_relations = (

        db.query(Order)

        .options(

            joinedload(Order.customer),

            joinedload(Order.product),

            joinedload(Order.user),

            joinedload(Order.project_coordinator),

            joinedload(Order.admin),

            joinedload(Order.manufacturing_coordinator),

        )

        .filter(Order.id == db_order.id)

        .first()

    )

    return _order_to_response(order_with_relations, db)



@router.get("/", response_model=List[OrderWithCustomerAndProduct])

def get_orders(

    user_id: int | None = None,

    admin_id: int | None = None,

    project_coordinator_id: int | None = None,

    manufacturing_coordinator_id: int | None = None,

    db: Session = Depends(get_db),

):

    """

    Get all orders with company_name, product_name, and role user names.

    Filter by user_id (creator), admin_id, project_coordinator_id, or manufacturing_coordinator_id

    for module-specific views (admin / project coordinator / manufacturing coordinator).

    """

    from sqlalchemy.orm import joinedload

    query = (

        db.query(Order)

        .options(

            joinedload(Order.customer),

            joinedload(Order.product),

            joinedload(Order.user),

            joinedload(Order.project_coordinator),

            joinedload(Order.admin),

            joinedload(Order.manufacturing_coordinator),

        )

        .order_by(Order.id.asc())

    )

    if user_id is not None:

        query = query.filter(Order.user_id == user_id)

    if admin_id is not None:

        query = query.filter(Order.admin_id == admin_id)

    if project_coordinator_id is not None:

        query = query.filter(Order.project_coordinator_id == project_coordinator_id)

    if manufacturing_coordinator_id is not None:

        query = query.filter(Order.manufacturing_coordinator_id == manufacturing_coordinator_id)

    orders = query.all()

    return [_order_to_response(order, db) for order in orders]



@router.get("/with-customers", response_model=List[OrderWithCustomer])

def get_orders_with_customers(

    user_id: int | None = None,

    admin_id: int | None = None,

    project_coordinator_id: int | None = None,

    manufacturing_coordinator_id: int | None = None,

    db: Session = Depends(get_db),

):

    """Get all orders with customer information. Filter by user_id, admin_id, project_coordinator_id, or manufacturing_coordinator_id."""

    from sqlalchemy.orm import joinedload

    query = (

        db.query(Order)

        .options(

            joinedload(Order.customer),

            joinedload(Order.user),

            joinedload(Order.project_coordinator),

            joinedload(Order.admin),

            joinedload(Order.manufacturing_coordinator),

        )

        .order_by(Order.id.asc())

    )

    if user_id is not None:

        query = query.filter(Order.user_id == user_id)

    if admin_id is not None:

        query = query.filter(Order.admin_id == admin_id)

    if project_coordinator_id is not None:

        query = query.filter(Order.project_coordinator_id == project_coordinator_id)

    if manufacturing_coordinator_id is not None:

        query = query.filter(Order.manufacturing_coordinator_id == manufacturing_coordinator_id)

    orders = query.all()

    result = []

    for order in orders:

        result.append({

            "id": order.id,

            "sale_order_number": order.sale_order_number,

            "project_name": order.project_name,

            "order_date": order.order_date,

            "customer_id": order.customer_id,

            "product_id": order.product_id,

            "user_id": order.user_id or 0,

            "project_coordinator_id": order.project_coordinator_id,

            "admin_id": order.admin_id,

            "manufacturing_coordinator_id": order.manufacturing_coordinator_id,

            "quantity": order.quantity,

            "due_date": order.due_date,

            "status": order.status,

            "user_name": order.user.user_name if order.user else None,

            "customer": {

                "id": order.customer.id,

                "company_name": order.customer.company_name,

                "address": order.customer.address,

                "branch": order.customer.branch,

                "email": order.customer.email,

                "contact_number": order.customer.contact_number,

                "contact_person": order.customer.contact_person,

            } if order.customer else None,

        })

    return result



@router.get("/{order_id}/hierarchical", response_model=OrderWithHierarchy)

def get_order_hierarchical_data(order_id: int, db: Session = Depends(get_db)):

    """Get order with full product hierarchy including tools"""

    from sqlalchemy.orm import joinedload

    order = (

        db.query(Order)

        .options(

            joinedload(Order.customer),

            joinedload(Order.product),

            joinedload(Order.user),

            joinedload(Order.project_coordinator),

            joinedload(Order.admin),

            joinedload(Order.manufacturing_coordinator),

        )

        .filter(Order.id == order_id)

        .first()

    )

    if not order:

        raise HTTPException(status_code=404, detail="Order not found")



    hierarchy = fetch_product_hierarchy(db, order.product_id)



    priorities = (

        db.query(OrderPartPriority)

        .join(Part, OrderPartPriority.part_id == Part.id)

        .join(PartType, Part.type_id == PartType.id)

        .filter(

            OrderPartPriority.order_id == order_id,

            func.lower(PartType.type_name) == "in-house",

        )

        .all()

    )

    priority_map = {p.part_id: p.priority for p in priorities}



    def inject_priority(part_details_list):

        for pd in part_details_list:

            if pd.part.id in priority_map:

                pd.part.priority = priority_map[pd.part.id]



    def inject_priority_recursive(assemblies):

        for asm in assemblies:

            inject_priority(asm.parts)

            inject_priority_recursive(asm.subassemblies)



    inject_priority(hierarchy.direct_parts)

    inject_priority_recursive(hierarchy.assemblies)



    out = _order_to_response(order, db)

    out["product_hierarchy"] = hierarchy

    return out





@router.get("/{order_id}", response_model=OrderWithCustomerAndProduct)

def get_order(order_id: int, db: Session = Depends(get_db)):

    """Get a specific order by ID with company_name, product_name, and role names"""

    from sqlalchemy.orm import joinedload

    order = (

        db.query(Order)

        .options(

            joinedload(Order.customer),

            joinedload(Order.product),

            joinedload(Order.user),

            joinedload(Order.project_coordinator),

            joinedload(Order.admin),

            joinedload(Order.manufacturing_coordinator),

        )

        .filter(Order.id == order_id)

        .first()

    )

    if not order:

        raise HTTPException(status_code=404, detail="Order not found")

    return _order_to_response(order, db)



@router.get("/customer/{customer_id}", response_model=List[OrderResponse])

def get_orders_by_customer(customer_id: int, db: Session = Depends(get_db)):

    """Get all orders for a specific customer"""

    orders = db.query(Order).filter(Order.customer_id == customer_id).order_by(Order.id.asc()).all()

    return orders



@router.get("/sale-order/{sale_order_number}/parts")

def get_parts_by_sale_order(sale_order_number: str, db: Session = Depends(get_db)):

    """Get parts for the product associated with a given sale_order_number"""

    order = db.query(Order).filter(Order.sale_order_number == sale_order_number).first()

    if not order:

        raise HTTPException(status_code=404, detail="Order not found")

    parts = (

        db.query(Part)

        .join(PartType, Part.type_id == PartType.id)

        .filter(

            Part.product_id == order.product_id,

            func.lower(PartType.type_name) == "in-house",

        )

        .order_by(Part.id.asc())

        .all()

    )

    return [

        {

            "id": p.id,

            "part_name": p.part_name,

            "part_number": p.part_number,

            "assembly_id": p.assembly_id,

            "product_id": p.product_id,

        }

        for p in parts

    ]



@router.get("/{order_id}/part-priorities", response_model=List[OrderPartPrioritySchema])

def get_order_part_priorities(order_id: int, db: Session = Depends(get_db)):

    """Get part priorities for an order"""

    priorities = (

        db.query(OrderPartPriority)

        .join(Part, OrderPartPriority.part_id == Part.id)

        .join(PartType, Part.type_id == PartType.id)

        .filter(

            OrderPartPriority.order_id == order_id,

            func.lower(PartType.type_name) == "in-house",

        )

        .order_by(OrderPartPriority.priority.asc())

        .all()

    )

    

    # Enrich with part details

    result = []

    for p in priorities:

        p_data = {

            "id": p.id,

            "order_id": p.order_id,

            "product_id": p.product_id,

            "part_id": p.part_id,

            "priority": p.priority,

            "part_name": p.part.part_name if p.part else None,

            "part_number": p.part.part_number if p.part else None,

            "part_type_name": p.part.type.type_name if p.part and p.part.type else None,

            "created_at": p.created_at,

            "updated_at": p.updated_at,

        }

        result.append(p_data)

    return result



@router.put("/{order_id}/part-priorities", response_model=List[OrderPartPrioritySchema])

def update_order_part_priorities(order_id: int, priorities: List[OrderPartPriorityUpdate], db: Session = Depends(get_db)):

    """Update part priorities for an order"""

    order = db.query(Order).filter(Order.id == order_id).first()

    if not order:

        raise HTTPException(status_code=404, detail="Order not found")



    for item in priorities:

        if item.part_id is not None and item.priority is not None:

            record = db.query(OrderPartPriority).filter(

                OrderPartPriority.order_id == order_id,

                OrderPartPriority.part_id == item.part_id

            ).first()

            

            if record:

                record.priority = item.priority

    

    db.commit()

    return get_order_part_priorities(order_id, db)



@router.get("/part-priorities/all", response_model=List[OrderPartPrioritySchema])

def get_all_part_priorities(

    admin_id: Optional[int] = Query(None, description="Filter part priorities by admin who owns the order"),

    manufacturing_coordinator_id: Optional[int] = Query(

        None, description="Filter part priorities by manufacturing coordinator who owns the order"

    ),

    db: Session = Depends(get_db),

):

    """Get all part priorities globally with details.



    - If admin_id is provided, filter by Order.admin_id.

    - If manufacturing_coordinator_id is provided, filter by Order.manufacturing_coordinator_id.

    - If both are omitted, return priorities for all orders.

    """

    query = (

        db.query(OrderPartPriority)

        .join(Part, OrderPartPriority.part_id == Part.id)

        .join(PartType, Part.type_id == PartType.id)

        .join(Order, OrderPartPriority.order_id == Order.id)

        .filter(func.lower(PartType.type_name) == "in-house")

    )

    if admin_id is not None:

        query = query.filter(Order.admin_id == admin_id)

    if manufacturing_coordinator_id is not None:

        query = query.filter(Order.manufacturing_coordinator_id == manufacturing_coordinator_id)



    priorities = query.order_by(OrderPartPriority.priority.asc()).all()



    result = []

    for p in priorities:

        p_data = {

            "id": p.id,

            "order_id": p.order_id,

            "product_id": p.product_id,

            "part_id": p.part_id,

            "priority": p.priority,

            "part_name": p.part.part_name if p.part else None,

            "part_number": p.part.part_number if p.part else None,

            "sale_order_number": p.order.sale_order_number if p.order else None,

            "project_name": None,

            "product_name": p.product.product_name if p.product else None,

            "part_type_name": p.part.type.type_name if p.part and p.part.type else None,

            "due_date": p.order.due_date if p.order else None,

            "created_at": p.created_at,

            "updated_at": p.updated_at,

        }

        result.append(p_data)

    return result



@router.put("/part-priorities/update-global")

def update_global_priority(update: OrderPartPriorityGlobalUpdate, db: Session = Depends(get_db)):

    """Update priority of a specific part globally, shifting others to maintain sequence"""

    # Fetch target record

    record = db.query(OrderPartPriority).filter(OrderPartPriority.id == update.id).with_for_update().first()

    if not record:

        raise HTTPException(status_code=404, detail="Priority record not found")

    

    old_priority = record.priority

    new_priority = update.priority

    

    if old_priority == new_priority:

        return {"message": "No change needed"}

    

    # Validation: Check if new_priority is within valid range (1 to Max Priority)

    from sqlalchemy import func

    max_priority = db.query(func.max(OrderPartPriority.priority)).scalar() or 0

    

    if new_priority < 1 or new_priority > max_priority:

        raise HTTPException(

            status_code=400, 

            detail=f"Invalid priority: {new_priority}. Must be between 1 and {max_priority}."

        )

    

    # Logic to shift priorities

    if new_priority > old_priority:

        # Moving down (increasing priority value)

        # Shift items in (old_priority + 1, new_priority) down by 1 (value - 1)

        db.query(OrderPartPriority).filter(

            OrderPartPriority.priority > old_priority,

            OrderPartPriority.priority <= new_priority

        ).update({OrderPartPriority.priority: OrderPartPriority.priority - 1}, synchronize_session=False)

    else:

        # Moving up (decreasing priority value)

        # Shift items in (new_priority, old_priority - 1) up by 1 (value + 1)

        db.query(OrderPartPriority).filter(

            OrderPartPriority.priority >= new_priority,

            OrderPartPriority.priority < old_priority

        ).update({OrderPartPriority.priority: OrderPartPriority.priority + 1}, synchronize_session=False)

        

    # Set the new priority for the target record

    record.priority = new_priority

    db.commit()

    

    return {"message": "Priority updated successfully"}



@router.put("/part-priorities/swap")

def swap_part_priorities(swap: OrderPartPrioritySwap, db: Session = Depends(get_db)):

    """Swap priorities between two part priority records"""

    record1 = db.query(OrderPartPriority).filter(OrderPartPriority.id == swap.id1).first()

    record2 = db.query(OrderPartPriority).filter(OrderPartPriority.id == swap.id2).first()

    

    if not record1 or not record2:

        raise HTTPException(status_code=404, detail="One or both priority records not found")

        

    # Swap priorities

    temp_priority = record1.priority

    record1.priority = record2.priority

    record2.priority = temp_priority

    

    db.commit()

    

    return {"message": "Priorities swapped successfully"}





@router.get("/part-priorities/order-wise", response_model=List[OrderWisePriority])

def get_order_wise_priorities(

    admin_id: Optional[int] = Query(None, description="Filter by admin_id owning the order"),

    manufacturing_coordinator_id: Optional[int] = Query(

        None, description="Filter by manufacturing_coordinator_id owning the order"

    ),

    db: Session = Depends(get_db),

):

    groups_query = (

        db.query(

            OrderPartPriority.order_id.label("order_id"),

            func.min(OrderPartPriority.priority).label("min_priority"),

            func.max(OrderPartPriority.priority).label("max_priority"),

            func.count(OrderPartPriority.id).label("part_count"),

        )

        .join(Part, OrderPartPriority.part_id == Part.id)

        .join(PartType, Part.type_id == PartType.id)

        .join(Order, OrderPartPriority.order_id == Order.id)

        .filter(func.lower(PartType.type_name) == "in-house")

    )

    if admin_id is not None:

        groups_query = groups_query.filter(Order.admin_id == admin_id)

    if manufacturing_coordinator_id is not None:

        groups_query = groups_query.filter(Order.manufacturing_coordinator_id == manufacturing_coordinator_id)



    groups_subquery = groups_query.group_by(OrderPartPriority.order_id).subquery()



    rows = (

        db.query(

            Order.id,

            Order.sale_order_number,

            literal(None).label("project_name"),

            Product.product_name,

            groups_subquery.c.min_priority,

            groups_subquery.c.max_priority,

            groups_subquery.c.part_count,

        )

        .join(groups_subquery, Order.id == groups_subquery.c.order_id)

        .join(Product, Product.id == Order.product_id)

        .order_by(groups_subquery.c.min_priority.asc())

        .all()

    )



    result = []

    for row in rows:

        result.append(

            {

                "order_id": row.id,

                "sale_order_number": row.sale_order_number,

                "project_name": row.project_name,

                "product_name": row.product_name,

                "min_priority": row.min_priority,

                "max_priority": row.max_priority,

                "part_count": row.part_count,

            }

        )

    return result





class OrderWisePriorityUpdate(BaseModel):

    order_ids: List[int]

    admin_id: Optional[int] = None

    manufacturing_coordinator_id: Optional[int] = None





@router.put("/part-priorities/order-wise/reorder")

def reorder_order_wise_priorities(update: OrderWisePriorityUpdate, db: Session = Depends(get_db)):

    order_ids = update.order_ids

    admin_id = update.admin_id

    manufacturing_coordinator_id = update.manufacturing_coordinator_id

    if not order_ids:

        return {"message": "No changes"}



    # Limit existing IDs to those belonging to this admin / manufacturing coordinator, if provided

    existing_query = db.query(OrderPartPriority.order_id).join(Order, OrderPartPriority.order_id == Order.id)

    if admin_id is not None:

        existing_query = existing_query.filter(Order.admin_id == admin_id)

    if manufacturing_coordinator_id is not None:

        existing_query = existing_query.filter(Order.manufacturing_coordinator_id == manufacturing_coordinator_id)

    existing_ids = {row[0] for row in existing_query.distinct().all()}



    if set(order_ids) != existing_ids:

        raise HTTPException(status_code=400, detail="Order list does not match existing priorities for this admin")



    records_query = db.query(OrderPartPriority).join(Order, OrderPartPriority.order_id == Order.id)

    if admin_id is not None:

        records_query = records_query.filter(Order.admin_id == admin_id)

    records = records_query.order_by(OrderPartPriority.priority.asc()).all()



    grouped = {}

    for record in records:

        if record.order_id not in grouped:

            grouped[record.order_id] = []

        grouped[record.order_id].append(record)



    new_priority = 1

    for order_id in order_ids:

        items = grouped.get(order_id, [])

        items.sort(key=lambda r: r.priority)

        for item in items:

            item.priority = new_priority

            new_priority += 1



    db.commit()

    return {"message": "Order-wise priorities updated successfully"}



@router.put("/{order_id}/assign", response_model=OrderWithCustomerAndProduct)

def assign_order_to_manufacturing(

    order_id: int, payload: OrderAssign, db: Session = Depends(get_db)

):

    """

    Assign the order to a manufacturing coordinator.

    Typically called by admin after order creation.

    """

    order = db.query(Order).filter(Order.id == order_id).first()

    if not order:

        raise HTTPException(status_code=404, detail="Order not found")

    mc_user = db.query(AccessUser).filter(AccessUser.id == payload.manufacturing_coordinator_id).first()

    if not mc_user:

        raise HTTPException(status_code=404, detail="Manufacturing coordinator user not found")

    order.manufacturing_coordinator_id = payload.manufacturing_coordinator_id

    db.commit()

    from sqlalchemy.orm import joinedload

    order = (

        db.query(Order)

        .options(

            joinedload(Order.customer),

            joinedload(Order.product),

            joinedload(Order.user),

            joinedload(Order.project_coordinator),

            joinedload(Order.admin),

            joinedload(Order.manufacturing_coordinator),

        )

        .filter(Order.id == order_id)

        .first()

    )

    return _order_to_response(order, db)





@router.put("/{order_id}", response_model=OrderWithCustomerAndProduct)

def update_order(order_id: int, order_update: OrderUpdate, db: Session = Depends(get_db)):

    """Update an order and return with company_name, product_name, and role names"""

    order = db.query(Order).filter(Order.id == order_id).first()

    if not order:

        raise HTTPException(status_code=404, detail="Order not found")



    # Trim and normalize the sale_order_number if it is being updated

    if order_update.sale_order_number is not None:

        order_update.sale_order_number = order_update.sale_order_number.strip().upper()



    # Case-insensitive check if new sale_order_number already exists for a different order

    if order_update.sale_order_number is not None and order_update.sale_order_number != order.sale_order_number:

        existing_order = (

            db.query(Order)

            .filter(

                func.lower(Order.sale_order_number) == order_update.sale_order_number.lower(),

                Order.id != order_id

            )

            .first()

        )

        if existing_order:

            raise HTTPException(

                status_code=400,

                detail=f"Order with Project Number '{order_update.sale_order_number}' already exists."

            )



    if order_update.customer_id is not None:

        customer = db.query(Customer).filter(Customer.id == order_update.customer_id).first()

        if not customer:

            raise HTTPException(status_code=404, detail="Customer not found")

    if order_update.product_id is not None:

        product = db.query(Product).filter(Product.id == order_update.product_id).first()

        if not product:

            raise HTTPException(status_code=404, detail="Product not found")

    if order_update.admin_id is not None:

        admin_user = db.query(AccessUser).filter(AccessUser.id == order_update.admin_id).first()

        if not admin_user:

            raise HTTPException(status_code=404, detail="Admin user not found")

    if order_update.project_coordinator_id is not None:

        pc_user = db.query(AccessUser).filter(AccessUser.id == order_update.project_coordinator_id).first()

        if not pc_user:

            raise HTTPException(status_code=404, detail="Project coordinator user not found")

    if order_update.manufacturing_coordinator_id is not None:

        mc_user = db.query(AccessUser).filter(AccessUser.id == order_update.manufacturing_coordinator_id).first()

        if not mc_user:

            raise HTTPException(status_code=404, detail="Manufacturing coordinator user not found")



    # Exclude legacy project_name field (column dropped, property is read-only)

    update_data = order_update.model_dump(exclude_unset=True, exclude={"project_name"})

    # Check if approval_status is being changed
    old_approval_status = order.approval_status
    new_approval_status = update_data.get("approval_status")
    approval_remarks = update_data.get("approval_remarks")

    for field, value in update_data.items():

        setattr(order, field, value)

    db.commit()

    # Log approval change and send notification to PC if status changed
    if new_approval_status and new_approval_status != old_approval_status:
        # Get admin user info from the order
        admin_user = db.query(AccessUser).filter(AccessUser.id == order.admin_id).first() if order.admin_id else None
        from services.notification_service import NotificationService
        NotificationService.log_order_approval_change(
            db=db,
            order_id=order_id,
            approval_status=new_approval_status,
            approval_remarks=approval_remarks,
            user_id=admin_user.id if admin_user else None,
            user_name=admin_user.user_name if admin_user else None,
            user_role=admin_user.role if admin_user else None
        )

    from sqlalchemy.orm import joinedload

    order = (

        db.query(Order)

        .options(

            joinedload(Order.customer),

            joinedload(Order.product),

            joinedload(Order.user),

            joinedload(Order.project_coordinator),

            joinedload(Order.admin),

            joinedload(Order.manufacturing_coordinator),

        )

        .filter(Order.id == order_id)

        .first()

    )

    return _order_to_response(order, db)



@router.delete("/{order_id}")

def delete_order(order_id: int, db: Session = Depends(get_db)):

    """

    Delete an order and all its references across all schemas.

    

    If the product linked to this order has no other orders, 

    the product and all its related data will also be deleted (cascade).

    """

    order = db.query(Order).filter(Order.id == order_id).first()

    if not order:

        raise HTTPException(status_code=404, detail="Order not found")

    

    # Check if any parts related to this order have active schedule status

    active_parts = db.execute(

        text("""

            SELECT p.id, p.part_name 

            FROM oms.parts p

            JOIN scheduling.part_schedule_status pss ON p.id = pss.part_id

            WHERE p.product_id = :product_id AND pss.status = 'active'

        """),

        {"product_id": order.product_id}

    ).fetchall()

    

    if active_parts:

        part_names = [row[1] for row in active_parts]

        raise HTTPException(

            status_code=400,

            detail=f"Sorry, this order cannot be deleted because the following parts are currently scheduled for production: {', '.join(part_names)}. To delete this order, please inactivate the schedule status of these parts first."

        )

    

    product_id = order.product_id

    sale_order_number = order.sale_order_number

    other_orders_count = 0



    # Try to get MinIO client; if not initialized, skip MinIO deletion but still clean DB.

    try:

        minio_client = get_minio_client()

    except RuntimeError as e:

        print(f"Warning: {e}. Skipping MinIO file deletions for order {order_id}.")

        minio_client = None



    # Main deletion transaction: remove all related data and the order itself.

    # This block should either fully succeed or fully roll back.

    try:

        # 1. Delete from scheduling.part_schedule_status (by sale_order_id)

        savepoint = db.begin_nested()

        try:

            db.execute(

                text("DELETE FROM scheduling.part_schedule_status WHERE sale_order_id = :order_id"),

                {"order_id": order_id}

            )

            savepoint.commit()

        except Exception as e:

            savepoint.rollback()

            print(f"Note: Could not delete from part_schedule_status: {e}")

        

        # 2. Delete from maintenance.component_issues (by production_order_id)

        savepoint = db.begin_nested()

        try:

            db.execute(

                text("DELETE FROM maintenance.component_issues WHERE production_order_id = :order_id"),

                {"order_id": order_id}

            )

            savepoint.commit()

        except Exception as e:

            savepoint.rollback()

            print(f"Note: Could not delete from component_issues: {e}")

        

        # 3. Delete order documents and their MinIO files

        order_docs = db.query(OrderDocument).filter(OrderDocument.order_id == order_id).all()

        for order_doc in order_docs:

            if minio_client:

                try:

                    object_name = order_doc.document_url.split(f"/{minio_client.bucket_name}/")[1]

                    minio_client.delete_file(object_name)

                except Exception as e:

                    print(f"Error deleting order document from MinIO: {e}")

            db.delete(order_doc)



        # 4. Delete order part priorities

        db.query(OrderPartPriority).filter(OrderPartPriority.order_id == order_id).delete()



        # 5. Delete from inventory.tool_issues (via inventory_requests)

        db.execute(

            text("DELETE FROM inventory.tool_issues WHERE request_id IN (SELECT id FROM inventory.inventory_requests WHERE project_id = :order_id)"),

            {"order_id": order_id}

        )



        # 6. Delete from inventory.inventory_return_requests (via inventory_requests)

        db.execute(

            text("DELETE FROM inventory.inventory_return_requests WHERE requested_id IN (SELECT id FROM inventory.inventory_requests WHERE project_id = :order_id)"),

            {"order_id": order_id}

        )



        # 7. Delete from inventory.inventory_requests (by project_id)

        db.execute(

            text("DELETE FROM inventory.inventory_requests WHERE project_id = :order_id"),

            {"order_id": order_id}

        )



        # 8. Delete from oms.out_source_parts_status

        db.execute(

            text("DELETE FROM oms.out_source_parts_status WHERE order_id = :order_id"),

            {"order_id": order_id}

        )



        # 9. Delete from scheduling.order_schedule_status

        db.execute(

            text("DELETE FROM scheduling.order_schedule_status WHERE order_id = :order_id"),

            {"order_id": order_id}

        )



        # 10. Delete from notifications.order_notifications

        db.execute(

            text("DELETE FROM notifications.order_notifications WHERE order_id = :order_id"),

            {"order_id": order_id}

        )



        # 11. Delete from notifications.pc_notifications (via activity_log)

        db.execute(

            text("DELETE FROM notifications.pc_notifications WHERE activity_log_id IN (SELECT id FROM notifications.activity_log WHERE order_id = :order_id)"),

            {"order_id": order_id}

        )



        # 12. Delete from notifications.activity_log

        db.execute(

            text("DELETE FROM notifications.activity_log WHERE order_id = :order_id"),

            {"order_id": order_id}

        )



       



        # 12. Delete from oms.order_parts_raw_material_linked

        savepoint = db.begin_nested()

        try:

            db.execute(

                text("DELETE FROM oms.order_parts_raw_material_linked WHERE order_id = :order_id"),

                {"order_id": order_id}

            )

            savepoint.commit()

        except Exception as e:

            savepoint.rollback()

            print(f"Note: Could not delete from order_parts_raw_material_linked: {e}")



        # 13. Delete from maintenance.help_support (by production_order_id)

        savepoint = db.begin_nested()

        try:

            db.execute(

                text("DELETE FROM maintenance.help_support WHERE production_order_id = :order_id"),

                {"order_id": order_id}

            )

            savepoint.commit()

        except Exception as e:

            savepoint.rollback()

            print(f"Note: Could not delete from help_support: {e}")



        # 14. Delete from notifications.inspection_notifications (by order_id)

        savepoint = db.begin_nested()

        try:

            db.execute(

                text("DELETE FROM notifications.inspection_notifications WHERE order_id = :order_id"),

                {"order_id": order_id}

            )

            savepoint.commit()

        except Exception as e:

            savepoint.rollback()

            print(f"Note: Could not delete from inspection_notifications: {e}")



        # 15. Delete from production_monitoring.machine_live_history (by current_order_id)

        savepoint = db.begin_nested()

        try:

            db.execute(

                text("DELETE FROM production_monitoring.machine_live_history WHERE current_order_id = :order_id"),

                {"order_id": order_id}

            )

            savepoint.commit()

        except Exception as e:

            savepoint.rollback()

            print(f"Note: Could not delete from machine_live_history: {e}")



        # 16. Delete from production_monitoring.machine_live_status (by current_order_id)

        savepoint = db.begin_nested()

        try:

            db.execute(

                text("DELETE FROM production_monitoring.machine_live_status WHERE current_order_id = :order_id"),

                {"order_id": order_id}

            )

            savepoint.commit()

        except Exception as e:

            savepoint.rollback()

            print(f"Note: Could not delete from machine_live_status: {e}")



        # 17. Delete from quality.ftp_status (by order_id)

        savepoint = db.begin_nested()

        try:

            db.execute(

                text("DELETE FROM quality.ftp_status WHERE order_id = :order_id"),

                {"order_id": order_id}

            )

            savepoint.commit()

        except Exception as e:

            savepoint.rollback()

            print(f"Note: Could not delete from ftp_status: {e}")



        # 18. Delete from quality.inspection_plan_status (by sales_order_id)

        savepoint = db.begin_nested()

        try:

            db.execute(

                text("DELETE FROM quality.inspection_plan_status WHERE sales_order_id = :order_id"),

                {"order_id": order_id}

            )

            savepoint.commit()

        except Exception as e:

            savepoint.rollback()

            print(f"Note: Could not delete from inspection_plan_status: {e}")



        # 19. Delete from quality.master_boc (by sales_order_id)

        savepoint = db.begin_nested()

        try:

            db.execute(

                text("DELETE FROM quality.master_boc WHERE sales_order_id = :order_id"),

                {"order_id": order_id}

            )

            savepoint.commit()

        except Exception as e:

            savepoint.rollback()

            print(f"Note: Could not delete from master_boc: {e}")



        # 20. Delete from quality.stage_inspection (by sale_order_id)

        savepoint = db.begin_nested()

        try:

            db.execute(

                text("DELETE FROM quality.stage_inspection WHERE sale_order_id = :order_id"),

                {"order_id": order_id}

            )

            savepoint.commit()

        except Exception as e:

            savepoint.rollback()

            print(f"Note: Could not delete from stage_inspection: {e}")



        # 21. Delete from scheduling.machine_schedule (by order_id)

        savepoint = db.begin_nested()

        try:

            db.execute(

                text("DELETE FROM scheduling.machine_schedule WHERE order_id = :order_id"),

                {"order_id": order_id}

            )

            savepoint.commit()

        except Exception as e:

            savepoint.rollback()

            print(f"Note: Could not delete from machine_schedule: {e}")



        # 22. Delete from scheduling.operation_status (by order_id)

        savepoint = db.begin_nested()

        try:

            db.execute(

                text("DELETE FROM scheduling.operation_status WHERE order_id = :order_id"),

                {"order_id": order_id}

            )

            savepoint.commit()

        except Exception as e:

            savepoint.rollback()

            print(f"Note: Could not delete from operation_status: {e}")



        # 23. Delete from scheduling.planned_schedule_items (by sale_order_id)

        savepoint = db.begin_nested()

        try:

            db.execute(

                text("DELETE FROM scheduling.planned_schedule_items WHERE sale_order_id = :order_id"),

                {"order_id": order_id}

            )

            savepoint.commit()

        except Exception as e:

            savepoint.rollback()

            print(f"Note: Could not delete from planned_schedule_items: {e}")



        # 24. Delete from scheduling.rescheduling_items (by order_id only)

        savepoint = db.begin_nested()

        try:

            db.execute(

                text("DELETE FROM scheduling.rescheduling_items WHERE order_id = :order_id"),

                {"order_id": order_id}

            )

            savepoint.commit()

        except Exception as e:

            savepoint.rollback()

            print(f"Note: Could not delete from rescheduling_items: {e}")



        # 26. Delete from inventory.raw_material_stock (by source_order_id)

        # Note: This will also cascade to units and usage records

        savepoint = db.begin_nested()

        try:

            db.execute(

                text("DELETE FROM inventory.raw_material_stock WHERE source_order_id = :order_id AND source_type = 'order'"),

                {"order_id": order_id}

            )

            savepoint.commit()

        except Exception as e:

            savepoint.rollback()

            print(f"Note: Could not delete from raw_material_stock: {e}")



        db.flush()



        # Check if product has other orders

        other_orders_count = (

            db.query(Order)

            .filter(Order.product_id == product_id, Order.id != order_id)

            .count()

        )



        # Delete the order

        db.delete(order)

        db.flush()



        # Only delete the product if there are no other orders referencing it

        if other_orders_count == 0:

            delete_product_cascade(db, product_id)



        db.commit()



    except Exception as e:

        db.rollback()

        raise HTTPException(

            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,

            detail=f"Error deleting order: {str(e)}"

        )



    # Best-effort resequencing of remaining priorities

    try:

        remaining_priorities = (

            db.query(OrderPartPriority)

            .order_by(OrderPartPriority.priority.asc())

            .all()

        )

        for index, record in enumerate(remaining_priorities):

            record.priority = index + 1

        db.commit()

    except Exception as e:

        db.rollback()

        print(f"Warning: could not resequence order priorities after deleting order {order_id}: {e}")



    return {

        "message": "Order deleted successfully",

        "product_also_deleted": other_orders_count == 0,

    }


@router.put("/{order_id}/approve", response_model=OrderResponse)
def approve_order(order_id: int, approval: OrderApproval, db: Session = Depends(get_db)):
    """
    Approve or reject an order.
    Valid approval_status values: "Approved", "Rejected"
    """
    # Validate approval status
    valid_statuses = ["Approved", "Rejected"]
    if approval.approval_status not in valid_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid approval_status. Must be one of: {', '.join(valid_statuses)}"
        )

    # Get the order
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    # Update approval fields
    order.approval_status = approval.approval_status
    order.approval_remarks = approval.approval_remarks
    order.approved_at = func.now()

    db.commit()
    db.refresh(order)

    # Log approval change and send notification to PC
    # Get admin user info from the order
    admin_user = db.query(AccessUser).filter(AccessUser.id == order.admin_id).first() if order.admin_id else None
    from services.notification_service import NotificationService
    NotificationService.log_order_approval_change(
        db=db,
        order_id=order_id,
        approval_status=approval.approval_status,
        approval_remarks=approval.approval_remarks,
        user_id=admin_user.id if admin_user else None,
        user_name=admin_user.user_name if admin_user else None,
        user_role=admin_user.role if admin_user else None
    )

    # Reload with relationships for response
    order_with_relations = (
        db.query(Order)
        .options(
            joinedload(Order.customer),
            joinedload(Order.product),
            joinedload(Order.user),
            joinedload(Order.project_coordinator),
            joinedload(Order.admin),
            joinedload(Order.manufacturing_coordinator),
        )
        .filter(Order.id == order_id)
        .first()
    )

    return _order_to_response(order_with_relations, db)


# @router.get("/sale-order/{sale_order_number}/parts", response_model=List[PartResponse])

# def get_order_parts(sale_order_number: str, db: Session = Depends(get_db)):

#     """

#     Get all parts associated with a specific sale order.

#     1. Finds the order by sale_order_number.

#     2. Identifies the product associated with the order.

#     3. Returns all parts linked to that product.

#     """

#     # 1. Find the order

#     order = db.query(Order).filter(Order.sale_order_number == sale_order_number).first()

#     if not order:

#         raise HTTPException(

#             status_code=404, 

#             detail=f"Order with sale_order_number {sale_order_number} not found"

#         )

    

#     # 2. Get the product_id

#     product_id = order.product_id

    

#     # 3. Find all parts for this product

#     parts = db.query(Part).filter(Part.product_id == product_id).all()

    

#     return parts

