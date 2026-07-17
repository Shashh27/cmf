"""Password hashing with bcrypt; legacy Fernet verify + upgrade on login."""

from passlib.context import CryptContext

from DB.utils.password import is_encrypted, verify_password as verify_fernet_password

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

BCRYPT_PREFIXES = ("$2a$", "$2b$", "$2y$")


def is_bcrypt_hash(stored: str | None) -> bool:
    return bool(stored) and stored.startswith(BCRYPT_PREFIXES)


def hash_password(plain_password: str) -> str:
    return pwd_context.hash(plain_password)


def verify_and_needs_rehash(plain_password: str, stored_password: str) -> tuple[bool, bool]:
    """
    Returns (ok, needs_rehash).
    Legacy Fernet / plaintext passwords verify via Fernet helper and need rehash.
    """
    if not stored_password or not plain_password:
        return False, False

    if is_bcrypt_hash(stored_password):
        ok = pwd_context.verify(plain_password, stored_password)
        needs = ok and pwd_context.needs_update(stored_password)
        return ok, needs

    # Legacy Fernet-encrypted or plaintext
    if is_encrypted(stored_password) or not stored_password.startswith("$"):
        ok = verify_fernet_password(plain_password, stored_password)
        return ok, ok

    return False, False
