from dataclasses import dataclass
from time import time
from uuid import uuid4
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from .config import settings

bearer = HTTPBearer(auto_error=False)
sessions: dict[str, tuple[str, bool, float]] = {}


@dataclass
class Actor:
    uid: str
    admin: bool = False


def create_demo_session(admin: bool = False):
    if not settings().demo_mode:
        raise HTTPException(404, "Demo sessions are disabled")
    # Random, server-issued bearer token. Clients cannot choose another user's uid.
    now = time()
    for token, (_, _, expiry) in list(sessions.items()):
        if expiry <= now:
            sessions.pop(token, None)
    if len(sessions) >= 1000:
        raise HTTPException(429, "Too many local demo sessions")
    token, uid = uuid4().hex + uuid4().hex, "demo_" + uuid4().hex
    sessions[token] = (uid, admin, now + 86400)
    return {"token": token, "uid": uid, "admin": admin}


def actor(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)) -> Actor:
    if not credentials:
        raise HTTPException(401, "Authentication required")
    token = credentials.credentials
    if settings().demo_mode and token in sessions:
        uid, admin, expires = sessions[token]
        if expires > time():
            return Actor(uid, admin)
    if settings().firebase_project_id:
        from firebase_admin import auth

        try:
            decoded = auth.verify_id_token(token, check_revoked=True)
            return Actor(decoded["uid"], decoded.get("admin") is True)
        except Exception:
            pass
    raise HTTPException(401, "Invalid or expired session")


def admin_actor(user: Actor = Depends(actor)):
    if not user.admin:
        raise HTTPException(403, "Administrator role required")
    return user
