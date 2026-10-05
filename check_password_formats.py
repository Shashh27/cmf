import psycopg2

SERVER_DB_URL = "postgresql://postgres:postgres@172.18.7.91:5432/CMF_DIGITIZATION"


def check_password_formats(db_url, db_name):
    """Check password formats in accesscontrol.access_users"""
    print("=" * 80)
    print(f"CHECKING PASSWORD FORMATS IN {db_name}")
    print("=" * 80)

    conn = psycopg2.connect(db_url)

    try:
        query = """
            SELECT id, user_name, role, password
            FROM accesscontrol.access_users
            ORDER BY id;
        """

        with conn.cursor() as cur:
            cur.execute(query)
            users = cur.fetchall()

            encrypted_count = 0
            bcrypt_count = 0
            other_count = 0

            print(f"\nTotal users: {len(users)}\n")

            for user_id, user_name, role, password in users:
                if password is None:
                    password_type = "NULL"
                    other_count += 1
                elif password.startswith("enc:"):
                    password_type = "ENCRYPTED (Fernet)"
                    encrypted_count += 1
                elif password.startswith("$2b$") or password.startswith("$2a$") or password.startswith("$2y$"):
                    password_type = "HASHED (Bcrypt)"
                    bcrypt_count += 1
                else:
                    password_type = "PLAINTEXT / OTHER"
                    other_count += 1

                print(f"ID: {user_id} | User: {user_name} | Role: {role}")
                print(f"  Password Type: {password_type}")
                print()

            print("=" * 80)
            print("SUMMARY:")
            print(f"  Encrypted (Fernet): {encrypted_count}")
            print(f"  Hashed (Bcrypt): {bcrypt_count}")
            print(f"  Other/NULL: {other_count}")
            print("=" * 80)

    finally:
        conn.close()


if __name__ == "__main__":
    check_password_formats(SERVER_DB_URL, "SERVER DB CMF_DIGITIZATION")
