import hashlib
import secrets
import threading
import time

import pymysql
from fastapi import APIRouter, Header, HTTPException

from app.db.connection import get_connection

router = APIRouter(prefix="/sessions", tags=["sessions"])

SESSION_LIFETIME_SECONDS = 12 * 60 * 60

_sessions = {}
_lock = threading.Lock()


def create_session(user_id: str, display_name: str, device_id: str) -> str:
    """Create an in-memory session linked to a device."""
    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode("ascii")).digest()
    now = time.monotonic()

    with _lock:
        for key, session in list(_sessions.items()):
            if session["expires_at"] <= now:
                del _sessions[key]

        _sessions[token_hash] = {
            "user_id": user_id,
            "display_name": display_name,
            "device_id": device_id,
            "expires_at": now + SESSION_LIFETIME_SECONDS,
        }

    return token


def revoke_device_sessions(user_id: str, device_id: str) -> int:
    """Remove in-memory sessions associated with a device."""
    with _lock:
        matching_tokens = [
            token_hash
            for token_hash, session in _sessions.items()
            if session["user_id"] == user_id
            and session["device_id"] == device_id
        ]

        for token_hash in matching_tokens:
            del _sessions[token_hash]

    return len(matching_tokens)


def get_token(authorization: str | None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not logged in.")

    token = authorization[7:]

    if not token or not token.isascii() or len(token) > 128:
        raise HTTPException(status_code=401, detail="Invalid session.")

    return token


def get_session(authorization: str | None) -> dict:
    """Check the session and confirm its device is still active."""
    token = get_token(authorization)
    token_hash = hashlib.sha256(token.encode("ascii")).digest()

    with _lock:
        session = _sessions.get(token_hash)

        if not session or session["expires_at"] <= time.monotonic():
            _sessions.pop(token_hash, None)
            raise HTTPException(status_code=401, detail="Session expired.")

        session = dict(session)

    try:
        connection = get_connection()
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT 1
                    FROM devices
                    WHERE user_id = %s
                      AND device_id = %s
                      AND revoked_at IS NULL
                    """,
                    (session["user_id"], session["device_id"]),
                )
                active_device = cursor.fetchone()
        finally:
            connection.close()
    except (pymysql.MySQLError, OSError, KeyError, ValueError):
        raise HTTPException(
            status_code=503,
            detail="Database unavailable. Please try again later.",
        ) from None

    if active_device is None:
        with _lock:
            _sessions.pop(token_hash, None)
        raise HTTPException(status_code=401, detail="Device is no longer active.")

    # Check again in case the session was removed while the database was queried.
    with _lock:
        current = _sessions.get(token_hash)
        if current is None or current["expires_at"] <= time.monotonic():
            _sessions.pop(token_hash, None)
            raise HTTPException(status_code=401, detail="Session expired.")

    return session


@router.get("/current")
def current_session(authorization: str | None = Header(default=None)):
    session = get_session(authorization)

    return {
        "user_id": session["user_id"],
        "display_name": session["display_name"],
        "device_id": session["device_id"],
    }


@router.post("/logout")
def logout(authorization: str | None = Header(default=None)):
    token = get_token(authorization)
    token_hash = hashlib.sha256(token.encode("ascii")).digest()

    with _lock:
        _sessions.pop(token_hash, None)

    return {"message": "Logged out."}