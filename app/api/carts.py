from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.cart import (
    CartCreate,
    CartDiscountRequest,
    CartItemCreate,
    CartItemUpdate,
    CartParkRequest,
    CartResponse,
)
from app.schemas.order import CheckoutResponse
from app.services.cart import CartService
from app.services.checkout import CheckoutService


router = APIRouter(
    prefix="/carts",
    tags=["Carts"],
)


@router.post(
    "",
    response_model=CartResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_cart(
    data: CartCreate | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = CartService(db)
    label = data.label if data else None
    return service.create_cart(label=label)


@router.get(
    "/parked",
    response_model=list[CartResponse],
)
def get_parked_carts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = CartService(db)
    return service.get_parked_carts()


@router.post(
    "/{cart_id}/park",
    response_model=CartResponse,
)
def park_cart(
    cart_id: int,
    data: CartParkRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = CartService(db)
    return service.park_cart(cart_id, data.label)


@router.post(
    "/{cart_id}/resume",
    response_model=CartResponse,
)
def resume_cart(
    cart_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = CartService(db)
    return service.resume_cart(cart_id)


@router.post(
    "/{cart_id}/discount",
    response_model=CartResponse,
)
def apply_cart_discount(
    cart_id: int,
    data: CartDiscountRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = CartService(db)
    return service.apply_discount(cart_id, data.discount_percent, data.discount_reason)


@router.post(
    "/{cart_id}/checkout",
    response_model=CheckoutResponse,
)
def checkout(
    cart_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = CheckoutService(db)
    order = service.checkout(
        cart_id=cart_id,
        user_id=current_user.id if current_user else None,
    )

    return CheckoutResponse(
        order=order,
        reservation_expires_at=order.reservation.expires_at,
    )


@router.get(
    "/{cart_id}",
    response_model=CartResponse,
)
def get_cart(
    cart_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = CartService(db)
    return service.get_cart(cart_id)


@router.post(
    "/{cart_id}/items",
    response_model=CartResponse,
)
def add_cart_item(
    cart_id: int,
    data: CartItemCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = CartService(db)

    return service.add_item(
        cart_id=cart_id,
        data=data,
    )


@router.patch(
    "/{cart_id}/items/{product_id}",
    response_model=CartResponse,
)
def update_cart_item_quantity(
    cart_id: int,
    product_id: int,
    data: CartItemUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = CartService(db)

    return service.update_item_quantity(
        cart_id=cart_id,
        product_id=product_id,
        quantity=data.quantity,
    )


@router.delete(
    "/{cart_id}/items/{product_id}",
    response_model=CartResponse,
)
def remove_cart_item(
    cart_id: int,
    product_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = CartService(db)

    return service.remove_item(
        cart_id=cart_id,
        product_id=product_id,
    )