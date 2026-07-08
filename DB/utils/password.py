import os
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken
from dotenv import dotenv_values

ENCRYPTED_PREFIX = "enc:"

# Fernet key used to encrypt/decrypt passwords stored in DB.
# Loaded from backend/.env -> PASSWORD_ENCRYPTION_KEY
DEFAULT_PASSWORD_ENCRYPTION_KEY = "dARb2muA5agVTn-BUFmoo6NgwhxlIPUlLBA8JrRl7gE="

BACKEND_ROOT = Path(__file__).resolve().parents[2]
_fernet_instance = None
_cached_key: str | None = None


def _env_file_candidates() -> list[Path]:
    return [
        BACKEND_ROOT / ".env",
        Path.cwd() / ".env",
        Path.cwd() / "backend" / ".env",
    ]


def _load_encryption_key() -> str:
    global _cached_key
    if _cached_key:
        return _cached_key

    # Prefer explicit env var when already provided by the process.
    env_key = os.getenv("PASSWORD_ENCRYPTION_KEY", "").strip()
    if env_key:
        _cached_key = env_key
        return _cached_key

    # Parse .env without writing to os.environ (Windows putenv can fail).
    for env_path in _env_file_candidates():
        if not env_path.exists():
            continue
        values = dotenv_values(env_path)
        file_key = (values.get("PASSWORD_ENCRYPTION_KEY") or "").strip()
        if file_key:
            _cached_key = file_key
            return _cached_key

    # Fallback keeps dev server working if .env line is missing.
    _cached_key = DEFAULT_PASSWORD_ENCRYPTION_KEY
    return _cached_key


def _get_fernet() -> Fernet:
    global _fernet_instance
    if _fernet_instance is None:
        _fernet_instance = Fernet(_load_encryption_key().encode("utf-8"))
    return _fernet_instance


def is_encrypted(password: str) -> bool:
    return bool(password) and password.startswith(ENCRYPTED_PREFIX)


def encrypt_password(plain_password: str) -> str:
    token = _get_fernet().encrypt(plain_password.encode("utf-8")).decode("utf-8")
    return f"{ENCRYPTED_PREFIX}{token}"


def decrypt_password(stored_password: str) -> str:
    if not stored_password:
        return ""
    if not is_encrypted(stored_password):
        return stored_password
    token = stored_password[len(ENCRYPTED_PREFIX):]
    try:
        return _get_fernet().decrypt(token.encode("utf-8")).decode("utf-8")
    except InvalidToken:
        return ""


def verify_password(plain_password: str, stored_password: str) -> bool:
    if not stored_password:
        return False
    return decrypt_password(stored_password) == plain_password
