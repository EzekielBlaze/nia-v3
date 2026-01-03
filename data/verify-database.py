"""
Simple verification script - Tests if nia.db is valid
Run this BEFORE installing to make sure the database works!
"""

import sqlite3
import sys
import os

print("="*60)
print("NIA Database Verification")
print("="*60)

db_file = 'nia.db'

# Check if file exists
if not os.path.exists(db_file):
    print(f"\n❌ ERROR: {db_file} not found in current directory!")
    print("Please put nia.db in the same folder as this script.")
    input("\nPress Enter to exit...")
    sys.exit(1)

# Check file size
size = os.path.getsize(db_file)
print(f"\n📁 File: {db_file}")
print(f"📊 Size: {size:,} bytes")

if size == 0:
    print("\n❌ ERROR: Database file is empty!")
    input("\nPress Enter to exit...")
    sys.exit(1)

# Try to open it
try:
    conn = sqlite3.connect(db_file)
    print("\n✓ Database file opens successfully")
except Exception as e:
    print(f"\n❌ ERROR: Cannot open database: {e}")
    input("\nPress Enter to exit...")
    sys.exit(1)

# Check schema
try:
    tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
    print(f"\n✓ Found {len(tables)} tables:")
    for t in tables:
        print(f"  - {t[0]}")
except Exception as e:
    print(f"\n❌ ERROR: Cannot read schema: {e}")
    conn.close()
    input("\nPress Enter to exit...")
    sys.exit(1)

# Check beliefs
try:
    count = conn.execute("SELECT COUNT(*) FROM beliefs WHERE valid_to IS NULL").fetchone()[0]
    print(f"\n✓ Beliefs (simple query): {count}")
except Exception as e:
    print(f"\n❌ ERROR querying beliefs: {e}")
    conn.close()
    input("\nPress Enter to exit...")
    sys.exit(1)

# Check is_active column
try:
    count = conn.execute("SELECT COUNT(*) FROM beliefs WHERE is_active = 1").fetchone()[0]
    print(f"✓ Beliefs (is_active query): {count}")
    print("\n✓ Database has is_active column - BeliefProcessor will work!")
except Exception as e:
    print(f"\n❌ ERROR: is_active column missing: {e}")
    print("This database won't work with BeliefProcessor!")
    conn.close()
    input("\nPress Enter to exit...")
    sys.exit(1)

# Check scars
try:
    count = conn.execute("SELECT COUNT(*) FROM identity_scars").fetchone()[0]
    print(f"✓ Scars: {count}")
except Exception as e:
    print(f"\n⚠️  WARNING: Cannot query scars: {e}")

# Show top beliefs
try:
    beliefs = conn.execute("""
        SELECT conviction_score, belief_statement 
        FROM beliefs 
        WHERE is_active = 1 
        ORDER BY conviction_score DESC 
        LIMIT 5
    """).fetchall()
    
    print("\n📋 Top 5 Beliefs:")
    for b in beliefs:
        print(f"  {b[0]:.0f}% - {b[1][:60]}...")
except Exception as e:
    print(f"\n⚠️  Cannot show beliefs: {e}")

conn.close()

print("\n" + "="*60)
print("✅ DATABASE IS VALID AND READY TO INSTALL!")
print("="*60)
print("\nYou can now copy this database to:")
print("  N:\\Nia V3\\data\\nia.db")
print("\n(After stopping the daemon)")

input("\nPress Enter to exit...")
