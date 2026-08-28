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
    Fernet-encrypted passwords are kept as-is.
    Bcrypt and plaintext are upgraded to Fernet after a successful login.
    """
    if not stored_password or not plain_password:
        return False, False

    if is_bcrypt_hash(stored_password):
        ok = pwd_context.verify(plain_password, stored_password)
        # Always upgrade bcrypt → Fernet after a successful login.
        return ok, ok

    # Fernet-encrypted passwords - verify but don't rehash
    if is_encrypted(stored_password):
        ok = verify_fernet_password(plain_password, stored_password)
        return ok, False  # Never rehash Fernet passwords

    # Legacy plaintext
    if not stored_password.startswith("$"):
        ok = verify_fernet_password(plain_password, stored_password)
        return ok, ok

    return False, False
