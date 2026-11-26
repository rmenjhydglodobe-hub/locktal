import base64
import binascii

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec, utils


def decode_base64(value: str) -> bytes:
    """Decode standard Base64, rejecting malformed input."""
    try:
        return base64.b64decode(value, validate=True)
    except (ValueError, binascii.Error):
        raise ValueError("Invalid Base64.") from None


def load_device_public_key(encoded_spki: str):
    """Load and validate a Base64-encoded P-256 SPKI public key."""
    key_bytes = decode_base64(encoded_spki)

    if len(key_bytes) > 256:
        raise ValueError("Public key is too large.")

    try:
        key = serialization.load_der_public_key(key_bytes)
    except (TypeError, ValueError):
        raise ValueError("Invalid public key.") from None

    if not isinstance(key, ec.EllipticCurvePublicKey):
        raise ValueError("Public key must be an EC key.")

    if not isinstance(key.curve, ec.SECP256R1):
        raise ValueError("Public key must use P-256.")

    return key, key_bytes


def verify_device_signature(public_key, message: bytes, signature: bytes) -> bool:
    """
    Web Crypto returns a P-256 ECDSA signature as 64 raw bytes: r || s.
    Convert it to DER for Python's cryptography library.
    """
    if len(signature) != 64:
        return False

    r = int.from_bytes(signature[:32], "big")
    s = int.from_bytes(signature[32:], "big")
    der_signature = utils.encode_dss_signature(r, s)

    try:
        public_key.verify(der_signature, message, ec.ECDSA(hashes.SHA256()))
        return True
    except InvalidSignature:
        return False