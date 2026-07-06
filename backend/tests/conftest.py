import os
import sqlite3
import sys
import tempfile

# Point the app at a throwaway database BEFORE main.py is imported,
# since main.py reads DATABASE_PATH at import time.
_db_path = os.path.join(tempfile.mkdtemp(), "test_zillow.db")
os.environ["DATABASE_PATH"] = _db_path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest

ZIP_ROWS = [
    # zip, city, state, county, metro, median_value, last_updated, avg_rent, avg_agi, income_year, lat, lng
    ("90210", "Beverly Hills", "CA", "Los Angeles County",
     "Los Angeles-Long Beach-Anaheim, CA", 3_500_000.0, "2026-05-31",
     5_800.0, 750_000.0, "2022", 34.1030, -118.4105),
    ("90211", "Beverly Hills", "CA", "Los Angeles County",
     "Los Angeles-Long Beach-Anaheim, CA", 2_200_000.0, "2026-05-31",
     4_100.0, 410_000.0, "2022", 34.0650, -118.3830),
    ("77494", "Katy", "TX", "Fort Bend County",
     "Houston-The Woodlands-Sugar Land, TX", 420_000.0, "2026-05-31",
     2_300.0, 145_000.0, "2022", 29.7420, -95.8250),
    ("79936", "El Paso", "TX", "El Paso County",
     "El Paso, TX", 210_000.0, "2026-05-31",
     1_500.0, 62_000.0, "2022", 31.7660, -106.3010),
    # No coords / no rent — exercises null handling
    ("59254", "Plentywood", "MT", "Sheridan County",
     "", 180_000.0, "2026-05-31", None, 55_000.0, "2022", None, None),
]

HISTORY_ROWS = [
    ("90210", "2025-05-31", 3_300_000.0),
    ("90210", "2025-11-30", 3_400_000.0),
    ("90210", "2026-05-31", 3_500_000.0),
]


@pytest.fixture(scope="session", autouse=True)
def seeded_db():
    conn = sqlite3.connect(_db_path)
    conn.execute("""
        CREATE TABLE zip_data (
            zip_code     TEXT PRIMARY KEY,
            city         TEXT,
            state        TEXT,
            county       TEXT,
            metro        TEXT,
            median_value REAL,
            last_updated TEXT,
            avg_rent     REAL,
            avg_agi      REAL,
            income_year  TEXT,
            latitude     REAL,
            longitude    REAL
        )
    """)
    conn.executemany(
        "INSERT INTO zip_data VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", ZIP_ROWS
    )
    conn.execute("""
        CREATE TABLE zip_history (
            zip_code TEXT NOT NULL,
            month    TEXT NOT NULL,
            value    REAL NOT NULL,
            PRIMARY KEY (zip_code, month)
        )
    """)
    conn.executemany("INSERT INTO zip_history VALUES (?, ?, ?)", HISTORY_ROWS)
    conn.commit()
    conn.close()
    yield
