from decimal import Decimal
from typing import Sequence
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.ingredient import Ingredient
from app.models.order import Order
from app.models.recipe import ProductRecipe
from app.models.user import User
from app.schemas.ingredient import IngredientCreate, IngredientUpdate, RecipeItemInput
from app.services.audit import AuditService


class IngredientService:
    @staticmethod
    def list_ingredients(db: Session, active_only: bool = True) -> Sequence[Ingredient]:
        stmt = select(Ingredient)
        if active_only:
            stmt = stmt.where(Ingredient.is_active == True)
        stmt = stmt.order_by(Ingredient.name.asc())
        return db.execute(stmt).scalars().all()

    @staticmethod
    def get_ingredient(db: Session, ingredient_id: int) -> Ingredient | None:
        return db.get(Ingredient, ingredient_id)

    @staticmethod
    def create_ingredient(db: Session, data: IngredientCreate, actor: User | None = None) -> Ingredient:
        ingredient = Ingredient(
            name=data.name.strip(),
            unit=data.unit.strip(),
            current_stock=data.current_stock,
            reorder_threshold=data.reorder_threshold,
            cost_per_unit=data.cost_per_unit,
        )
        db.add(ingredient)
        db.flush()

        AuditService.log_event(
            db=db,
            event_type="INGREDIENT_CREATED",
            resource_type="ingredient",
            resource_id=ingredient.id,
            actor=actor,
            action="CREATE",
            payload={
                "name": ingredient.name,
                "unit": ingredient.unit,
                "current_stock": str(ingredient.current_stock),
                "reorder_threshold": str(ingredient.reorder_threshold),
            },
        )
        db.commit()
        db.refresh(ingredient)
        return ingredient

    @staticmethod
    def update_ingredient(
        db: Session,
        ingredient_id: int,
        data: IngredientUpdate,
        actor: User | None = None,
    ) -> Ingredient | None:
        ingredient = db.get(Ingredient, ingredient_id)
        if not ingredient:
            return None

        prev_stock = ingredient.current_stock
        payload: dict[str, str] = {}

        if data.name is not None:
            ingredient.name = data.name.strip()
            payload["name"] = ingredient.name
        if data.unit is not None:
            ingredient.unit = data.unit.strip()
            payload["unit"] = ingredient.unit
        if data.reorder_threshold is not None:
            ingredient.reorder_threshold = data.reorder_threshold
            payload["reorder_threshold"] = str(ingredient.reorder_threshold)
        if data.cost_per_unit is not None:
            ingredient.cost_per_unit = data.cost_per_unit
            payload["cost_per_unit"] = str(ingredient.cost_per_unit)
        if data.is_active is not None:
            ingredient.is_active = data.is_active
            payload["is_active"] = str(ingredient.is_active)
        if data.current_stock is not None:
            ingredient.current_stock = data.current_stock
            delta = ingredient.current_stock - prev_stock
            payload["previous_stock"] = str(prev_stock)
            payload["new_stock"] = str(ingredient.current_stock)
            payload["delta"] = str(delta)
            if data.adjustment_reason:
                payload["reason"] = data.adjustment_reason

        AuditService.log_event(
            db=db,
            event_type="INGREDIENT_UPDATED",
            resource_type="ingredient",
            resource_id=ingredient.id,
            actor=actor,
            action="UPDATE",
            payload=payload,
        )
        db.commit()
        db.refresh(ingredient)
        return ingredient

    @staticmethod
    def get_product_recipe(db: Session, product_id: int) -> Sequence[ProductRecipe]:
        stmt = select(ProductRecipe).where(ProductRecipe.product_id == product_id)
        return db.execute(stmt).scalars().all()

    @staticmethod
    def set_product_recipe(
        db: Session,
        product_id: int,
        items: list[RecipeItemInput],
        actor: User | None = None,
    ) -> list[ProductRecipe]:
        # Delete existing items for product
        existing = db.execute(
            select(ProductRecipe).where(ProductRecipe.product_id == product_id)
        ).scalars().all()
        for ex in existing:
            db.delete(ex)
        db.flush()

        results = []
        recipe_payload = []
        for item in items:
            rec = ProductRecipe(
                product_id=product_id,
                ingredient_id=item.ingredient_id,
                quantity=item.quantity,
            )
            db.add(rec)
            results.append(rec)
            recipe_payload.append({
                "ingredient_id": item.ingredient_id,
                "quantity": str(item.quantity),
            })

        AuditService.log_event(
            db=db,
            event_type="RECIPE_CONFIGURED",
            resource_type="product",
            resource_id=product_id,
            actor=actor,
            action="UPDATE",
            payload={"items": recipe_payload},
        )
        db.commit()
        return results

    @staticmethod
    def deduct_order_ingredients(db: Session, order: Order, actor: User | None = None) -> list[dict]:
        """Automatically deduct raw ingredient stock for every item ordered (BOM deduction)."""
        deductions = []
        for order_item in order.items:
            recipes = db.execute(
                select(ProductRecipe).where(ProductRecipe.product_id == order_item.product_id)
            ).scalars().all()

            for rec in recipes:
                ingredient = db.get(Ingredient, rec.ingredient_id)
                if not ingredient:
                    continue

                needed = rec.quantity * Decimal(order_item.quantity)
                ingredient.current_stock = max(Decimal("0.00"), ingredient.current_stock - needed)
                deductions.append({
                    "order_id": order.id,
                    "ingredient_id": ingredient.id,
                    "ingredient_name": ingredient.name,
                    "deducted": str(needed),
                    "remaining_stock": str(ingredient.current_stock),
                })

                if ingredient.current_stock <= ingredient.reorder_threshold:
                    AuditService.log_event(
                        db=db,
                        event_type="BOM_LOW_STOCK_ALERT",
                        resource_type="ingredient",
                        resource_id=ingredient.id,
                        actor=actor,
                        action="ALERT",
                        payload={
                            "ingredient": ingredient.name,
                            "current_stock": str(ingredient.current_stock),
                            "reorder_threshold": str(ingredient.reorder_threshold),
                            "unit": ingredient.unit,
                        },
                    )

        if deductions:
            AuditService.log_event(
                db=db,
                event_type="RECIPE_BOM_DEDUCTION",
                resource_type="order",
                resource_id=order.id,
                actor=actor,
                action="EXECUTE",
                payload={"deductions": deductions},
            )
            db.flush()

        return deductions
