"""
Database Backup Script
Creates both .backup (custom format) and .sql (plain text) backups with timestamps
"""

import subprocess
import os
from datetime import datetime

# Database configuration
DB_HOST = "172.18.7.86"
DB_PORT = "5432"
DB_NAME = "CMF_Demo"
DB_USER = "postgres"
DB_PASSWORD = "postgres"

# Backup directory
BACKUP_DIR = os.path.join(os.path.dirname(__file__), "database_backups")
os.makedirs(BACKUP_DIR, exist_ok=True)

def create_backup():
    """Create both .backup and .sql backup files"""
    
    # Generate timestamp with date and time
    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    
    # Backup filenames
    backup_file = os.path.join(BACKUP_DIR, f"CMF_DIGITIZATION_{timestamp}.backup")
    sql_file = os.path.join(BACKUP_DIR, f"CMF_DIGITIZATION_{timestamp}.sql")
    
    # Set PGPASSWORD environment variable for pg_dump
    env = os.environ.copy()
    env["PGPASSWORD"] = DB_PASSWORD
    
    print(f"Creating backup at {timestamp}...")
    print(f"Backup directory: {BACKUP_DIR}")
    
    # Create .backup file (custom format - faster, supports compression)
    print(f"\n1. Creating .backup file: {backup_file}")
    try:
        cmd_backup = [
            "pg_dump",
            f"--host={DB_HOST}",
            f"--port={DB_PORT}",
            f"--username={DB_USER}",
            f"--dbname={DB_NAME}",
            "--format=custom",
            "--compress=9",
            f"--file={backup_file}"
        ]
        subprocess.run(cmd_backup, env=env, check=True)
        print(f"✓ .backup file created successfully")
    except subprocess.CalledProcessError as e:
        print(f"✗ Error creating .backup file: {e}")
        return False
    
    # Create .sql file (plain text format - human readable)
    print(f"\n2. Creating .sql file: {sql_file}")
    try:
        cmd_sql = [
            "pg_dump",
            f"--host={DB_HOST}",
            f"--port={DB_PORT}",
            f"--username={DB_USER}",
            f"--dbname={DB_NAME}",
            "--format=plain",
            "--no-owner",
            "--no-acl",
            f"--file={sql_file}"
        ]
        subprocess.run(cmd_sql, env=env, check=True)
        print(f"✓ .sql file created successfully")
    except subprocess.CalledProcessError as e:
        print(f"✗ Error creating .sql file: {e}")
        return False
    
    # Get file sizes
    backup_size = os.path.getsize(backup_file) / (1024 * 1024)  # MB
    sql_size = os.path.getsize(sql_file) / (1024 * 1024)  # MB
    
    print(f"\n{'='*60}")
    print(f"Backup completed successfully!")
    print(f"{'='*60}")
    print(f".backup file: {backup_file}")
    print(f"  Size: {backup_size:.2f} MB")
    print(f"\n.sql file: {sql_file}")
    print(f"  Size: {sql_size:.2f} MB")
    print(f"{'='*60}")
    
    return True

if __name__ == "__main__":
    create_backup()
