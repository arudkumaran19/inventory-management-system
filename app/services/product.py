import re
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.inventory_log import InventoryLog
from app.models.product import Product
from app.models.user import User
from app.repositories.product import ProductRepository
from app.schemas.product import ProductCreate, ProductUpdate
from app.services.audit import AuditService


class ProductService:
    def __init__(self, db: Session):
        self.repository = ProductRepository(db)
        self.db = db

    def create_product(self, data: ProductCreate, user_id: int | None = None):
        cleaned_name = data.name.strip()
        cleaned_barcode = data.barcode.strip() if data.barcode else None

        if cleaned_barcode:
            existing_barcode = self.db.scalars(
                select(Product).where(Product.barcode == cleaned_barcode)
            ).first()
            if existing_barcode:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Barcode '{cleaned_barcode}' is already assigned to product '{existing_barcode.name}'.",
                )

        product = self.repository.create(
            name=cleaned_name,
            price=data.price,
            available_stock=data.available_stock,
            category=data.category,
            barcode=cleaned_barcode,
        )

        if data.available_stock > 0:
            log = InventoryLog(
                product_id=product.id,
                user_id=user_id,
                previous_stock=0,
                new_stock=data.available_stock,
                change_amount=data.available_stock,
                reason="Initial product creation",
            )
            self.db.add(log)

        actor = self.db.get(User, user_id) if user_id else None
        AuditService.log_event(
            db=self.db,
            event_type="PRODUCT_CREATED",
            resource_type="product",
            resource_id=product.id,
            actor=actor,
            action="CREATE",
            payload={"name": product.name, "price": str(product.price), "stock": product.available_stock},
        )

        self.db.commit()
        self.db.refresh(product)

        return product

    def get_product(self, product_id: int):
        product = self.repository.get_by_id(product_id)

        if product is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Product not found",
            )

        return product

    def get_product_by_barcode(self, barcode: str) -> Product:
        cleaned = barcode.strip()
        if not cleaned:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Barcode cannot be blank.",
            )
        product = self.repository.get_by_barcode(cleaned)
        if product is None:
            # Also try stripped spaces if it was scanned or searched with spaces
            no_spaces = re.sub(r"\s+", "", cleaned)
            if no_spaces != cleaned:
                product = self.repository.get_by_barcode(no_spaces)

        if product is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Product with barcode '{cleaned}' not found.",
            )
        return product

    def get_products(self):
        return self.repository.get_all()

    def update_product(
            self,
            product_id: int,
            data: ProductUpdate,
            user_id: int | None = None,
    ):
        product = self.get_product(product_id)

        update_data = data.model_dump(exclude_unset=True)

        if "name" in update_data and update_data["name"] is not None:
            update_data["name"] = update_data["name"].strip()

        if "barcode" in update_data:
            raw_barcode = update_data["barcode"]
            cleaned_barcode = raw_barcode.strip() if raw_barcode else None
            if cleaned_barcode:
                existing_barcode = self.db.scalars(
                    select(Product).where(
                        Product.barcode == cleaned_barcode,
                        Product.id != product_id,
                    )
                ).first()
                if existing_barcode:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail=f"Barcode '{cleaned_barcode}' is already assigned to product '{existing_barcode.name}'.",
                    )
            update_data["barcode"] = cleaned_barcode

        adjustment_reason = update_data.pop("adjustment_reason", None)

        if "available_stock" in update_data and update_data["available_stock"] is not None:
            new_stock = update_data["available_stock"]
            prev_stock = product.available_stock
            if new_stock != prev_stock:
                change = new_stock - prev_stock
                reason = adjustment_reason or ("Restock" if change > 0 else "Manual reduction")
                log = InventoryLog(
                    product_id=product.id,
                    user_id=user_id,
                    previous_stock=prev_stock,
                    new_stock=new_stock,
                    change_amount=change,
                    reason=reason,
                )
                self.db.add(log)

        for field, value in update_data.items():
            setattr(product, field, value)

        actor = self.db.get(User, user_id) if user_id else None
        AuditService.log_event(
            db=self.db,
            event_type="STOCK_ADJUSTMENT" if "available_stock" in update_data else "PRODUCT_UPDATED",
            resource_type="product",
            resource_id=product.id,
            actor=actor,
            action="UPDATE",
            payload={"product": product.name, "changes": str(update_data)},
        )

        self.db.commit()
        self.db.refresh(product)

        return product

    def get_inventory_logs(self, product_id: int | None = None) -> list[InventoryLog]:
        stmt = select(InventoryLog).order_by(InventoryLog.id.desc())
        if product_id is not None:
            stmt = stmt.where(InventoryLog.product_id == product_id)
        return list(self.db.scalars(stmt).all())

    def delete_product(self, product_id: int):
        product = self.get_product(product_id)

        try:
            name = product.name
            pid = product.id
            self.repository.delete(product)
            AuditService.log_event(
                db=self.db,
                event_type="PRODUCT_DELETED",
                resource_type="product",
                resource_id=pid,
                action="DELETE",
                payload={"name": name},
            )
            self.db.commit()
        except IntegrityError:
            self.db.rollback()

            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "This product cannot be deleted because it is "
                    "already referenced by a cart or order."
                ),
            )