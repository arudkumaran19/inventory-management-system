from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.order import OrderStatus
from app.models.user import User, UserRole
from app.schemas.order import OrderResponse
from app.services.order import OrderService


router = APIRouter(
    prefix="/orders",
    tags=["Orders"],
)


@router.get(
    "",
    response_model=list[OrderResponse],
)
def get_orders(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = OrderService(db)
    return service.get_orders()


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