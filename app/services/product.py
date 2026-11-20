from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.product import Product
from app.repositories.product import ProductRepository
from app.schemas.product import ProductCreate, ProductUpdate


class ProductService:
    def __init__(self, db: Session):
        self.repository = ProductRepository(db)
        self.db = db

    def create_product(self, data: ProductCreate):
        cleaned_name = data.name.strip()
        product = self.repository.create(
            name=cleaned_name,
            price=data.price,
            available_stock=data.available_stock,
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

    def get_products(self):
        return self.repository.get_all()

    def update_product(
            self,
            product_id: int,
            data: ProductUpdate,
    ):
        product = self.get_product(product_id)

        update_data = data.model_dump(exclude_unset=True)

        if "name" in update_data and update_data["name"] is not None:
            update_data["name"] = update_data["name"].strip()

        for field, value in update_data.items():
            setattr(product, field, value)

        self.db.commit()
        self.db.refresh(product)

        return product

    def delete_product(self, product_id: int):
        product = self.get_product(product_id)

        try:
            self.repository.delete(product)
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