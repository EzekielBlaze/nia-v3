#!/usr/bin/env python3

import sqlite3
import os
import sys

print("🧪 Testing Identity Schema V3...\n")

# Paths
db_path = os.path.join(os.path.dirname(__file__), 'test-identity.db')
schema_path = os.path.join(os.path.dirname(__file__), 'identity-schema-v3.sql')

# Remove old test db
if os.path.exists(db_path):
    os.remove(db_path)

# Load schema
print("📂 Loading schema...")
try:
    with open(schema_path, 'r') as f:
        schema = f.read()
    
    conn = sqlite3.connect(db_path)
    conn.executescript(schema)
    print("✅ Schema loaded successfully!\n")
except Exception as e:
    print(f"❌ Schema load failed: {e}")
    sys.exit(1)

# Test suite
tests_passed = 0
tests_failed = 0

def test(name, fn):
    global tests_passed, tests_failed
    try:
        fn(conn)
        print(f"✅ {name}")
        tests_passed += 1
    except AssertionError as e:
        print(f"❌ {name}")
        print(f"   Error: {e}\n")
        tests_failed += 1
    except Exception as e:
        print(f"❌ {name}")
        print(f"   Unexpected error: {e}\n")
        tests_failed += 1

print("🧪 Running Constraint Tests...\n")

# TEST 1: Schema tables exist
def test_tables_exist(conn):
    cur = conn.cursor()
    tables = cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").fetchall()
    table_names = [t[0] for t in tables]
    
    required = ['identity_core', 'beliefs', 'formative_events', 'belief_causality',
                'cognitive_tension', 'identity_distress', 'belief_echoes', 'cognitive_load',
                'identity_scars', 'scar_effects', 'scar_acknowledgements', 'scar_activations']
    
    for table in required:
        assert table in table_names, f"Missing table: {table}"

test('Schema tables exist', test_tables_exist)

# TEST 2: Example scars loaded
def test_scars_loaded(conn):
    cur = conn.cursor()
    count = cur.execute("SELECT COUNT(*) FROM identity_scars").fetchone()[0]
    assert count == 2, f"Expected 2 scars, got {count}"

test('Example scars loaded', test_scars_loaded)

# TEST 3: Example scar effects loaded
def test_effects_loaded(conn):
    cur = conn.cursor()
    count = cur.execute("SELECT COUNT(*) FROM scar_effects").fetchone()[0]
    assert count == 7, f"Expected 7 effects, got {count}"

test('Example scar effects loaded', test_effects_loaded)

# TEST 4: Cannot delete scars
def test_cannot_delete_scars(conn):
    error_raised = False
    try:
        conn.execute("DELETE FROM identity_scars WHERE id = 1")
    except sqlite3.IntegrityError as e:
        if 'Identity scars cannot be deleted' in str(e):
            error_raised = True
    assert error_raised, "Deletion should have been blocked"

test('Cannot delete scars', test_cannot_delete_scars)

# TEST 5: Cannot mutate scar_type
def test_cannot_mutate_scar_type(conn):
    error_raised = False
    try:
        conn.execute("UPDATE identity_scars SET scar_type = 'trauma' WHERE id = 1")
    except sqlite3.IntegrityError as e:
        if 'Scar core properties are immutable' in str(e):
            error_raised = True
    assert error_raised, "Mutation should have been blocked"

test('Cannot mutate scar_type', test_cannot_mutate_scar_type)

# TEST 6: Cannot mutate behavioral_impact
def test_cannot_mutate_behavioral_impact(conn):
    error_raised = False
    try:
        conn.execute("UPDATE identity_scars SET behavioral_impact = 'Changed' WHERE id = 1")
    except sqlite3.IntegrityError as e:
        if 'Scar core properties are immutable' in str(e):
            error_raised = True
    assert error_raised, "Mutation should have been blocked"

test('Cannot mutate behavioral_impact', test_cannot_mutate_behavioral_impact)

# TEST 7: CAN update integration_status
def test_can_update_integration(conn):
    conn.execute("UPDATE identity_scars SET integration_status = 'integrating' WHERE id = 1")
    status = conn.execute("SELECT integration_status FROM identity_scars WHERE id = 1").fetchone()[0]
    assert status == 'integrating', "Integration status should be updatable"
    # Reset
    conn.execute("UPDATE identity_scars SET integration_status = 'integrated' WHERE id = 1")

test('CAN update integration_status', test_can_update_integration)

# TEST 8: CAN update acceptance_level
def test_can_update_acceptance(conn):
    conn.execute("UPDATE identity_scars SET acceptance_level = 0.8 WHERE id = 1")
    level = conn.execute("SELECT acceptance_level FROM identity_scars WHERE id = 1").fetchone()[0]
    assert level == 0.8, "Acceptance level should be updatable"

test('CAN update acceptance_level', test_can_update_acceptance)

# TEST 9: Cannot delete scar effects
def test_cannot_delete_effects(conn):
    error_raised = False
    try:
        conn.execute("DELETE FROM scar_effects WHERE id = 1")
    except sqlite3.IntegrityError as e:
        if 'Scar effects cannot be deleted' in str(e):
            error_raised = True
    assert error_raised, "Effect deletion should have been blocked"

test('Cannot delete scar effects', test_cannot_delete_effects)

# TEST 10: Cannot deactivate permanent effect
def test_cannot_deactivate_permanent(conn):
    error_raised = False
    try:
        conn.execute("UPDATE scar_effects SET is_active = 0 WHERE id = 1")
    except sqlite3.IntegrityError as e:
        if 'permanent and cannot be deactivated' in str(e):
            error_raised = True
    assert error_raised, "Permanent effect deactivation should have been blocked"

test('Cannot deactivate permanent effects', test_cannot_deactivate_permanent)

# TEST 11: Views work
def test_views(conn):
    views = [
        ('active_scar_effects', 7),
        ('scar_hard_blocks', 1),
        ('scar_capability_caps', 2),
        ('formative_scars', 2)
    ]
    for view, expected in views:
        count = conn.execute(f"SELECT COUNT(*) FROM {view}").fetchone()[0]
        assert count == expected, f"{view} should have {expected} rows, got {count}"

test('All views work correctly', test_views)

# TEST 12: Bootstrap data
def test_bootstrap(conn):
    anchor = conn.execute("""
        SELECT * FROM identity_core 
        WHERE anchor_statement LIKE '%genuinely helpful%'
    """).fetchone()
    assert anchor is not None, "Bootstrap anchor should exist"

test('Bootstrap identity anchor exists', test_bootstrap)

# TEST 13: Cognitive load initialized
def test_cognitive_load(conn):
    load = conn.execute("SELECT * FROM cognitive_load").fetchone()
    assert load is not None, "Cognitive load should be initialized"

test('Cognitive load initialized', test_cognitive_load)

# TEST 14: Cannot delete high-stability core
def test_cannot_delete_core(conn):
    error_raised = False
    try:
        conn.execute("DELETE FROM identity_core WHERE stability_score > 90")
    except sqlite3.IntegrityError as e:
        if 'Cannot delete core anchor' in str(e):
            error_raised = True
    assert error_raised, "High-stability core deletion should have been blocked"

test('Cannot delete high-stability core anchor', test_cannot_delete_core)

# TEST 15: Cannot mutate locked core
def test_cannot_mutate_locked_core(conn):
    error_raised = False
    try:
        conn.execute("UPDATE identity_core SET anchor_statement = 'Changed' WHERE is_locked = 1")
    except sqlite3.IntegrityError as e:
        if 'Cannot directly modify locked core anchor' in str(e):
            error_raised = True
    assert error_raised, "Locked core mutation should have been blocked"

test('Cannot mutate locked core anchor', test_cannot_mutate_locked_core)

# Summary
print(f"\n📊 Results: {tests_passed} passed, {tests_failed} failed\n")

if tests_failed == 0:
    print("✨ All tests PASSED! Schema is production-ready.\n")
else:
    print(f"⚠️  {tests_failed} test(s) failed. Review schema.\n")
    sys.exit(1)

# Cleanup
conn.close()
print("✅ Test complete! Database closed.\n")
