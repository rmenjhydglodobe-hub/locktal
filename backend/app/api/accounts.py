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

    display_name: str = Field(min_length=1, max_length=100)
    account_key: str = Field(min_length=64, max_length=64)


@router.post("/login")
def login_account(request: LoginRequest):
    display_name = request.display_name.strip()

    if not display_name or not KEY_PATTERN.fullmatch(request.account_key):
        raise HTTPException(
            status_code=401,
            detail="Invalid display name or account key.",
        )

    key_hash = hashlib.sha256(bytes.fromhex(request.account_key)).digest()

    try:
        connection = get_connection()
        try:
            with connection.cursor() as cursor:
                # Display names can be duplicated, so decrypt only rows
                # with this display name and compare hashes in memory.
                cursor.execute(
                    """
                    SELECT user_id, encrypted_account_key_hash
                    FROM accounts
                    WHERE display_name = %s
                    """,
                    (display_name,),
                )
                rows = cursor.fetchall()
        finally:
            connection.close()

    except (pymysql.MySQLError, OSError, KeyError, ValueError):
        raise HTTPException(
            status_code=503,
            detail="Database unavailable. Please try again later.",
        ) from None

    matched_user_id = None

    for row in rows:
        try:
            stored_hash = decrypt_account_key_hash(row[1])
        except AccountKeyCryptoError:
            raise HTTPException(
                status_code=503,
                detail="Account key storage is not configured.",
            ) from None

        if secrets.compare_digest(stored_hash, key_hash):
            matched_user_id = row[0]
            break

    if matched_user_id is None:
        # Keep a dummy comparison when no account matched.
        secrets.compare_digest(key_hash, bytes(32))
        raise HTTPException(
            status_code=401,
            detail="Invalid display name or account key.",
        )

    ticket = create_login_ticket(matched_user_id)

    return {
        "user_id": matched_user_id,
        "login_ticket": ticket,
    }