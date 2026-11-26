import hashlib
import re
import secrets
from app.api.login_tickets import create_login_ticket

import pymysql
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app.db.connection import get_connection

router = APIRouter(prefix="/accounts", tags=["accounts"])

KEY_PATTERN = re.compile(r"^[0-9a-f]{64}$")


class RegistrationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: str = Field(min_length=1, max_length=100)
    account_key: str = Field(min_length=64, max_length=64)


@router.post("/register", status_code=201)
def register_account(request: RegistrationRequest):
    display_name = request.display_name.strip()

    if not display_name:
        raise HTTPException(status_code=400, detail="Display name is required.")

    if not KEY_PATTERN.fullmatch(request.account_key):
        raise HTTPException(
            status_code=400,
            detail="Invalid account key format.",
        )

    # The browser must generate 32 random bytes for this key.
    key_hash = hashlib.sha256(bytes.fromhex(request.account_key)).digest()
    user_id = secrets.token_hex(16)

    try:
        connection = get_connection()
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO accounts (user_id, display_name, account_key_hash)
                    VALUES (%s, %s, %s)
                    """,
                    (user_id, display_name, key_hash),
                )
            connection.commit()
        finally:
            connection.close()

    except pymysql.IntegrityError:
        raise HTTPException(
            status_code=409,
            detail="Account could not be created. Please try again.",
        ) from None
    except (pymysql.MySQLError, OSError, KeyError, ValueError):
        raise HTTPException(
            status_code=503,
            detail="Database unavailable. Please try again later.",
        ) from None

    return {"user_id": user_id, "display_name": display_name}


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    user_id: str = Field(min_length=32, max_length=32)
    account_key: str = Field(min_length=64, max_length=64)


@router.post("/login")
def login_account(request: LoginRequest):
    if not re.fullmatch(r"[0-9a-f]{32}", request.user_id):
        raise HTTPException(status_code=401, detail="Invalid user ID or account key.")

    if not KEY_PATTERN.fullmatch(request.account_key):
        raise HTTPException(status_code=401, detail="Invalid user ID or account key.")

    key_hash = hashlib.sha256(bytes.fromhex(request.account_key)).digest()

    try:
        connection = get_connection()
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT display_name, account_key_hash
                    FROM accounts
                    WHERE user_id = %s
                    """,
                    (request.user_id,),
                )
                account = cursor.fetchone()
        finally:
            connection.close()

    except (pymysql.MySQLError, OSError, KeyError, ValueError):
        raise HTTPException(
            status_code=503,
            detail="Database unavailable. Please try again later.",
        ) from None

    # Compare a fixed-size hash even when the user ID doesn't exist.
    stored_hash = account[1] if account else bytes(32)

    if not secrets.compare_digest(key_hash, stored_hash) or account is None:
        raise HTTPException(status_code=401, detail="Invalid user ID or account key.")

    ticket = create_login_ticket(request.user_id)

    return {
        "user_id": request.user_id,
        "login_ticket": ticket,
    }