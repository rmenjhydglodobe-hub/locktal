import re

import pymysql
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app.api.sessions import get_session
from app.db.connection import get_connection

router = APIRouter(prefix="/message-requests", tags=["message requests"])


class SendRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    recipient_user_id: str = Field(min_length=32, max_length=32)


@router.post("")
def send_request(
    request: SendRequest,
    authorization: str | None = Header(default=None),
):
    session = get_session(authorization)
    sender = session["user_id"]
    recipient = request.recipient_user_id

    if not re.fullmatch(r"[0-9a-f]{32}", recipient) or recipient == sender:
        raise HTTPException(status_code=400, detail="Invalid recipient.")

    low, high = sorted((sender, recipient))
    connection = None
    committed = False

    try:
        connection = get_connection()
        connection.begin()

        with connection.cursor() as cursor:
            # Every relationship-changing endpoint must lock accounts in
            # this same order before checking requests or blocks.
            cursor.execute(
                """
                SELECT user_id
                FROM accounts
                WHERE user_id IN (%s, %s)
                ORDER BY user_id
                FOR UPDATE
                """,
                (low, high),
            )
            accounts = cursor.fetchall()

            if len(accounts) != 2:
                raise HTTPException(status_code=404, detail="User not found.")

            cursor.execute(
                """
                SELECT 1 FROM user_blocks
                WHERE (blocker_user_id = %s AND blocked_user_id = %s)
                   OR (blocker_user_id = %s AND blocked_user_id = %s)
                LIMIT 1 FOR UPDATE
                """,
                (sender, recipient, recipient, sender),
            )
            if cursor.fetchone():
                raise HTTPException(
                    status_code=403,
                    detail="A request cannot be sent to this user.",
                )

            cursor.execute(
                """
                SELECT request_id, sender_user_id, status
                FROM message_requests
                WHERE pair_low_id = %s AND pair_high_id = %s
                FOR UPDATE
                """,
                (low, high),
            )
            existing = cursor.fetchone()

            if existing and existing[2] == "accepted":
                result = "already_accepted"

            elif existing and existing[2] == "pending":
                if existing[1] == sender:
                    result = "already_pending"
                else:
                    cursor.execute(
                        """
                        UPDATE message_requests
                        SET status = 'accepted', responded_at = CURRENT_TIMESTAMP
                        WHERE request_id = %s
                        """,
                        (existing[0],),
                    )
                    cursor.execute(
                        """
                        DELETE FROM request_limits
                        WHERE (sender_user_id = %s AND recipient_user_id = %s)
                           OR (sender_user_id = %s AND recipient_user_id = %s)
                        """,
                        (sender, recipient, recipient, sender),
                    )
                    result = "accepted"

            else:
                cursor.execute(
                    """
                    SELECT decline_count, blocked_until,
                           blocked_until > CURRENT_TIMESTAMP
                    FROM request_limits
                    WHERE sender_user_id = %s AND recipient_user_id = %s
                    FOR UPDATE
                    """,
                    (sender, recipient),
                )
                limit = cursor.fetchone()

                if limit and limit[2]:
                    raise HTTPException(
                        status_code=429,
                        detail="Request limit reached. Try again later.",
                    )

                if limit and limit[1] is not None:
                    cursor.execute(
                        """
                        UPDATE request_limits
                        SET decline_count = 0, blocked_until = NULL
                        WHERE sender_user_id = %s AND recipient_user_id = %s
                        """,
                        (sender, recipient),
                    )

                # A declined request is replaced with a new record and ID.
                if existing:
                    cursor.execute(
                        "DELETE FROM message_requests WHERE request_id = %s",
                        (existing[0],),
                    )

                cursor.execute(
                    """
                    INSERT INTO message_requests
                        (sender_user_id, recipient_user_id,
                         pair_low_id, pair_high_id, status)
                    VALUES (%s, %s, %s, %s, 'pending')
                    """,
                    (sender, recipient, low, high),
                )

                cursor.execute(
                    """
                    INSERT INTO notifications (user_id, notification_type, message)
                    VALUES (%s, 'message_request', %s)
                    """,
                    (recipient, "You have a new message request."),
                )
                result = "sent"

        connection.commit()
        committed = True

    except HTTPException:
        raise
    except (pymysql.MySQLError, OSError, KeyError, ValueError):
        raise HTTPException(
            status_code=503,
            detail="Could not process the request. Please try again.",
        ) from None
    finally:
        if connection is not None:
            if not committed:
                connection.rollback()
            connection.close()

    return {"result": result}


@router.get("/incoming")
def list_incoming_requests(
    authorization: str | None = Header(default=None),
):
    session = get_session(authorization)

    try:
        connection = get_connection()
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT r.request_id, r.sender_user_id,
                           a.display_name, r.created_at
                    FROM message_requests r
                    JOIN accounts a ON a.user_id = r.sender_user_id
                    WHERE r.recipient_user_id = %s
                      AND r.status = 'pending'
                    ORDER BY r.created_at DESC, r.request_id DESC
                    """,
                    (session["user_id"],),
                )
                rows = cursor.fetchall()
        finally:
            connection.close()

    except (pymysql.MySQLError, OSError, KeyError, ValueError):
        raise HTTPException(
            status_code=503,
            detail="Could not load message requests.",
        ) from None

    return {
        "requests": [
            {
                "request_id": row[0],
                "sender_user_id": row[1],
                "sender_display_name": row[2],
                "created_at": row[3].isoformat() if row[3] else None,
            }
            for row in rows
        ]
    }


class RespondRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: str


@router.post("/{request_id}/respond")
def respond_to_request(
    request_id: int,
    request: RespondRequest,
    authorization: str | None = Header(default=None),
):
    session = get_session(authorization)
    recipient = session["user_id"]

    if request_id <= 0 or request.action not in ("accept", "decline"):
        raise HTTPException(status_code=400, detail="Invalid response.")

    connection = None
    committed = False

    try:
        connection = get_connection()
        connection.begin()

        with connection.cursor() as cursor:
            # Find the pair first. This is not the final authorization check:
            # the request is checked again after the account rows are locked.
            cursor.execute(
                """
                SELECT sender_user_id, recipient_user_id
                FROM message_requests
                WHERE request_id = %s
                """,
                (request_id,),
            )
            pair = cursor.fetchone()

            if pair is None or pair[1] != recipient:
                raise HTTPException(status_code=404, detail="Request not found.")

            sender = pair[0]
            low, high = sorted((sender, recipient))

            # Match the lock order used by send_request.
            cursor.execute(
                """
                SELECT user_id
                FROM accounts
                WHERE user_id IN (%s, %s)
                ORDER BY user_id
                FOR UPDATE
                """,
                (low, high),
            )
            if len(cursor.fetchall()) != 2:
                raise HTTPException(status_code=404, detail="Request not found.")

            # Recheck under the relationship lock: the request may have changed
            # while this transaction was waiting for the account locks.
            cursor.execute(
                """
                SELECT sender_user_id, recipient_user_id, status
                FROM message_requests
                WHERE request_id = %s
                FOR UPDATE
                """,
                (request_id,),
            )
            current = cursor.fetchone()

            if (
                current is None
                or current[0] != sender
                or current[1] != recipient
                or current[2] != "pending"
            ):
                raise HTTPException(
                    status_code=409,
                    detail="Request is no longer pending.",
                )

            if request.action == "accept":
                cursor.execute(
                    """
                    SELECT 1 FROM user_blocks
                    WHERE (blocker_user_id = %s AND blocked_user_id = %s)
                       OR (blocker_user_id = %s AND blocked_user_id = %s)
                    LIMIT 1 FOR UPDATE
                    """,
                    (sender, recipient, recipient, sender),
                )
                if cursor.fetchone():
                    raise HTTPException(
                        status_code=403,
                        detail="This request cannot be accepted.",
                    )

                cursor.execute(
                    """
                    UPDATE message_requests
                    SET status = 'accepted', responded_at = CURRENT_TIMESTAMP
                    WHERE request_id = %s
                    """,
                    (request_id,),
                )
                cursor.execute(
                    """
                    DELETE FROM request_limits
                    WHERE (sender_user_id = %s AND recipient_user_id = %s)
                       OR (sender_user_id = %s AND recipient_user_id = %s)
                    """,
                    (sender, recipient, recipient, sender),
                )
                result = "accepted"

            else:
                cursor.execute(
                    """
                    UPDATE message_requests
                    SET status = 'declined', responded_at = CURRENT_TIMESTAMP
                    WHERE request_id = %s
                    """,
                    (request_id,),
                )

                cursor.execute(
                    """
                    SELECT decline_count, blocked_until
                    FROM request_limits
                    WHERE sender_user_id = %s AND recipient_user_id = %s
                    FOR UPDATE
                    """,
                    (sender, recipient),
                )
                limit = cursor.fetchone()

                # A new request can only be sent after an expired restriction
                # has been reset by send_request.
                count = (limit[0] if limit else 0) + 1
                count = min(count, 3)

                if limit is None:
                    cursor.execute(
                        """
                        INSERT INTO request_limits
                            (sender_user_id, recipient_user_id, decline_count)
                        VALUES (%s, %s, %s)
                        """,
                        (sender, recipient, count),
                    )
                else:
                    cursor.execute(
                        """
                        UPDATE request_limits
                        SET decline_count = %s
                        WHERE sender_user_id = %s AND recipient_user_id = %s
                        """,
                        (count, sender, recipient),
                    )

                if count >= 3:
                    cursor.execute(
                        """
                        UPDATE request_limits
                        SET blocked_until = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 30 DAY)
                        WHERE sender_user_id = %s AND recipient_user_id = %s
                        """,
                        (sender, recipient),
                    )

                result = "declined"

        connection.commit()
        committed = True

    except HTTPException:
        raise
    except (pymysql.MySQLError, OSError, KeyError, ValueError):
        raise HTTPException(
            status_code=503,
            detail="Could not respond to the request. Please try again.",
        ) from None
    finally:
        if connection is not None:
            if not committed:
                connection.rollback()
            connection.close()

    return {"result": result}


@router.get("/contacts")
def list_contacts(authorization: str | None = Header(default=None)):
    session = get_session(authorization)
    user_id = session["user_id"]

    try:
        connection = get_connection()

        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT
                        a.user_id,
                        a.display_name,
                        (
                            SELECT COUNT(*)
                            FROM direct_messages m
                            WHERE m.sender_user_id = a.user_id
                              AND m.recipient_user_id = %s
                              AND m.recipient_seen_at IS NULL
                        ) AS unread_count
                    FROM message_requests r
                    JOIN accounts a ON a.user_id = CASE
                        WHEN r.sender_user_id = %s THEN r.recipient_user_id
                        ELSE r.sender_user_id
                    END
                    WHERE r.status = 'accepted'
                      AND (r.sender_user_id = %s OR r.recipient_user_id = %s)
                      AND NOT EXISTS (
                          SELECT 1
                          FROM user_blocks b
                          WHERE (b.blocker_user_id = %s AND b.blocked_user_id = a.user_id)
                             OR (b.blocker_user_id = a.user_id AND b.blocked_user_id = %s)
                      )
                    ORDER BY a.display_name, a.user_id
                    """,
                    (user_id, user_id, user_id, user_id, user_id, user_id),
                )
                rows = cursor.fetchall()
        finally:
            connection.close()

    except (pymysql.MySQLError, OSError, KeyError, ValueError):
        raise HTTPException(
            status_code=503,
            detail="Could not load contacts.",
        ) from None

    return {
        "contacts": [
            {
                "user_id": row[0],
                "display_name": row[1],
                "unread_count": row[2],
            }
            for row in rows
        ]
    }


@router.get("/blocks")
def list_blocked_users(authorization: str | None = Header(default=None)):
    session = get_session(authorization)
    user_id = session["user_id"]

    try:
        connection = get_connection()

        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT a.user_id, a.display_name
                    FROM user_blocks b
                    JOIN accounts a ON a.user_id = b.blocked_user_id
                    WHERE b.blocker_user_id = %s
                    ORDER BY a.display_name, a.user_id
                    """,
                    (user_id,),
                )
                rows = cursor.fetchall()
        finally:
            connection.close()

    except (pymysql.MySQLError, OSError, KeyError, ValueError):
        raise HTTPException(
            status_code=503,
            detail="Could not load blocked users.",
        ) from None

    return {
        "users": [
            {"user_id": row[0], "display_name": row[1]}
            for row in rows
        ]
    }


@router.post("/blocks/{target_user_id}")
def block_user(
    target_user_id: str,
    authorization: str | None = Header(default=None),
):
    session = get_session(authorization)
    user_id = session["user_id"]

    if not re.fullmatch(r"[0-9a-f]{32}", target_user_id):
        raise HTTPException(status_code=400, detail="Invalid user ID.")

    if target_user_id == user_id:
        raise HTTPException(status_code=400, detail="You cannot block yourself.")

    low, high = sorted((user_id, target_user_id))
    connection = None
    committed = False

    try:
        connection = get_connection()
        connection.begin()

        with connection.cursor() as cursor:
            # Match the account lock order used by request endpoints.
            cursor.execute(
                """
                SELECT user_id
                FROM accounts
                WHERE user_id IN (%s, %s)
                ORDER BY user_id
                FOR UPDATE
                """,
                (low, high),
            )

            if len(cursor.fetchall()) != 2:
                raise HTTPException(status_code=404, detail="User not found.")

            cursor.execute(
                """
                SELECT 1
                FROM user_blocks
                WHERE blocker_user_id = %s AND blocked_user_id = %s
                FOR UPDATE
                """,
                (user_id, target_user_id),
            )

            if cursor.fetchone() is None:
                cursor.execute(
                    """
                    INSERT INTO user_blocks
                        (blocker_user_id, blocked_user_id)
                    VALUES (%s, %s)
                    """,
                    (user_id, target_user_id),
                )

            # Remove the relationship in either direction. Decline-limit
            # records are intentionally not cleared by blocking.
            cursor.execute(
                """
                DELETE FROM message_requests
                WHERE pair_low_id = %s AND pair_high_id = %s
                """,
                (low, high),
            )

        connection.commit()
        committed = True

    except HTTPException:
        raise
    except (pymysql.MySQLError, OSError, KeyError, ValueError):
        raise HTTPException(
            status_code=503,
            detail="Could not block the user. Please try again.",
        ) from None
    finally:
        if connection is not None:
            if not committed:
                connection.rollback()
            connection.close()

    return {"result": "blocked"}


@router.post("/blocks/{target_user_id}/unblock")
def unblock_user(
    target_user_id: str,
    authorization: str | None = Header(default=None),
):
    session = get_session(authorization)
    user_id = session["user_id"]

    if not re.fullmatch(r"[0-9a-f]{32}", target_user_id):
        raise HTTPException(status_code=400, detail="Invalid user ID.")

    if target_user_id == user_id:
        raise HTTPException(status_code=400, detail="Invalid user ID.")

    low, high = sorted((user_id, target_user_id))
    connection = None
    committed = False

    try:
        connection = get_connection()
        connection.begin()

        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT user_id
                FROM accounts
                WHERE user_id IN (%s, %s)
                ORDER BY user_id
                FOR UPDATE
                """,
                (low, high),
            )

            if len(cursor.fetchall()) != 2:
                raise HTTPException(status_code=404, detail="User not found.")

            cursor.execute(
                """
                DELETE FROM user_blocks
                WHERE blocker_user_id = %s AND blocked_user_id = %s
                """,
                (user_id, target_user_id),
            )

        connection.commit()
        committed = True

    except HTTPException:
        raise
    except (pymysql.MySQLError, OSError, KeyError, ValueError):
        raise HTTPException(
            status_code=503,
            detail="Could not unblock the user. Please try again.",
        ) from None
    finally:
        if connection is not None:
            if not committed:
                connection.rollback()
            connection.close()

    return {"result": "unblocked"}