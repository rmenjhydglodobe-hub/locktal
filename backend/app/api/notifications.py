import pymysql
from fastapi import APIRouter, Header, HTTPException

from app.api.sessions import get_session
from app.db.connection import get_connection

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("")
def list_notifications(authorization: str | None = Header(default=None)):
    session = get_session(authorization)

    try:
        connection = get_connection()
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT notification_id, notification_type,
                           message, created_at, read_at
                    FROM notifications
                    WHERE user_id = %s
                    ORDER BY notification_id DESC
                    LIMIT 50
                    """,
                    (session["user_id"],),
                )
                rows = cursor.fetchall()
        finally:
            connection.close()

    except (pymysql.MySQLError, OSError, KeyError, ValueError):
        raise HTTPException(
            status_code=503,
            detail="Could not load notifications.",
        ) from None

    return {
        "notifications": [
            {
                "notification_id": row[0],
                "type": row[1],
                "message": row[2],
                "created_at": row[3].isoformat() if row[3] else None,
                "read_at": row[4].isoformat() if row[4] else None,
            }
            for row in rows
        ]
    }


@router.post("/{notification_id}/read")
def mark_notification_read(
    notification_id: int,
    authorization: str | None = Header(default=None),
):
    session = get_session(authorization)

    if notification_id <= 0:
        raise HTTPException(status_code=400, detail="Invalid notification ID.")

    try:
        connection = get_connection()
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT notification_id
                    FROM notifications
                    WHERE notification_id = %s AND user_id = %s
                    FOR UPDATE
                    """,
                    (notification_id, session["user_id"]),
                )

                if cursor.fetchone() is None:
                    raise HTTPException(
                        status_code=404,
                        detail="Notification not found.",
                    )

                cursor.execute(
                    """
                    UPDATE notifications
                    SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
                    WHERE notification_id = %s AND user_id = %s
                    """,
                    (notification_id, session["user_id"]),
                )

            connection.commit()
        finally:
            connection.close()

    except (pymysql.MySQLError, OSError, KeyError, ValueError):
        raise HTTPException(
            status_code=503,
            detail="Could not update notification.",
        ) from None

    return {"notification_id": notification_id, "read": True}