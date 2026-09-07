"""Per-pod RS256 signing and password helpers for the disposable fixture."""

import base64
import secrets
import time

import bcrypt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from jose import JWTError, jwt

ALGORITHM = "RS256"
DEFAULT_TTL_SECONDS = 3600
KEY_ID = secrets.token_hex(8)
_private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
PRIVATE_KEY_PEM = _private_key.private_bytes(
    serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode(), password_hash.encode())


def create_token(claims: dict, issuer: str, expires_in: int = DEFAULT_TTL_SECONDS) -> str:
    now = int(time.time())
    payload = {**claims, "iss": issuer, "iat": now, "exp": now + expires_in}
    return jwt.encode(payload, PRIVATE_KEY_PEM, algorithm=ALGORITHM, headers={"kid": KEY_ID})


def decode_token(token: str, issuer: str) -> dict | None:
    try:
        return jwt.decode(token, public_key_pem(), algorithms=[ALGORITHM], issuer=issuer)
    except JWTError:
        return None


def public_key_pem() -> bytes:
    return _private_key.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)


def public_jwk() -> dict[str, str]:
    numbers = _private_key.public_key().public_numbers()

    def encoded(value: int) -> str:
        raw = value.to_bytes((value.bit_length() + 7) // 8, "big")
        return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()

    return {"kty": "RSA", "use": "sig", "alg": ALGORITHM, "kid": KEY_ID, "n": encoded(numbers.n), "e": encoded(numbers.e)}
