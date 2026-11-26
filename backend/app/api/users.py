import re

import pymysql
from fastapi import APIRouter, Header, HTTPException, Query

from app.api.sessions import get_session
from app.db.connection import get_connection


router = APIRouter(prefix="/users", tags=["users"])


@router.get("/search")
def search_users(
    q: str = Query(min_length=1, max_length=100),
    authorization: str | None = Header(default=None),
):
    session = get_session(authorization)
    query = q.strip()

    if not re.fullmatch(r"[0-9a-f]{32}", query):
        raise HTTPException(
            status_code=400,
            detail="Enter the full public user ID.",
        )

    try:
        connection = get_connection()
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT user_id, display_name
                    FROM accounts
                    WHERE user_id = %s
                      AND user_id <> %s
                    """,
                    (query, session["user_id"]),
                )
                rows = cursor.fetchall()
        finally:
            connection.close()

    except (pymysql.MySQLError, OSError, KeyError, ValueError):
        raise HTTPException(
            status_code=503,
            detail="Could not search users.",
        ) from None

    return {
        "users": [
            {"user_id": row[0], "display_name": row[1]}
            for row in rows
        ]
    }