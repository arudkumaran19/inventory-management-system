from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.cart import Cart
from app.models.order import Order, OrderStatus
from app.models.order_item import OrderItem
from app.models.reservation import Reservation, ReservationStatus
from app.repositories.inventory import InventoryRepository
from app.repositories.order import OrderRepository
from app.services.audit import AuditService


RESERVATION_MINUTES = 5


class CheckoutService:
    def __init__(self, db: Session):
        self.db = db
        self.inventory = InventoryRepository(db)
        self.orders = OrderRepository(db)

    def checkout(self, cart_id: int, user_id: int | None = None) -> Order:
        # Lock the cart so two checkout requests cannot
        # simultaneously create an order for the same cart.
        cart = self.db.scalars(
            select(Cart)
            .where(Cart.id == cart_id)
            .with_for_update()
            .options(selectinload(Cart.items))
        ).first()

        if cart is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Cart not found",
            )

        if cart.status != "Active":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Cart is not active",
            )

        if not cart.items:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot checkout an empty cart",
            )

        # Database-level unique constraint on orders.cart_id
        # is the final protection against duplicate orders.
        existing_order = self.orders.get_by_cart_id(cart_id)

        if existing_order is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Order already exists for this cart",
            )

        # Always lock products in deterministic ID order.
        # This reduces deadlock risk when multiple checkouts
        # contain overlapping products.
        cart_items = sorted(
            cart.items,
            key=lambda item: item.product_id,
        )

        locked_products = []

        for cart_item in cart_items:
            product = self.inventory.get_product_for_update(
                cart_item.product_id,
            )

            if product is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=(
                        f"Product {cart_item.product_id} not found"
                    ),
                )

            if not product.is_active:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Product {product.name} is no longer active"
                    ),
                )

            if product.available_stock < cart_item.quantity:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        f"Insufficient stock for product "
                        f"{product.id}"
                    ),
                )

            locked_products.append(
                (cart_item, product),
            )

        # Create the order while all required product rows
        # remain locked inside the same transaction.
        now = datetime.now(timezone.utc)
        order = self.orders.create(cart_id=cart.id)
        order.created_at = now
        order.table_or_customer = cart.label
        order.discount_percent = cart.discount_percent
        order.discount_reason = cart.discount_reason
        if user_id is not None:
            order.user_id = user_id

        total_amount = Decimal("0.00")
        for cart_item, product in locked_products:
            self.orders.add_item(
                order_id=order.id,
                product_id=product.id,
                product_name=product.name,
                quantity=cart_item.quantity,
                unit_price=product.price,
                notes=cart_item.notes,
            )

            total_amount += product.price * cart_item.quantity

            self.inventory.decrease_stock(
                product,
                cart_item.quantity,
            )

        if cart.discount_percent and cart.discount_percent > 0:
            order.discount_amount = (total_amount * cart.discount_percent / Decimal("100")).quantize(Decimal("0.01"))
        else:
            order.discount_amount = Decimal("0.00")

        expires_at = now + timedelta(
            minutes=RESERVATION_MINUTES,
        )

        reservation = Reservation(
            order_id=order.id,
            created_at=now,
            expires_at=expires_at,
            status=ReservationStatus.ACTIVE.value,
        )

        self.db.add(reservation)

        order.status = OrderStatus.RESERVED.value

        # Cart is no longer modifiable after checkout.
        cart.status = "CheckedOut"

        AuditService.log_event(
            db=self.db,
            event_type="ORDER_CHECKOUT_RESERVED",
            resource_type="order",
            resource_id=order.id,
            actor=order.user,
            action="CREATE",
            payload={
                "order_id": order.id,
                "cart_id": cart.id,
                "total_amount": str(total_amount),
                "discount_amount": str(order.discount_amount),
                "expires_at": expires_at.isoformat(),
            },
        )

        self.db.commit()

        return self.orders.get_by_id(order.id)