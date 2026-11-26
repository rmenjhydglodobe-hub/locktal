import base64
import hashlib
import re
import secrets

import pymysql
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app.db.connection import get_connection
from app.api.device_challenges import (
    consume_device_challenge,
    create_device_challenge,
)
from app.api.device_crypto import (
    decode_base64,
    load_device_public_key,
    verify_device_signature,
)
from app.api.login_tickets import consume_login_ticket, peek_login_ticket
from app.api.sessions import create_session, get_session, revoke_device_sessions


router = APIRouter(prefix="/devices", tags=["devices"])


class NewDeviceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    login_ticket: str = Field(min_length=1, max_length=128)
    device_name: str = Field(min_length=1, max_length=100)
    public_key_spki: str = Field(min_length=1, max_length=512)


class ReturningDeviceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    login_ticket: str = Field(min_length=1, max_length=128)
    device_id: str = Field(min_length=32, max_length=32)


class CompleteRegistrationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    login_ticket: str = Field(min_length=1, max_length=128)
    device_id: str = Field(min_length=32, max_length=32)
    challenge_id: str = Field(min_length=1, max_length=128)
    signature: str = Field(min_length=1, max_length=256)


class CompleteReturningLoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    login_ticket: str = Field(min_length=1, max_length=128)
    device_id: str = Field(min_length=32, max_length=32)
    challenge_id: str = Field(min_length=1, max_length=128)
    signature: str = Field(min_length=1, max_length=256)


class RenameDeviceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    device_name: str = Field(min_length=1, max_length=100)


def valid_ticket(token: str) -> tuple[str, bytes]:
    user_id = peek_login_ticket(token)

    if user_id is None:
        raise HTTPException(status_code=401, detail="Login attempt expired.")

    ticket_hash = hashlib.sha256(token.encode("ascii")).digest()
    return user_id, ticket_hash


@router.post("/registration/challenge")
def registration_challenge(request: NewDeviceRequest):
    user_id, ticket_hash = valid_ticket(request.login_ticket)
    device_name = request.device_name.strip()

    if not device_name:
        raise HTTPException(status_code=400, detail="Device name is required.")

    try:
        _, key_bytes = load_device_public_key(request.public_key_spki)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid device public key.",
        ) from None

    device_id = secrets.token_hex(16)

    challenge_id, message = create_device_challenge(
        user_id=user_id,
        device_id=device_id,
        purpose="register",
        login_ticket_hash=ticket_hash,
        metadata={
            "device_name": device_name,
            "public_key_spki": key_bytes,
        },
    )

    return {
        "device_id": device_id,
        "challenge_id": challenge_id,
        "message": message,
    }


@router.post("/login/challenge")
def returning_device_challenge(request: ReturningDeviceRequest):
    user_id, ticket_hash = valid_ticket(request.login_ticket)

    if not re.fullmatch(r"[0-9a-f]{32}", request.device_id):
        raise HTTPException(status_code=400, detail="Invalid device ID.")

    try:
        connection = get_connection()

        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT device_id
                    FROM devices
                    WHERE user_id = %s
                      AND device_id = %s
                      AND revoked_at IS NULL
                    """,
                    (user_id, request.device_id),
                )
                device = cursor.fetchone()
        finally:
            connection.close()

    except (pymysql.MySQLError, OSError, KeyError, ValueError):
        raise HTTPException(
            status_code=503,
            detail="Database unavailable. Please try again later.",
        ) from None

    if device is None:
        raise HTTPException(status_code=404, detail="Device not found or revoked.")

    challenge_id, message = create_device_challenge(
        user_id=user_id,
        device_id=request.device_id,
        purpose="login",
        login_ticket_hash=ticket_hash,
    )

    return {
        "device_id": request.device_id,
        "challenge_id": challenge_id,
        "message": message,
    }


@router.post("/registration/complete")
def complete_device_registration(request: CompleteRegistrationRequest):
    user_id, ticket_hash = valid_ticket(request.login_ticket)

    if not re.fullmatch(r"[0-9a-f]{32}", request.device_id):
        raise HTTPException(status_code=400, detail="Invalid device ID.")

    challenge = consume_device_challenge(
        challenge_id=request.challenge_id,
        user_id=user_id,
        device_id=request.device_id,
        purpose="register",
        login_ticket_hash=ticket_hash,
    )

    if challenge is None:
        raise HTTPException(status_code=401, detail="Invalid or expired challenge.")

    try:
        key_bytes = challenge["metadata"]["public_key_spki"]
        encoded_key = base64.b64encode(key_bytes).decode("ascii")
        public_key, _ = load_device_public_key(encoded_key)
        signature = decode_base64(request.signature)
    except (KeyError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid device proof.") from None

    message = challenge["message"].encode("utf-8")

    if not verify_device_signature(public_key, message, signature):
        raise HTTPException(status_code=401, detail="Invalid device proof.")

    # Only one completion can consume this ticket.
    if consume_login_ticket(request.login_ticket) != user_id:
        raise HTTPException(status_code=401, detail="Login attempt expired.")

    try:
        connection = get_connection()

        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT display_name FROM accounts WHERE user_id = %s",
                    (user_id,),
                )
                account = cursor.fetchone()

                if account is None:
                    raise HTTPException(
                        status_code=401,
                        detail="Account unavailable.",
                    )

                # Save the device before creating a session for it.
                cursor.execute(
                    """
                    INSERT INTO devices
                        (device_id, user_id, device_name, public_key_spki)
                    VALUES (%s, %s, %s, %s)
                    """,
                    (
                        request.device_id,
                        user_id,
                        challenge["metadata"]["device_name"],
                        key_bytes,
                    ),
                )

                cursor.execute(
                    """
                    INSERT INTO notifications
                        (user_id, notification_type, message)
                    VALUES (%s, %s, %s)
                    """,
                    (
                        user_id,
                        "new_device",
                        "A new device signed in: "
                        + challenge["metadata"]["device_name"],
                    ),
                )

            connection.commit()
        finally:
            connection.close()

    except pymysql.IntegrityError:
        raise HTTPException(
            status_code=409,
            detail="Device could not be registered. Start login again.",
        ) from None
    except (pymysql.MySQLError, OSError, KeyError, ValueError):
        raise HTTPException(
            status_code=503,
            detail="Database unavailable. Start login again.",
        ) from None

    token = create_session(user_id, account[0], request.device_id)

    return {
        "user_id": user_id,
        "display_name": account[0],
        "device_id": request.device_id,
        "session_token": token,
    }


@router.post("/login/complete")
def complete_returning_device_login(request: CompleteReturningLoginRequest):
    user_id, ticket_hash = valid_ticket(request.login_ticket)

    if not re.fullmatch(r"[0-9a-f]{32}", request.device_id):
        raise HTTPException(status_code=400, detail="Invalid device ID.")

    challenge = consume_device_challenge(
        challenge_id=request.challenge_id,
        user_id=user_id,
        device_id=request.device_id,
        purpose="login",
        login_ticket_hash=ticket_hash,
    )

    if challenge is None:
        raise HTTPException(status_code=401, detail="Invalid or expired challenge.")

    try:
        signature = decode_base64(request.signature)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid device proof.") from None

    connection = None
    committed = False

    try:
        connection = get_connection()
        connection.begin()

        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT d.public_key_spki, a.display_name
                FROM devices d
                JOIN accounts a ON a.user_id = d.user_id
                WHERE d.user_id = %s
                  AND d.device_id = %s
                  AND d.revoked_at IS NULL
                FOR UPDATE
                """,
                (user_id, request.device_id),
            )
            device = cursor.fetchone()

        if device is None:
            raise HTTPException(status_code=404, detail="Device not found or revoked.")

        encoded_key = base64.b64encode(device[0]).decode("ascii")

        try:
            public_key, _ = load_device_public_key(encoded_key)
        except ValueError:
            raise HTTPException(
                status_code=500,
                detail="Stored device key is invalid.",
            ) from None

        message = challenge["message"].encode("utf-8")

        if not verify_device_signature(public_key, message, signature):
            raise HTTPException(status_code=401, detail="Invalid device proof.")

        # Consume the login ticket only after the device proof succeeds.
        if consume_login_ticket(request.login_ticket) != user_id:
            raise HTTPException(status_code=401, detail="Login attempt expired.")

        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE devices
                SET last_activity_at = CURRENT_TIMESTAMP
                WHERE user_id = %s
                  AND device_id = %s
                  AND revoked_at IS NULL
                """,
                (user_id, request.device_id),
            )

        connection.commit()
        committed = True

    except HTTPException:
        raise
    except (pymysql.MySQLError, OSError, KeyError, ValueError):
        raise HTTPException(
            status_code=503,
            detail="Database unavailable. Start login again.",
        ) from None
    finally:
        if connection is not None:
            if not committed:
                connection.rollback()
            connection.close()

    token = create_session(user_id, device[1], request.device_id)

    return {
        "user_id": user_id,
        "display_name": device[1],
        "device_id": request.device_id,
        "session_token": token,
    }


@router.get("")
def list_devices(authorization: str | None = Header(default=None)):
    session = get_session(authorization)

    try:
        connection = get_connection()

        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT device_id, device_name, created_at,
                           last_activity_at, revoked_at
                    FROM devices
                    WHERE user_id = %s
                    ORDER BY created_at DESC, device_id DESC
                    """,
                    (session["user_id"],),
                )
                rows = cursor.fetchall()
        finally:
            connection.close()

    except (pymysql.MySQLError, OSError, KeyError, ValueError):
        raise HTTPException(
            status_code=503,
            detail="Database unavailable. Please try again later.",
        ) from None

    return {
        "devices": [
            {
                "device_id": row[0],
                "device_name": row[1],
                "created_at": row[2].isoformat() if row[2] else None,
                "last_activity_at": row[3].isoformat() if row[3] else None,
                "revoked_at": row[4].isoformat() if row[4] else None,
                "is_current": row[0] == session["device_id"],
            }
            for row in rows
        ]
    }


@router.patch("/{device_id}/name")
def rename_device(
    device_id: str,
    request: RenameDeviceRequest,
    authorization: str | None = Header(default=None),
):
    session = get_session(authorization)

    if not re.fullmatch(r"[0-9a-f]{32}", device_id):
        raise HTTPException(status_code=400, detail="Invalid device ID.")

    device_name = request.device_name.strip()

    if not device_name:
        raise HTTPException(status_code=400, detail="Device name is required.")

    try:
        connection = get_connection()

        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT device_id
                    FROM devices
                    WHERE user_id = %s
                      AND device_id = %s
                      AND revoked_at IS NULL
                    FOR UPDATE
                    """,
                    (session["user_id"], device_id),
                )

                if cursor.fetchone() is None:
                    raise HTTPException(
                        status_code=404,
                        detail="Device not found or revoked.",
                    )

                cursor.execute(
                    """
                    UPDATE devices
                    SET device_name = %s
                    WHERE user_id = %s AND device_id = %s
                    """,
                    (device_name, session["user_id"], device_id),
                )

            connection.commit()
        finally:
            connection.close()

    except (pymysql.MySQLError, OSError, KeyError, ValueError):
        raise HTTPException(
            status_code=503,
            detail="Database unavailable. Please try again later.",
        ) from None

    return {"device_id": device_id, "device_name": device_name}


@router.post("/{device_id}/revoke")
def revoke_device(
    device_id: str,
    authorization: str | None = Header(default=None),
):
    session = get_session(authorization)

    if not re.fullmatch(r"[0-9a-f]{32}", device_id):
        raise HTTPException(status_code=400, detail="Invalid device ID.")

    connection = None

    try:
        connection = get_connection()
        connection.begin()

        with connection.cursor() as cursor:
            # Lock both rows in a consistent order. Recheck the requesting
            # device after acquiring the locks.
            cursor.execute(
                """
                SELECT device_id, revoked_at
                FROM devices
                WHERE user_id = %s AND device_id IN (%s, %s)
                ORDER BY device_id
                FOR UPDATE
                """,
                (session["user_id"], session["device_id"], device_id),
            )
            devices = {row[0]: row[1] for row in cursor.fetchall()}

            if (
                session["device_id"] not in devices
                or devices[session["device_id"]] is not None
            ):
                raise HTTPException(
                    status_code=401,
                    detail="Current device is no longer active.",
                )

            if device_id not in devices or devices[device_id] is not None:
                raise HTTPException(
                    status_code=404,
                    detail="Device not found or already revoked.",
                )

            cursor.execute(
                """
                UPDATE devices
                SET revoked_at = CURRENT_TIMESTAMP
                WHERE user_id = %s AND device_id = %s
                """,
                (session["user_id"], device_id),
            )

        connection.commit()

    except HTTPException:
        if connection is not None:
            connection.rollback()
        raise
    except (pymysql.MySQLError, OSError, KeyError, ValueError):
        if connection is not None:
            connection.rollback()
        raise HTTPException(
            status_code=503,
            detail="Could not revoke device. Please try again.",
        ) from None
    finally:
        if connection is not None:
            connection.close()

    revoke_device_sessions(session["user_id"], device_id)

    return {
        "device_id": device_id,
        "revoked": True,
        "was_current": device_id == session["device_id"],
    }