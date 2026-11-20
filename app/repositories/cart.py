from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.cart import Cart
from app.models.cart_item import CartItem


class CartRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, cart_id: int) -> Cart | None:
        statement = (
            select(Cart)
            .where(Cart.id == cart_id)
            .options(
                selectinload(Cart.items),
            )
        )

        return self.db.scalars(statement).first()

    def create(self, label: str | None = None) -> Cart:
        cart = Cart(label=label)

        self.db.add(cart)
        self.db.flush()

        return cart

    def get_parked(self) -> list[Cart]:
        statement = (
            select(Cart)
            .where(Cart.status == "Parked")
            .order_by(Cart.id.desc())
            .options(
                selectinload(Cart.items),
            )
        )
        return list(self.db.scalars(statement).all())

    def get_item(
            self,
            cart_id: int,
            product_id: int,
    ) -> CartItem | None:
        statement = select(CartItem).where(
            CartItem.cart_id == cart_id,
            CartItem.product_id == product_id,
            )

        return self.db.scalars(statement).first()

    def add_item(
            self,
            cart_id: int,
            product_id: int,
            quantity: int,
            notes: str | None = None,
    ) -> CartItem:
        item = CartItem(
            cart_id=cart_id,
            product_id=product_id,
            quantity=quantity,
            notes=notes,
        )

        self.db.add(item)
        self.db.flush()

        return item

    def delete_item(self, item: CartItem) -> None:
        self.db.delete(item)
        self.db.flush()