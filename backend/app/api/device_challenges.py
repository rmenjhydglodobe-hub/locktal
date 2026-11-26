import secrets
import threading
import time

CHALLENGE_LIFETIME_SECONDS = 120

_challenges = {}
_lock = threading.Lock()


def create_device_challenge(
    user_id: str,
    device_id: str,
    purpose: str,
    login_ticket_hash: bytes,
    metadata: dict | None = None,
) -> tuple[str, str]:
    """
    Create a challenge for registering or verifying a device.

    The challenge is bound to:
    - one account,
    - one device,
    - one purpose,
    - and one login ticket.

    Returns the challenge ID and the exact text the browser must sign.
    """
    if purpose not in ("register", "login"):
        raise ValueError("Invalid challenge purpose.")

    if not isinstance(login_ticket_hash, bytes) or len(login_ticket_hash) != 32:
        raise ValueError("Invalid login ticket hash.")

    challenge_id = secrets.token_urlsafe(32)
    nonce = secrets.token_urlsafe(32)

    message = (
        "LockTalk device challenge v1\n"
        f"purpose:{purpose}\n"
        f"user_id:{user_id}\n"
        f"device_id:{device_id}\n"
        f"nonce:{nonce}"
    )

    now = time.monotonic()

    with _lock:
        for key, challenge in list(_challenges.items()):
            if challenge["expires_at"] <= now:
                del _challenges[key]

        _challenges[challenge_id] = {
            "user_id": user_id,
            "device_id": device_id,
            "purpose": purpose,
            "message": message,
            "login_ticket_hash": login_ticket_hash,
            "metadata": dict(metadata or {}),
            "expires_at": now + CHALLENGE_LIFETIME_SECONDS,
        }

    return challenge_id, message


def consume_device_challenge(
    challenge_id: str,
    user_id: str,
    device_id: str,
    purpose: str,
    login_ticket_hash: bytes,
) -> dict | None:
    """
    Consume a matching, unexpired challenge.

    Returns the stored challenge data, or None if it does not match.
    The challenge is removed even when the details do not match.
    """
    if not challenge_id or not challenge_id.isascii() or len(challenge_id) > 128:
        return None

    if not isinstance(login_ticket_hash, bytes) or len(login_ticket_hash) != 32:
        return None

    with _lock:
        challenge = _challenges.pop(challenge_id, None)

        if challenge is None:
            return None

        if (
            challenge["expires_at"] <= time.monotonic()
            or challenge["user_id"] != user_id
            or challenge["device_id"] != device_id
            or challenge["purpose"] != purpose
            or not secrets.compare_digest(
                challenge["login_ticket_hash"],
                login_ticket_hash,
            )
        ):
            return None

        return challenge