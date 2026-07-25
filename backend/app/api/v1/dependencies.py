from ...domain.agent import NoteAgent
from fastapi import Request, HTTPException, Depends
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlalchemy.orm import Session
from datetime import datetime
from typing import Optional

from ...services.note_service import NoteService
from ...core.rate_limiter import SlidingWindowRateLimiter
from ...db.dependency import get_db
from ...db.models import User as DBUser
from ...core.config import settings
from ...core.security import get_password_hash

# ------------------------------
# Initialize Shared Dependencies
# ------------------------------
agent = NoteAgent()
note_service = NoteService(agent)
limiter = SlidingWindowRateLimiter(limit=60, window_sec=60)

async def rate_limit(request: Request, call_next):
    client_ip = request.client.host
    if not limiter.is_allowed(client_ip):
        raise HTTPException(status_code=429, detail="Too many requests")
    return await call_next(request)

# ------------------------------
# Authentication Dependencies
# ------------------------------
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

def get_current_user_optional(db: Session = Depends(get_db), token: Optional[str] = Depends(oauth2_scheme)) -> DBUser:
    if not token:
        # Fallback to default user (id = 1)
        default_user = db.query(DBUser).filter(DBUser.id == 1).first()
        if not default_user:
            default_user = DBUser(
                id=1,
                username="default_user",
                email="default@mentorion.internal",
                hashed_password=get_password_hash("default_password"),
                is_active=True,
                created_at=datetime.utcnow().isoformat()
            )
            db.add(default_user)
            db.commit()
            db.refresh(default_user)
        return default_user

    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            return get_current_user_optional(db, token=None)
    except JWTError:
        return get_current_user_optional(db, token=None)

    user = db.query(DBUser).filter(DBUser.id == int(user_id)).first()
    if user is None:
        return get_current_user_optional(db, token=None)
    return user

def get_current_user_required(current_user: DBUser = Depends(get_current_user_optional)) -> DBUser:
    if current_user.id == 1 and current_user.username == "default_user":
        raise HTTPException(status_code=401, detail="Authentication required")
    return current_user
