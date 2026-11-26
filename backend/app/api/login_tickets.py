import hashlib
import secrets
import threading
import time

TICKET_LIFETIME_SECONDS = 120

_tickets = {}
_lock = threading.Lock()


def _hash_token(token: str) -> bytes:
    return hashlib.sha256(token.encode("ascii")).digest()


def create_login_ticket(user_id: str) -> str:
    """Create a ticket valid for two minutes."""
    token = secrets.token_urlsafe(32)
    token_hash = _hash_token(token)
    now = time.monotonic()

    with _lock:
        for key, ticket in list(_tickets.items()):
            if ticket["expires_at"] <= now:
                del _tickets[key]

        _tickets[token_hash] = {
            "user_id": user_id,
            "expires_at": now + TICKET_LIFETIME_SECONDS,
        }

    return token


def peek_login_ticket(token: str) -> str | None:
    """Return the ticket's user ID without consuming the ticket."""
    if not token or not token.isascii() or len(token) > 128:
        return None

    token_hash = _hash_token(token)

    with _lock:
        ticket = _tickets.get(token_hash)

        if ticket is None:
            return None

        if ticket["expires_at"] <= time.monotonic():
            del _tickets[token_hash]
            return None

        return ticket["user_id"]
    

def consume_login_ticket(token: str) -> str | None:
    """Return the user ID once, or None if the ticket is invalid or expired."""
    if not token or not token.isascii() or len(token) > 128:
        return None

    token_hash = _hash_token(token)

    with _lock:
        ticket = _tickets.pop(token_hash, None)

        if ticket is None or ticket["expires_at"] <= time.monotonic():
            return None

        return ticket["user_id"]