import os
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from dotenv import load_dotenv


load_dotenv(Path(__file__).resolve().parents[2] / ".env")


class AccountKeyCryptoError(Exception):
    pass


_MASTER_KEY: AESGCM | None = None


def _get_master_key() -> AESGCM:
    global _MASTER_KEY

    if _MASTER_KEY is None:
        value = os.getenv("LOCKTALK_ACCOUNT_KEY_MASTER_KEY", "").strip().lower()

        if len(value) != 64 or any(c not in "0123456789abcdef" for c in value):
            raise AccountKeyCryptoError("LOCKTALK_ACCOUNT_KEY_MASTER_KEY is missing or invalid.")

        _MASTER_KEY = AESGCM(bytes.fromhex(value))

    return _MASTER_KEY


def encrypt_account_key_hash(key_hash: bytes) -> bytes:
    if len(key_hash) != 32:
        raise AccountKeyCryptoError("Key hash must be 32 bytes.")

    aesgcm = _get_master_key()
    nonce = os.urandom(12)
    ciphertext = aesgcm.encrypt(nonce, key_hash, None)

    # Stored format: nonce || ciphertext || GCM tag
    return nonce + ciphertext


def decrypt_account_key_hash(blob: bytes) -> bytes:
    if not isinstance(blob, (bytes, bytearray)) or len(blob) != 60:
        raise AccountKeyCryptoError("Stored account key hash has an invalid length.")

    blob = bytes(blob)
    aesgcm = _get_master_key()
    nonce = blob[:12]
    ciphertext = blob[12:]

    return aesgcm.decrypt(nonce, ciphertext, None)