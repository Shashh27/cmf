from fastapi import APIRouter, Depends, HTTPException, status, Body
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime, timedelta
from pydantic import BaseModel
import secrets
import string

from DB.database import get_db
from DB.models.access_control import AccessUser as AccessUserModel
from DB.schemas.access_control import AccessUserResponse, AccessUserCreate, AccessUserUpdate
from auth.password import hash_password


class PasswordResetRequest(BaseModel):
    token: str
    new_password: str

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
    user_data["password"] = hash_password(user_data["password"])
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
        update_data["password"] = hash_password(update_data["password"])
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


@router.post("/{user_id}/request-password-reset")
def request_password_reset(user_id: int, db: Session = Depends(get_db)):
    """Generate password reset token for a user"""
    db_user = db.query(AccessUserModel).filter(AccessUserModel.id == user_id).first()
    if not db_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with id {user_id} not found",
        )
    
    # Generate secure random token
    alphabet = string.ascii_letters + string.digits
    token = ''.join(secrets.choice(alphabet) for _ in range(32))
    
    # Set expiration to 1 hour from now
    expires_at = datetime.utcnow() + timedelta(hours=1)
    
    # Update user with reset token
    db_user.password_reset_token = token
    db_user.password_reset_expires = expires_at
    db_user.password_reset_used = False
    
    db.commit()
    db.refresh(db_user)
    
    return {
        "message": "Password reset token generated",
        "token": token,  # In production, send this via email
        "expires_at": expires_at.isoformat()
    }


@router.post("/reset-password")
def reset_password(request: PasswordResetRequest, db: Session = Depends(get_db)):
    """Reset password using token"""
    from sqlalchemy import text
    
    # Find user with valid token
    query = text("""
        SELECT id FROM accesscontrol.access_users 
        WHERE password_reset_token = :token 
        AND password_reset_expires > :now 
        AND password_reset_used = FALSE
    """)
    
    result = db.execute(query, {
        "token": request.token,
        "now": datetime.utcnow()
    }).fetchone()
    
    if not result:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token"
        )
    
    user_id = result[0]
    db_user = db.query(AccessUserModel).filter(AccessUserModel.id == user_id).first()
    
    # Update password
    db_user.password = hash_password(request.new_password)
    db_user.password_reset_token = None
    db_user.password_reset_expires = None
    db_user.password_reset_used = True
    
    db.commit()
    
    return {"message": "Password reset successfully"}
