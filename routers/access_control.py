from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from DB.database import get_db
from DB.models.access_control import AccessUser as AccessUserModel
from DB.schemas.access_control import AccessUserResponse, AccessUserCreate, AccessUserUpdate

router = APIRouter(
    prefix="/access-users",
    tags=["access-users"]
)

@router.post("/", response_model=AccessUserResponse, status_code=status.HTTP_201_CREATED)
def create_access_user(user: AccessUserCreate, db: Session = Depends(get_db)):
    """Create a new access user"""
    # Check if user with this gmail already exists
    db_user_email = db.query(AccessUserModel).filter(AccessUserModel.gmail == user.gmail).first()
    if db_user_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"User with gmail {user.gmail} already exists"
        )

    # Check if user with this username already exists
    db_user_name = db.query(AccessUserModel).filter(AccessUserModel.user_name == user.user_name).first()
    if db_user_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"User with username {user.user_name} already exists"
        )

    db_user = AccessUserModel(**user.model_dump())
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

@router.get("/", response_model=List[AccessUserResponse])
def get_access_users(db: Session = Depends(get_db)):
    """Get all access users (no limits)"""
    users = db.query(AccessUserModel).all()
    return users

@router.get("/{user_id}", response_model=AccessUserResponse)
def get_access_user(user_id: int, db: Session = Depends(get_db)):
    """Get a specific access user by ID"""
    user = db.query(AccessUserModel).filter(AccessUserModel.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with id {user_id} not found"
        )
    return user

@router.put("/{user_id}", response_model=AccessUserResponse)
def update_access_user(user_id: int, user: AccessUserUpdate, db: Session = Depends(get_db)):
    """Update an access user"""
    db_user = db.query(AccessUserModel).filter(AccessUserModel.id == user_id).first()
    if not db_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with id {user_id} not found"
        )

    if user.gmail:
         existing_user = db.query(AccessUserModel).filter(AccessUserModel.gmail == user.gmail).first()
         if existing_user and existing_user.id != user_id:
             raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"User with gmail {user.gmail} already exists"
            )

    if user.user_name:
         existing_user_name = db.query(AccessUserModel).filter(AccessUserModel.user_name == user.user_name).first()
         if existing_user_name and existing_user_name.id != user_id:
             raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"User with username {user.user_name} already exists"
            )

    update_data = user.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_user, field, value)

    db.commit()
    db.refresh(db_user)
    return db_user

@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_access_user(user_id: int, db: Session = Depends(get_db)):
    """Delete an access user"""
    db_user = db.query(AccessUserModel).filter(AccessUserModel.id == user_id).first()
    if not db_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with id {user_id} not found"
        )
    
    db.delete(db_user)
    db.commit()
