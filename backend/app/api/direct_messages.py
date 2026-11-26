import re

import pymysql
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app.api.sessions import get_session
from app.db.connection import get_connection


router = APIRouter(prefix="/direct-messages", tags=["direct messages"])


class SendMessageRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    recipient_user_id: str = Field(min_length=32, max_length=32)
    body: str = Field(min_length=1, max_length=4000)


def validate_pair(user_id: str, other_user_id: str):
    if (
        not re.fullmatch(r"[0-9a-f]{32}", other_user_id)
        or other_user_id == user_id
    ):
        raise HTTPException(status_code=400, detail="Invalid contact.")

    return sorted((user_id, other_user_id))


def lock_and_check_relationship(cursor, user_id, other_user_id, low, high):
    # Use the same account-lock order as requests and blocking.
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
        raise HTTPException(status_code=404, detail="Contact not found.")

    # Locking reads avoid using an older transaction snapshot.
    cursor.execute(
        """
        SELECT 1
        FROM user_blocks
        WHERE (blocker_user_id = %s AND blocked_user_id = %s)
           OR (blocker_user_id = %s AND blocked_user_id = %s)
        LIMIT 1 FOR UPDATE
        """,
        (user_id, other_user_id, other_user_id, user_id),
    )

    if cursor.fetchone():
        raise HTTPException(
            status_code=403,
            detail="This conversation is not available.",
        )

    cursor.execute(
        """
        SELECT status
        FROM message_requests
        WHERE pair_low_id = %s AND pair_high_id = %s
        FOR UPDATE
        """,
        (low, high),
    )
    relationship = cursor.fetchone()

    if relationship is None or relationship[0] != "accepted":
        raise HTTPException(
            status_code=403,
            detail="An accepted contact request is required.",
        )


@router.post("")
def send_message(
    request: SendMessageRequest,
    authorization: str | None = Header(default=None),
):
    session = get_session(authorization)
    sender = session["user_id"]
    recipient = request.recipient_user_id
    low, high = validate_pair(sender, recipient)

    body = request.body.strip()
    if not body:
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    connection = None
    committed = False

    try:
        connection = get_connection()
        connection.begin()

        with connection.cursor() as cursor:
            lock_and_check_relationship(cursor, sender, recipient, low, high)

            cursor.execute(
                """
                INSERT INTO direct_messages
                    (sender_user_id, recipient_user_id, body)
                VALUES (%s, %s, %s)
                """,
                (sender, recipient, body),
            )
            message_id = cursor.lastrowid

            cursor.execute(
                """
                SELECT message_id, sender_user_id, recipient_user_id,
                       body, created_at
                FROM direct_messages
                WHERE message_id = %s
                """,
                (message_id,),
            )
            row = cursor.fetchone()

        connection.commit()
        committed = True

    except HTTPException:
        raise
    except (pymysql.MySQLError, OSError, KeyError, ValueError):
        raise HTTPException(
            status_code=503,
            detail="Could not send the message.",
        ) from None
    finally:
        if connection is not None:
            if not committed:
                connection.rollback()
            connection.close()

    return {
        "message": {
            "message_id": row[0],
            "sender_user_id": row[1],
            "recipient_user_id": row[2],
            "body": row[3],
            "created_at": row[4].isoformat() if row[4] else None,
        }
    }


@router.get("/{contact_user_id}")
def list_messages(
    contact_user_id: str,
    before_id: int | None = None,
    authorization: str | None = Header(default=None),
):
    session = get_session(authorization)
    user_id = session["user_id"]
    low, high = validate_pair(user_id, contact_user_id)
    if before_id is not None and not (1 <= before_id <= 18446744073709551615):
        raise HTTPException(status_code=400, detail="Invalid message ID.")

    connection = None
    committed = False

    try:
        connection = get_connection()
        connection.begin()

        with connection.cursor() as cursor:
            lock_and_check_relationship(
                cursor, user_id, contact_user_id, low, high
            )

            cursor.execute(
                """
                SELECT message_id, sender_user_id, recipient_user_id,
                    body, created_at, delivered_at
                FROM direct_messages
                WHERE (sender_user_id = %s AND recipient_user_id = %s)
                   OR (sender_user_id = %s AND recipient_user_id = %s)
                ORDER BY message_id DESC
                LIMIT 100
                """,
                (user_id, contact_user_id, contact_user_id, user_id),
            )
            query = """
                SELECT message_id, sender_user_id, recipient_user_id,
                       body, created_at, delivered_at
                FROM direct_messages
                WHERE (
                    (sender_user_id = %s AND recipient_user_id = %s)
                    OR
                    (sender_user_id = %s AND recipient_user_id = %s)
                )
            """

            params = [user_id, contact_user_id, contact_user_id, user_id]

            if before_id is not None:
                query += " AND message_id < %s"
                params.append(before_id)

            # Fetch one extra row to check whether older messages exist.
            query += " ORDER BY message_id DESC LIMIT 101"

            cursor.execute(query, params)
            rows = cursor.fetchall()

        connection.commit()
        committed = True

    except HTTPException:
        raise
    except (pymysql.MySQLError, OSError, KeyError, ValueError):
        raise HTTPException(
            status_code=503,
            detail="Could not load messages.",
        ) from None
    finally:
        if connection is not None:
            if not committed:
                connection.rollback()
            connection.close()
            
    # Keep the requested 100 and return them oldest to newest.
    has_more = len(rows) > 100
    rows = rows[:100]

    return {
        "has_more": has_more,
        "messages": [
            {
                "message_id": row[0],
                "sender_user_id": row[1],
                "recipient_user_id": row[2],
                "body": row[3],
                "created_at": row[4].isoformat() if row[4] else None,
                "delivered_at": row[5].isoformat() if row[5] else None,
            }
            for row in reversed(rows)
        ]
    }


class AcknowledgeDeliveryRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message_ids: list[int] = Field(min_length=1, max_length=100)


@router.post("/{contact_user_id}/delivered")
def acknowledge_delivery(
    contact_user_id: str,
    request: AcknowledgeDeliveryRequest,
    authorization: str | None = Header(default=None),
):
    session = get_session(authorization)
    recipient = session["user_id"]
    low, high = validate_pair(recipient, contact_user_id)

    if any(message_id <= 0 for message_id in request.message_ids):
        raise HTTPException(status_code=400, detail="Invalid message ID.")

    # Remove duplicates before building the SQL placeholders.
    message_ids = list(set(request.message_ids))
    placeholders = ", ".join(["%s"] * len(message_ids))

    connection = None
    committed = False

    try:
        connection = get_connection()
        connection.begin()

        with connection.cursor() as cursor:
            lock_and_check_relationship(
                cursor, recipient, contact_user_id, low, high
            )

            # Only the recipient can acknowledge messages from this contact.
            # Already-acknowledged messages keep their original timestamp.
            cursor.execute(
                f"""
                UPDATE direct_messages
                SET delivered_at = CURRENT_TIMESTAMP
                WHERE recipient_user_id = %s
                  AND sender_user_id = %s
                  AND delivered_at IS NULL
                  AND message_id IN ({placeholders})
                """,
                (recipient, contact_user_id, *message_ids),
            )

        connection.commit()
        committed = True

    except HTTPException:
        raise
    except (pymysql.MySQLError, OSError, KeyError, ValueError):
        raise HTTPException(
            status_code=503,
            detail="Could not acknowledge delivery.",
        ) from None
    finally:
        if connection is not None:
            if not committed:
                connection.rollback()
            connection.close()

    return {"result": "acknowledged"}


@router.post("/{contact_user_id}/seen")
def mark_messages_seen(
    contact_user_id: str,
    request: AcknowledgeDeliveryRequest,
    authorization: str | None = Header(default=None),
):
    session = get_session(authorization)
    recipient = session["user_id"]
    low, high = validate_pair(recipient, contact_user_id)

    if any(message_id <= 0 for message_id in request.message_ids):
        raise HTTPException(status_code=400, detail="Invalid message ID.")

    message_ids = list(set(request.message_ids))
    placeholders = ", ".join(["%s"] * len(message_ids))

    connection = None
    committed = False

    try:
        connection = get_connection()
        connection.begin()

        with connection.cursor() as cursor:
            lock_and_check_relationship(
                cursor, recipient, contact_user_id, low, high
            )

            # Only mark messages addressed to this account from this contact.
            cursor.execute(
                f"""
                UPDATE direct_messages
                SET recipient_seen_at = CURRENT_TIMESTAMP
                WHERE recipient_user_id = %s
                  AND sender_user_id = %s
                  AND recipient_seen_at IS NULL
                  AND message_id IN ({placeholders})
                """,
                (recipient, contact_user_id, *message_ids),
            )

        connection.commit()
        committed = True

    except HTTPException:
        raise
    except (pymysql.MySQLError, OSError, KeyError, ValueError):
        raise HTTPException(
            status_code=503,
            detail="Could not update unread messages.",
        ) from None
    finally:
        if connection is not None:
            if not committed:
                connection.rollback()
            connection.close()

    return {"result": "updated"}