from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from DB.database import get_db
from DB.models.access_control import AccessUser as AccessUserModel
from DB.schemas.access_control import LoginRequest, LoginResponse
from DB.utils.password import verify_password

router = APIRouter(
    prefix="/login",
    tags=["login"]
)

@router.post("/", response_model=LoginResponse)
def login(login_data: LoginRequest, db: Session = Depends(get_db)):
    """
    Login endpoint that verifies username and password.
    Returns user details excluding the password.
    """
    # Find user by username
    user = db.query(AccessUserModel).filter(AccessUserModel.user_name == login_data.user_name).first()
    
    if not user or not verify_password(login_data.password, user.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    return user
