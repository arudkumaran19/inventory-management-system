from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_role
from app.db.session import get_db
from app.models.product import Product
from app.models.user import User, UserRole
from app.schemas.ingredient import (
    IngredientCreate,
    IngredientResponse,
    IngredientUpdate,
    RecipeItemInput,
    RecipeItemResponse,
)
from app.services.ingredient import IngredientService

router = APIRouter(prefix="/ingredients", tags=["Ingredients & BOM"])


@router.get("", response_model=list[IngredientResponse])
def get_ingredients(
    active_only: bool = Query(True),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return IngredientService.list_ingredients(db, active_only=active_only)


@router.post("", response_model=IngredientResponse, status_code=status.HTTP_201_CREATED)
def create_ingredient(
    data: IngredientCreate,
    db: Session = Depends(get_db),
    current_manager: User = Depends(require_role(UserRole.MANAGER)),
):
    return IngredientService.create_ingredient(db, data, actor=current_manager)


@router.patch("/{ingredient_id}", response_model=IngredientResponse)
def update_ingredient(
    ingredient_id: int,
    data: IngredientUpdate,
    db: Session = Depends(get_db),
    current_manager: User = Depends(require_role(UserRole.MANAGER)),
):
    updated = IngredientService.update_ingredient(db, ingredient_id, data, actor=current_manager)
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ingredient not found")
    return updated


@router.get("/recipes/{product_id}", response_model=list[RecipeItemResponse])
def get_product_recipe(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    recipes = IngredientService.get_product_recipe(db, product_id)
    return [
        RecipeItemResponse(
            id=r.id,
            product_id=r.product_id,
            ingredient_id=r.ingredient_id,
            quantity=r.quantity,
            ingredient_name=r.ingredient.name if r.ingredient else None,
            ingredient_unit=r.ingredient.unit if r.ingredient else None,
        )
        for r in recipes
    ]


@router.post("/recipes/{product_id}", response_model=list[RecipeItemResponse])
def set_product_recipe(
    product_id: int,
    items: list[RecipeItemInput],
    db: Session = Depends(get_db),
    current_manager: User = Depends(require_role(UserRole.MANAGER)),
):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    saved = IngredientService.set_product_recipe(db, product_id, items, actor=current_manager)
    return [
        RecipeItemResponse(
            id=r.id,
            product_id=r.product_id,
            ingredient_id=r.ingredient_id,
            quantity=r.quantity,
            ingredient_name=r.ingredient.name if r.ingredient else None,
            ingredient_unit=r.ingredient.unit if r.ingredient else None,
        )
        for r in saved
    ]
