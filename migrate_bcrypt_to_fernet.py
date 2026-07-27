import psycopg2
from DB.utils.password import encrypt_password

LOCAL_DB_URL = "postgresql://postgres:postgres@172.18.7.86:5432/CMF_Demo"

def migrate_bcrypt_to_fernet():
    """Migrate bcrypt hashed passwords to Fernet encryption"""
    
    # Users with bcrypt passwords (from current analysis)
    bcrypt_users = [
        {"id": 16, "user_name": "admin"},
        {"id": 20, "user_name": "Ramesh"},
        {"id": 32, "user_name": "bharath"}
    ]
    
    print("=" * 80)
    print("MIGRATE BCRYPT PASSWORDS TO FERNET ENCRYPTION")
    print("=" * 80)
    print("\nUsers with bcrypt passwords:")
    for user in bcrypt_users:
        print(f"  - ID: {user['id']}, Username: {user['user_name']}")
    
    print("\n" + "=" * 80)
    print("⚠️  WARNING: You need the ORIGINAL plaintext passwords for these users")
    print("⚠️  Bcrypt cannot be reversed - you must know the original passwords")
    print("=" * 80)
    
    conn = psycopg2.connect(LOCAL_DB_URL)
    
    try:
        for user_info in bcrypt_users:
            user_id = user_info["id"]
            user_name = user_info["user_name"]
            
            print(f"\nProcessing user: {user_name} (ID: {user_id})")
            
            # Get current password
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT password FROM accesscontrol.access_users WHERE id = %s",
                    (user_id,)
                )
                result = cur.fetchone()
                if not result:
                    print(f"  ❌ User not found")
                    continue
                
                current_password = result[0]
                print(f"  Current password type: {'Bcrypt' if current_password.startswith('$2') else 'Unknown'}")
            
            # Ask for original password
            original_password = input(f"  Enter original password for {user_name}: ")
            
            if not original_password:
                print(f"  ⚠️  Skipping {user_name} - no password provided")
                continue
            
            # Encrypt with Fernet
            encrypted_password = encrypt_password(original_password)
            print(f"  Encrypted password: {encrypted_password[:50]}...")
            
            # Update database
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE accesscontrol.access_users SET password = %s WHERE id = %s",
                    (encrypted_password, user_id)
                )
                conn.commit()
                print(f"  ✅ Successfully migrated {user_name} to Fernet encryption")
        
        print("\n" + "=" * 80)
        print("MIGRATION COMPLETE")
        print("=" * 80)
        
    except Exception as e:
        conn.rollback()
        print(f"\n❌ Error during migration: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    migrate_bcrypt_to_fernet()
