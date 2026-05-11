#!/usr/bin/env python3
"""
Simple Restore Script - Restore CMF_DIGITIZATION backup to CMF_Demo
Run this whenever you want to refresh your local database with production data
"""

import os
import sys
import subprocess
from pathlib import Path

# Configuration
TARGET_HOST = "localhost"
TARGET_PORT = "5432"
TARGET_DB = "CMF_Demo"
TARGET_USER = "postgres"
TARGET_PASSWORD = "postgres"

def get_latest_backup():
    """Find the most recent backup file"""
    backup_dir = Path(".")  # Current directory (database_backups)
    
    # Get all .sql files
    sql_files = list(backup_dir.glob("*.sql"))
    if not sql_files:
        print("✗ No backup files found!")
        return None

    
    # Get most recent file
    latest = max(sql_files, key=lambda p: p.stat().st_mtime)
    return latest

def restore_database(backup_file):
    """Restore backup to target database"""
    print(f"Restoring from: {backup_file}")
    
    # Set environment variable for password
    env = os.environ.copy()
    env['PGPASSWORD'] = TARGET_PASSWORD
    
    try:
        # Disconnect active connections
        print("Disconnecting active users...")
        sql_cmd = f"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '{TARGET_DB}' AND pid <> pg_backend_pid();"
        disconnect_cmd = [
            'psql', '--host', TARGET_HOST, '--port', TARGET_PORT,
            '--username', TARGET_USER, '--dbname', 'postgres',
            '--command', sql_cmd
        ]
        subprocess.run(disconnect_cmd, env=env, capture_output=True)
        
        # Drop and recreate database
        print("Dropping old database...")
        drop_cmd = ['dropdb', '--host', TARGET_HOST, '--port', TARGET_PORT,
                   '--username', TARGET_USER, '--if-exists', '--force', TARGET_DB]
        subprocess.run(drop_cmd, env=env, check=True)
        
        print("Creating new database...")
        create_cmd = ['createdb', '--host', TARGET_HOST, '--port', TARGET_PORT,
                     '--username', TARGET_USER, TARGET_DB]
        subprocess.run(create_cmd, env=env, check=True)
        
        # Restore from backup
        print("Restoring data (this may take a few minutes)...")
        restore_cmd = [
            'psql', '--host', TARGET_HOST, '--port', TARGET_PORT,
            '--username', TARGET_USER, '--dbname', TARGET_DB,
            '--file', str(backup_file), '--quiet'
        ]
        subprocess.run(restore_cmd, env=env, check=True)
        
        return True
        
    except subprocess.CalledProcessError as e:
        print(f"✗ Restore failed: {e}")
        return False

def verify_database():
    """Check if restore was successful"""
    env = os.environ.copy()
    env['PGPASSWORD'] = TARGET_PASSWORD
    
    cmd = ['psql', '--host', TARGET_HOST, '--port', TARGET_PORT,
           '--username', TARGET_USER, '--dbname', TARGET_DB,
           '--tuples-only', '--no-align', '--command', '\dn']
    
    try:
        result = subprocess.run(cmd, env=env, check=True, capture_output=True, text=True)
        schemas = [line.split('|')[0] for line in result.stdout.strip().split('\n') if line.strip()]
        print(f"✓ Database restored with {len(schemas)} schemas")
        return True
    except:
        return False

def main():
    print("=" * 50)
    print("CMF_Demo Database Restore")
    print("=" * 50)
    
    # Find latest backup
    backup_file = get_latest_backup()
    if not backup_file:
        print("\nPlease run copy_database_ordered.py first to create a backup")
        sys.exit(1)
    
    print(f"Using backup: {backup_file.name}")
    print(f"Target: {TARGET_DB} on {TARGET_HOST}:{TARGET_PORT}")
    print("-" * 50)
    
    # Confirm
    response = input("This will REPLACE your current CMF_Demo database. Continue? (yes/no): ")
    if response.lower() != 'yes':
        print("Restore cancelled")
        sys.exit(0)
    
    # Restore
    if restore_database(backup_file):
        print("-" * 50)
        if verify_database():
            print("✓ RESTORE COMPLETED SUCCESSFULLY!")
            print(f"Database '{TARGET_DB}' is ready to use")
        else:
            print("⚠ Restore completed but verification failed")
    else:
        print("✗ RESTORE FAILED!")
        sys.exit(1)
    
    print("=" * 50)

if __name__ == "__main__":
    main()
