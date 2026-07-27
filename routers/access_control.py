from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from DB.database import get_db
from DB.models.access_control import AccessUser as AccessUserModel
from DB.schemas.access_control import AccessUserResponse, AccessUserCreate, AccessUserUpdate
from DB.utils.password import encrypt_password, decrypt_password, is_encrypted

router = APIRouter(
    prefix="/access-users",
    tags=["access-users"],
)


def _to_response(db_user: AccessUserModel) -> AccessUserResponse:
    return AccessUserResponse(
        id=db_user.id,
        user_name=db_user.user_name,
        gmail=db_user.gmail,
        role=db_user.role,
        center=db_user.center,
        group=db_user.group,
        createdAt=db_user.createdAt,
        updatedAt=db_user.updatedAt,
    )


@router.post("/", response_model=AccessUserResponse, status_code=status.HTTP_201_CREATED)
def create_access_user(user: AccessUserCreate, db: Session = Depends(get_db)):
    """Create a new access user"""
    db_user_email = db.query(AccessUserModel).filter(AccessUserModel.gmail == user.gmail).first()
    if db_user_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"User with gmail {user.gmail} already exists",
        )

    db_user_name = db.query(AccessUserModel).filter(AccessUserModel.user_name == user.user_name).first()
    if db_user_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"User with username {user.user_name} already exists",
        )

    user_data = user.model_dump()
    user_data["password"] = encrypt_password(user_data["password"])
    db_user = AccessUserModel(**user_data)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return _to_response(db_user)


@router.get("/", response_model=List[AccessUserResponse])
def get_access_users(db: Session = Depends(get_db)):
    """Get all access users (no limits)"""
    users = db.query(AccessUserModel).all()
    return [_to_response(user) for user in users]


@router.get("/{user_id}/", response_model=AccessUserResponse)
def get_access_user(user_id: int, db: Session = Depends(get_db)):
    """Get a specific access user by ID"""
    user = db.query(AccessUserModel).filter(AccessUserModel.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with id {user_id} not found",
        )
    return _to_response(user)


@router.put("/{user_id}/", response_model=AccessUserResponse)
def update_access_user(user_id: int, user: AccessUserUpdate, db: Session = Depends(get_db)):
    """Update an access user"""
    db_user = db.query(AccessUserModel).filter(AccessUserModel.id == user_id).first()
    if not db_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with id {user_id} not found",
        )

    if user.gmail:
        existing_user = db.query(AccessUserModel).filter(AccessUserModel.gmail == user.gmail).first()
        if existing_user and existing_user.id != user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"User with gmail {user.gmail} already exists",
            )

    if user.user_name:
        existing_user_name = (
            db.query(AccessUserModel).filter(AccessUserModel.user_name == user.user_name).first()
        )
        if existing_user_name and existing_user_name.id != user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"User with username {user.user_name} already exists",
            )

    update_data = user.model_dump(exclude_unset=True)
    if not update_data.get("password"):
        update_data.pop("password", None)
    elif "password" in update_data:
        update_data["password"] = encrypt_password(update_data["password"])
    for field, value in update_data.items():
        setattr(db_user, field, value)

    db.commit()
    db.refresh(db_user)
    return _to_response(db_user)


@router.delete("/{user_id}/", status_code=status.HTTP_204_NO_CONTENT)
def delete_access_user(user_id: int, db: Session = Depends(get_db)):
    """Delete an access user"""
    db_user = db.query(AccessUserModel).filter(AccessUserModel.id == user_id).first()
    if not db_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with id {user_id} not found",
        )

    from sqlalchemy import text

    db.execute(
        text("DELETE FROM notifications.pc_notifications WHERE pc_user_id = :user_id"),
        {"user_id": user_id},
    )
    db.execute(
        text("DELETE FROM notifications.activity_log WHERE user_id = :user_id"),
        {"user_id": user_id},
    )

    db.delete(db_user)
    db.commit()


@router.get("/{user_id}/password")
def get_user_password(user_id: int, db: Session = Depends(get_db)):
    """Get decrypted password for a user (only works for Fernet-encrypted passwords)"""
    db_user = db.query(AccessUserModel).filter(AccessUserModel.id == user_id).first()
    if not db_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with id {user_id} not found",
        )
    
    stored_password = db_user.password
    
    # Check if password is Fernet encrypted
    if is_encrypted(stored_password):
        decrypted = decrypt_password(stored_password)
        return {
            "user_id": user_id,
            "user_name": db_user.user_name,
            "password_type": "encrypted",
            "password": decrypted
        }
    # Check if password is bcrypt hashed
    elif stored_password.startswith("$2b$") or stored_password.startswith("$2a$"):
        return {
            "user_id": user_id,
            "user_name": db_user.user_name,
            "password_type": "hashed",
            "password": "Cannot display - bcrypt hash cannot be reversed"
        }
    else:
        return {
            "user_id": user_id,
            "user_name": db_user.user_name,
            "password_type": "unknown",
            "password": stored_password
        }
