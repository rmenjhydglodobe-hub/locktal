import hashlib
import re
import secrets

import pymysql
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app.api.login_tickets import create_login_ticket
from app.db.connection import get_connection
from app.security.account_key_crypto import (
    AccountKeyCryptoError,
    decrypt_account_key_hash,
    encrypt_account_key_hash,
)


router = APIRouter(prefix="/accounts", tags=["accounts"])


KEY_PATTERN = re.compile(r"^[0-9a-f]{64}$")
REGISTRATION_LOCK = "locktalk_account_key_registration"


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

    # The hash generation stays the same: SHA-256 of the raw account key.
    key_hash = hashlib.sha256(bytes.fromhex(request.account_key)).digest()
    user_id = secrets.token_hex(16)

    try:
        encrypted_key_hash = encrypt_account_key_hash(key_hash)
    except AccountKeyCryptoError:
        raise HTTPException(
            status_code=503,
            detail="Account key storage is not configured.",
        ) from None

    connection = None
    committed = False

    try:
        connection = get_connection()
        connection.begin()

        with connection.cursor() as cursor:
            # Encrypted hashes use random nonces, so they cannot have a
            # database unique index. Serialize registration and compare
            # decrypted hashes to preserve the existing duplicate-key rule.
            cursor.execute("SELECT GET_LOCK(%s, 10)", (REGISTRATION_LOCK,))
            acquired = cursor.fetchone()

            if not acquired or acquired[0] != 1:
                raise HTTPException(
                    status_code=503,
                    detail="Could not create the account. Please try again.",
                )

            cursor.execute(
                "SELECT encrypted_account_key_hash FROM accounts"
            )
            for row in cursor.fetchall():
                try:
                    stored_hash = decrypt_account_key_hash(row[0])
                except AccountKeyCryptoError:
                    raise HTTPException(
                        status_code=503,
                        detail="Account key storage is not configured.",
                    ) from None

                if secrets.compare_digest(stored_hash, key_hash):
                    raise HTTPException(
                        status_code=409,
                        detail="Account could not be created. Please try again.",
                    )

            cursor.execute(
                """
                INSERT INTO accounts
                    (user_id, display_name, encrypted_account_key_hash)
                VALUES (%s, %s, %s)
                """,
                (user_id, display_name, encrypted_key_hash),
            )

        connection.commit()
        committed = True

    except HTTPException:
        raise
    except AccountKeyCryptoError:
        raise HTTPException(
            status_code=503,
            detail="Account key storage is not configured.",
        ) from None
    except (pymysql.MySQLError, OSError, KeyError, ValueError):
        raise HTTPException(
            status_code=503,
            detail="Database unavailable. Please try again later.",
        ) from None
    finally:
        if connection is not None:
            try:
                with connection.cursor() as cursor:
                    cursor.execute("SELECT RELEASE_LOCK(%s)", (REGISTRATION_LOCK,))
            except Exception:
                pass

            if not committed:
                connection.rollback()
            connection.close()

    return {"user_id": user_id, "display_name": display_name}


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    user_id: str = Field(min_length=32, max_length=32)
    account_key: str = Field(min_length=64, max_length=64)


@router.post("/login")
def login_account(request: LoginRequest):
    if not re.fullmatch(r"[0-9a-f]{32}", request.user_id):
        raise HTTPException(
            status_code=401,
            detail="Invalid user ID or account key.",
        )

    if not KEY_PATTERN.fullmatch(request.account_key):
        raise HTTPException(
            status_code=401,
            detail="Invalid user ID or account key.",
        )

    key_hash = hashlib.sha256(bytes.fromhex(request.account_key)).digest()

    try:
        connection = get_connection()
        try:
            with connection.cursor() as cursor:
                cursor.execute("SHOW COLUMNS FROM accounts")
                columns = {row[0] for row in cursor.fetchall()}

                if "encrypted_account_key_hash" in columns:
                    hash_column = "encrypted_account_key_hash"
                    encrypted = True
                elif "account_key_hash" in columns:
                    hash_column = "account_key_hash"
                    encrypted = False
                else:
                    raise HTTPException(
                        status_code=503,
                        detail="Database schema is not compatible. Please update the accounts table.",
                    )

                cursor.execute(
                    f"""
                    SELECT user_id, {hash_column}
                    FROM accounts
                    WHERE user_id = %s
                    """,
                    (request.user_id,),
                )
                row = cursor.fetchone()
        finally:
            connection.close()

    except HTTPException:
        raise
    except (pymysql.MySQLError, OSError, KeyError, ValueError):
        raise HTTPException(
            status_code=503,
            detail="Database unavailable. Please try again later.",
        ) from None

    if row is None:
        secrets.compare_digest(key_hash, bytes(32))
        raise HTTPException(
            status_code=401,
            detail="Invalid user ID or account key.",
        )

    try:
        if encrypted:
            stored_hash = decrypt_account_key_hash(row[1])
        else:
            stored_hash = bytes(row[1])
            if len(stored_hash) == 64:
                stored_hash = stored_hash[:32]
    except AccountKeyCryptoError:
        raise HTTPException(
            status_code=503,
            detail="Account key storage is not configured.",
        ) from None

    if len(stored_hash) != 32 or not secrets.compare_digest(stored_hash, key_hash):
        raise HTTPException(
            status_code=401,
            detail="Invalid user ID or account key.",
        )

    ticket = create_login_ticket(request.user_id)

    return {
        "user_id": request.user_id,
        "login_ticket": ticket,
    }