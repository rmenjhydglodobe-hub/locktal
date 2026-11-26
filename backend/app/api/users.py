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

    if len(query) < 2:
        raise HTTPException(
            status_code=400,
            detail="Enter at least two characters to search.",
        )

    try:
        connection = get_connection()
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT user_id, display_name
                    FROM accounts
                    WHERE user_id <> %s
                      AND (user_id = %s OR LOCATE(%s, display_name) > 0)
                    ORDER BY display_name, user_id
                    LIMIT 20
                    """,
                    (session["user_id"], query, query),
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