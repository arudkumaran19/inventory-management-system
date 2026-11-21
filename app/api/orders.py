import csv
import io
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_role
from app.db.session import get_db
from app.models.order import OrderStatus
from app.models.payment import PaymentStatus
from app.models.user import User, UserRole
from app.schemas.order import OrderResponse
from app.services.order import OrderService


router = APIRouter(
    prefix="/orders",
    tags=["Orders"],
)


@router.get(
    "/analytics/summary",
)
def get_order_analytics(
    user_id: int | None = Query(None, description="Filter summary by employee ID"),
    current_user: User = Depends(require_role(UserRole.MANAGER)),
    db: Session = Depends(get_db),
):
    service = OrderService(db)

    if user_id is not None:
        employee = db.get(User, user_id)
        if employee is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Employee with ID {user_id} not found.",
            )

    orders = service.get_orders(user_id=user_id)

    gross_sales = Decimal("0.00")
    net_sales = Decimal("0.00")
    total_refunds = Decimal("0.00")
    paid_count = 0
    cancelled_count = 0
    product_stats: dict[str, dict] = {}

    for order in orders:
        subtotal = sum(Decimal(str(item.unit_price)) * item.quantity for item in order.items)
        discount = Decimal(str(order.discount_amount or "0.00"))
        order_total = max(Decimal("0.00"), subtotal - discount)

        if order.status == OrderStatus.PAID.value:
            gross_sales += subtotal
            net_sales += order_total
            paid_count += 1

            for item in order.items:
                name = item.product_name
                if name not in product_stats:
                    product_stats[name] = {"name": name, "quantity": 0, "revenue": Decimal("0.00")}
                product_stats[name]["quantity"] += item.quantity
                product_stats[name]["revenue"] += Decimal(str(item.unit_price)) * item.quantity

        elif order.status == OrderStatus.CANCELLED.value:
            cancelled_count += 1
            if order.payment and order.payment.status == PaymentStatus.REFUNDED.value:
                total_refunds += order_total

    avg_order_value = (net_sales / Decimal(paid_count)) if paid_count > 0 else Decimal("0.00")
    tax_included = (net_sales * Decimal("0.10") / Decimal("1.10")).quantize(Decimal("0.01"))

    top_products = sorted(
        [
            {
                "name": v["name"],
                "quantity": v["quantity"],
                "revenue": float(v["revenue"]),
            }
            for v in product_stats.values()
        ],
        key=lambda x: x["quantity"],
        reverse=True,
    )[:5]

    return {
        "gross_sales": float(gross_sales),
        "net_sales": float(net_sales),
        "tax_included": float(tax_included),
        "total_refunds": float(total_refunds),
        "paid_orders_count": paid_count,
        "cancelled_orders_count": cancelled_count,
        "avg_order_value": float(avg_order_value.quantize(Decimal("0.01"))),
        "top_products": top_products,
    }


@router.get(
    "/export/csv",
)
def export_orders_csv(
    user_id: int | None = Query(None, description="Filter export by employee ID"),
    status_filter: str | None = Query(None, alias="status", description="Filter export by status"),
    current_user: User = Depends(require_role(UserRole.MANAGER)),
    db: Session = Depends(get_db),
):
    service = OrderService(db)

    if user_id is not None:
        employee = db.get(User, user_id)
        if employee is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Employee with ID {user_id} not found.",
            )

    orders = service.get_orders(user_id=user_id, status=status_filter)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Order ID",
        "Date",
        "Status",
        "Operator",
        "Table/Customer",
        "Item Count",
        "Subtotal ($)",
        "Discount ($)",
        "Total ($)",
        "Payment Method",
        "Reference ID",
    ])

    for o in orders:
        subtotal = sum(Decimal(str(item.unit_price)) * item.quantity for item in o.items)
        discount = Decimal(str(o.discount_amount or "0.00"))
        total = max(Decimal("0.00"), subtotal - discount)
        operator_name = o.user.display_name if o.user else "POS"
        method = o.payment.method if o.payment else "N/A"
        ref_id = (o.payment.reference_id or "") if o.payment else ""
        date_str = o.created_at.strftime("%Y-%m-%d %H:%M:%S")

        writer.writerow([
            o.id,
            date_str,
            o.status,
            operator_name,
            o.table_or_customer or "",
            sum(item.quantity for item in o.items),
            f"{subtotal:.2f}",
            f"{discount:.2f}",
            f"{total:.2f}",
            method,
            ref_id,
        ])

    csv_data = output.getvalue()
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={
            "Content-Disposition": "attachment; filename=artisan_cafe_orders.csv",
        },
    )


@router.get(
    "",
    response_model=list[OrderResponse],
)
def get_orders(
    user_id: int | None = Query(None, description="Filter by employee/user ID"),
    status_filter: str | None = Query(None, alias="status", description="Filter by order status"),
    search: str | None = Query(None, description="Search term for order ID or product"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = OrderService(db)

    # Enforce role-based access control:
    # Managers can view all employees or filter by a specific employee.
    # Cashiers can only view their own sales. If a cashier tries to query another employee's sales, raise 403 Forbidden.
    if current_user.role == UserRole.CASHIER.value:
        if user_id is not None and user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cashiers cannot view sales data for other employees.",
            )
        effective_user_id = current_user.id
    else:
        if user_id is not None:
            employee = db.get(User, user_id)
            if employee is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Employee with ID {user_id} not found.",
                )
            effective_user_id = user_id
        else:
            effective_user_id = None

    orders = service.get_orders(user_id=effective_user_id, status=status_filter)

    if search and search.strip():
        q = search.strip().lower()
        orders = [
            o for o in orders
            if q in str(o.id) or any(q in item.product_name.lower() for item in o.items)
        ]

    return orders


@router.get(
    "/{order_id}",
    response_model=OrderResponse,
)
def get_order(
    order_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = OrderService(db)
    return service.get_order(order_id)


@router.post(
    "/{order_id}/cancel",
    response_model=OrderResponse,
)
def cancel_order(
    order_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = OrderService(db)
    order = service.get_order(order_id)

    # Authorization enforcement:
    # 1. Managers have authority to cancel any order (Reserved or Paid).
    # 2. Refunding a Paid order requires Manager authorization.
    # 3. Cashiers may only cancel active reservations that they handled.
    if current_user.role != UserRole.MANAGER.value:
        if order.status == OrderStatus.PAID.value:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Manager permission required to cancel and refund a completed sale.",
            )
        if order.user_id is not None and order.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cashiers may only cancel orders that they initiated.",
            )

    return service.cancel_order(order_id)