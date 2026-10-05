"""Convert remaining bcrypt passwords on SERVER DB to Fernet.

Run from backend folder:
  python migrate_bcrypt_to_fernet.py

For each bcrypt user you will be asked for the ORIGINAL password.
  - Enter password → verified against bcrypt → saved as Fernet
  - Press Enter (blank) → skip that user
  - Wrong password → not updated, you can retry by re-running
"""

from getpass import getpass

import psycopg2
from passlib.context import CryptContext

from DB.utils.password import encrypt_password, is_encrypted

SERVER_DB_URL = "postgresql://postgres:postgres@172.18.7.91:5432/CMF_DIGITIZATION"
BCRYPT_PREFIXES = ("$2a$", "$2b$", "$2y$")
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def migrate_bcrypt_to_fernet():
    print("=" * 80)
    print("MIGRATE BCRYPT → FERNET  (server: CMF_DIGITIZATION)")
    print("=" * 80)

    conn = psycopg2.connect(SERVER_DB_URL)
    converted = 0
    skipped = 0
    wrong = 0
    already = 0

    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, user_name, password FROM accesscontrol.access_users ORDER BY id"
            )
            users = cur.fetchall()

        bcrypt_users = [
            (uid, name, pw)
            for uid, name, pw in users
            if pw and pw.startswith(BCRYPT_PREFIXES)
        ]
        already = sum(1 for _, _, pw in users if pw and is_encrypted(pw))

        print(f"\nTotal users: {len(users)}")
        print(f"Already Fernet: {already}")
        print(f"Still bcrypt:   {len(bcrypt_users)}\n")

        if not bcrypt_users:
            print("Nothing to convert — all non-null passwords are Fernet.")
            return

        print("Enter ORIGINAL password for each user (blank = skip).\n")

        for user_id, user_name, stored in bcrypt_users:
            plain = getpass(f"  password for {user_name}: ").strip()
            if not plain:
                skipped += 1
                print(f"    skipped {user_name}")
                continue

            try:
                ok = pwd_context.verify(plain, stored)
            except Exception:
                ok = False

            if not ok:
                wrong += 1
                print(f"    WRONG password for {user_name} — not updated")
                continue

            encrypted = encrypt_password(plain)
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE accesscontrol.access_users SET password = %s WHERE id = %s",
                    (encrypted, user_id),
                )
            converted += 1
            print(f"    OK → Fernet  {user_name}")

        conn.commit()

        print("\n" + "=" * 80)
        print("SUMMARY")
        print(f"  Converted to Fernet: {converted}")
        print(f"  Skipped (blank):     {skipped}")
        print(f"  Wrong password:      {wrong}")
        print("=" * 80)

    except Exception as e:
        conn.rollback()
        print(f"\nError: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    migrate_bcrypt_to_fernet()
