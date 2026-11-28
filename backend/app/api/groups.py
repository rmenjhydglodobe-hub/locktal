import re

import pymysql
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app.api.sessions import get_session
from app.db.connection import get_connection

router = APIRouter(prefix="/groups", tags=["groups"])

USER_ID_PATTERN = re.compile(r"^[0-9a-f]{32}$")


class CreateGroupRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=100)


class AddMemberRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    user_id: str = Field(min_length=32, max_length=32)


class SendGroupMessageRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    body: str = Field(min_length=1, max_length=4000)


def ensure_tables(connection):
    # DDL causes implicit commit in MySQL, so run outside app transactions.
    with connection.cursor() as cursor:
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS chat_groups (
                group_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                name VARCHAR(100) NOT NULL,
                created_by VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (group_id),
                KEY chat_groups_created_by_index (created_by),
                CONSTRAINT chat_groups_created_by_fk
                    FOREIGN KEY (created_by) REFERENCES accounts (user_id)
                    ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS group_members (
                group_id BIGINT UNSIGNED NOT NULL,
                user_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                role ENUM('owner', 'member') NOT NULL DEFAULT 'member',
                joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (group_id, user_id),
                KEY group_members_user_index (user_id),
                CONSTRAINT group_members_group_fk
                    FOREIGN KEY (group_id) REFERENCES chat_groups (group_id)
                    ON DELETE CASCADE,
                CONSTRAINT group_members_user_fk
                    FOREIGN KEY (user_id) REFERENCES accounts (user_id)
                    ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS group_messages (
                message_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                group_id BIGINT UNSIGNED NOT NULL,
                sender_user_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                body TEXT NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (message_id),
                KEY group_messages_group_index (group_id, message_id),
                CONSTRAINT group_messages_group_fk
                    FOREIGN KEY (group_id) REFERENCES chat_groups (group_id)
                    ON DELETE CASCADE,
                CONSTRAINT group_messages_sender_fk
                    FOREIGN KEY (sender_user_id) REFERENCES accounts (user_id)
                    ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )
    connection.commit()


def require_membership(cursor, group_id: int, user_id: str, for_update=False):
    lock = " FOR UPDATE" if for_update else ""
    cursor.execute(
        f"""
        SELECT gm.role, g.name, g.created_by
        FROM group_members gm
        JOIN chat_groups g ON g.group_id = gm.group_id
        WHERE gm.group_id = %s AND gm.user_id = %s{lock}
        """,
        (group_id, user_id),
    )
    row = cursor.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Group not found.")
    return {"role": row[0], "name": row[1], "created_by": row[2]}


@router.post("")
def create_group(
    request: CreateGroupRequest,
    authorization: str | None = Header(default=None),
):
    session = get_session(authorization)
    user_id = session["user_id"]
    name = request.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Group name cannot be empty.")

    connection = None
    committed = False
    try:
        connection = get_connection()
        ensure_tables(connection)
        connection.begin()
        with connection.cursor() as cursor:
            cursor.execute(
                "INSERT INTO chat_groups (name, created_by) VALUES (%s, %s)",
                (name, user_id),
            )
            group_id = cursor.lastrowid
            cursor.execute(
                """
                INSERT INTO group_members (group_id, user_id, role)
                VALUES (%s, %s, 'owner')
                """,
                (group_id, user_id),
            )
        connection.commit()
        committed = True
    except HTTPException:
        raise
    except (pymysql.MySQLError, OSError, KeyError, ValueError):
        raise HTTPException(status_code=503, detail="Could not create group.") from None
    finally:
        if connection is not None:
            if not committed:
                connection.rollback()
            connection.close()

    return {"group": {"group_id": group_id, "name": name, "role": "owner"}}


@router.get("")
def list_groups(authorization: str | None = Header(default=None)):
    session = get_session(authorization)
    user_id = session["user_id"]
    try:
        connection = get_connection()
        try:
            ensure_tables(connection)
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT g.group_id, g.name, gm.role,
                           (SELECT COUNT(*) FROM group_members m WHERE m.group_id = g.group_id) AS member_count
                    FROM group_members gm
                    JOIN chat_groups g ON g.group_id = gm.group_id
                    WHERE gm.user_id = %s
                    ORDER BY g.created_at DESC, g.group_id DESC
                    """,
                    (user_id,),
                )
                rows = cursor.fetchall()
        finally:
            connection.close()
    except (pymysql.MySQLError, OSError, KeyError, ValueError):
        raise HTTPException(status_code=503, detail="Could not load groups.") from None

    return {
        "groups": [
            {
                "group_id": row[0],
                "name": row[1],
                "role": row[2],
                "member_count": row[3],
            }
            for row in rows
        ]
    }


@router.get("/{group_id}/members")
def list_group_members(group_id: int, authorization: str | None = Header(default=None)):
    session = get_session(authorization)
    user_id = session["user_id"]
    if group_id <= 0:
        raise HTTPException(status_code=400, detail="Invalid group.")
    try:
        connection = get_connection()
        try:
            ensure_tables(connection)
            with connection.cursor() as cursor:
                require_membership(cursor, group_id, user_id)
                cursor.execute(
                    """
                    SELECT a.user_id, a.display_name, gm.role
                    FROM group_members gm
                    JOIN accounts a ON a.user_id = gm.user_id
                    WHERE gm.group_id = %s
                    ORDER BY CASE WHEN gm.role = 'owner' THEN 0 ELSE 1 END, a.display_name, a.user_id
                    """,
                    (group_id,),
                )
                rows = cursor.fetchall()
        finally:
            connection.close()
    except HTTPException:
        raise
    except (pymysql.MySQLError, OSError, KeyError, ValueError):
        raise HTTPException(status_code=503, detail="Could not load group members.") from None

    return {
        "members": [
            {"user_id": row[0], "display_name": row[1], "role": row[2]}
            for row in rows
        ]
    }


@router.post("/{group_id}/members")
def add_group_member(
    group_id: int,
    request: AddMemberRequest,
    authorization: str | None = Header(default=None),
):
    session = get_session(authorization)
    user_id = session["user_id"]
    target_id = request.user_id.lower()
    if group_id <= 0 or not USER_ID_PATTERN.fullmatch(target_id):
        raise HTTPException(status_code=400, detail="Invalid request.")
    if target_id == user_id:
        raise HTTPException(status_code=400, detail="You are already in this group.")

    connection = None
    committed = False
    try:
        connection = get_connection()
        ensure_tables(connection)
        connection.begin()
        with connection.cursor() as cursor:
            membership = require_membership(cursor, group_id, user_id, for_update=True)
            if membership["role"] != "owner":
                raise HTTPException(status_code=403, detail="Only the group owner can add members.")

            cursor.execute("SELECT user_id FROM accounts WHERE user_id = %s FOR UPDATE", (target_id,))
            if cursor.fetchone() is None:
                raise HTTPException(status_code=404, detail="User not found.")

            low, high = sorted((user_id, target_id))
            cursor.execute(
                """
                SELECT 1 FROM user_blocks
                WHERE (blocker_user_id = %s AND blocked_user_id = %s)
                   OR (blocker_user_id = %s AND blocked_user_id = %s)
                LIMIT 1
                """,
                (user_id, target_id, target_id, user_id),
            )
            if cursor.fetchone():
                raise HTTPException(status_code=403, detail="This user cannot be added.")

            cursor.execute(
                "SELECT 1 FROM group_members WHERE group_id = %s AND user_id = %s FOR UPDATE",
                (group_id, target_id),
            )
            if cursor.fetchone():
                return {"result": "already_member"}

            cursor.execute(
                "INSERT INTO group_members (group_id, user_id, role) VALUES (%s, %s, 'member')",
                (group_id, target_id),
            )
        connection.commit()
        committed = True
    except HTTPException:
        raise
    except (pymysql.MySQLError, OSError, KeyError, ValueError):
        raise HTTPException(status_code=503, detail="Could not add member.") from None
    finally:
        if connection is not None:
            if not committed:
                connection.rollback()
            connection.close()

    return {"result": "added"}


@router.post("/{group_id}/leave")
def leave_group(group_id: int, authorization: str | None = Header(default=None)):
    session = get_session(authorization)
    user_id = session["user_id"]
    if group_id <= 0:
        raise HTTPException(status_code=400, detail="Invalid group.")

    connection = None
    committed = False
    try:
        connection = get_connection()
        ensure_tables(connection)
        connection.begin()
        with connection.cursor() as cursor:
            membership = require_membership(cursor, group_id, user_id, for_update=True)
            if membership["role"] == "owner":
                # MVP: owner leaving deletes group to avoid orphaned groups.
                cursor.execute("DELETE FROM chat_groups WHERE group_id = %s", (group_id,))
            else:
                cursor.execute(
                    "DELETE FROM group_members WHERE group_id = %s AND user_id = %s",
                    (group_id, user_id),
                )
        connection.commit()
        committed = True
    except HTTPException:
        raise
    except (pymysql.MySQLError, OSError, KeyError, ValueError):
        raise HTTPException(status_code=503, detail="Could not leave group.") from None
    finally:
        if connection is not None:
            if not committed:
                connection.rollback()
            connection.close()

    return {"result": "left"}


@router.get("/{group_id}/messages")
def list_group_messages(group_id: int, authorization: str | None = Header(default=None)):
    session = get_session(authorization)
    user_id = session["user_id"]
    if group_id <= 0:
        raise HTTPException(status_code=400, detail="Invalid group.")
    try:
        connection = get_connection()
        try:
            ensure_tables(connection)
            with connection.cursor() as cursor:
                require_membership(cursor, group_id, user_id)
                cursor.execute(
                    """
                    SELECT m.message_id, m.sender_user_id, a.display_name, m.body, m.created_at
                    FROM group_messages m
                    JOIN accounts a ON a.user_id = m.sender_user_id
                    WHERE m.group_id = %s
                    ORDER BY m.message_id DESC
                    LIMIT 100
                    """,
                    (group_id,),
                )
                rows = cursor.fetchall()
        finally:
            connection.close()
    except HTTPException:
        raise
    except (pymysql.MySQLError, OSError, KeyError, ValueError):
        raise HTTPException(status_code=503, detail="Could not load group messages.") from None

    return {
        "messages": [
            {
                "message_id": row[0],
                "sender_user_id": row[1],
                "sender_display_name": row[2],
                "body": row[3],
                "created_at": row[4].isoformat() if row[4] else None,
            }
            for row in reversed(rows)
        ]
    }


@router.post("/{group_id}/messages")
def send_group_message(
    group_id: int,
    request: SendGroupMessageRequest,
    authorization: str | None = Header(default=None),
):
    session = get_session(authorization)
    user_id = session["user_id"]
    body = request.body.strip()
    if group_id <= 0:
        raise HTTPException(status_code=400, detail="Invalid group.")
    if not body:
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    connection = None
    committed = False
    try:
        connection = get_connection()
        ensure_tables(connection)
        connection.begin()
        with connection.cursor() as cursor:
            require_membership(cursor, group_id, user_id, for_update=True)
            cursor.execute(
                """
                INSERT INTO group_messages (group_id, sender_user_id, body)
                VALUES (%s, %s, %s)
                """,
                (group_id, user_id, body),
            )
        connection.commit()
        committed = True
    except HTTPException:
        raise
    except (pymysql.MySQLError, OSError, KeyError, ValueError):
        raise HTTPException(status_code=503, detail="Could not send group message.") from None
    finally:
        if connection is not None:
            if not committed:
                connection.rollback()
            connection.close()

    return {"result": "sent"}
