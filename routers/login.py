from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from DB.database import get_db
from DB.models.access_control import AccessUser as AccessUserModel
from DB.schemas.access_control import LoginRequest, LoginResponse, LoginUserInfo
from auth.password import verify_and_needs_rehash, hash_password
from auth.roles import normalize_role

router = APIRouter(
    prefix="/login",
    tags=["login"],
)


@router.post("/", response_model=LoginResponse)
def login(login_data: LoginRequest, db: Session = Depends(get_db)):
    """Authenticate with username/password and return the user profile (no JWT)."""
    user = (
        db.query(AccessUserModel)
        .filter(AccessUserModel.user_name == login_data.user_name)
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )

    ok, needs_rehash = verify_and_needs_rehash(login_data.password, user.password)
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )

    if needs_rehash:
        user.password = hash_password(login_data.password)
        db.add(user)
        db.commit()
        db.refresh(user)

    info = LoginUserInfo.model_validate(user)
    info.role = normalize_role(info.role) or (info.role or "")
    return LoginResponse(user=info)
