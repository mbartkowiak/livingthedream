import os
import sqlite3

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

DATABASE_PATH = os.getenv("DATABASE_PATH", "/app/data/zillow.db")

app = FastAPI(title="Home Price Lookup API", docs_url="/api/docs", redoc_url=None)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def db_ready() -> bool:
    if not os.path.exists(DATABASE_PATH):
        return False
    try:
        conn = get_conn()
        conn.execute("SELECT 1 FROM zip_data LIMIT 1")
        conn.close()
        return True
    except Exception:
        return False


@app.get("/api/health")
def health():
    return {"status": "ok", "db_ready": db_ready()}


@app.get("/api/status")
def status():
    if not db_ready():
        return {"seeded": False, "zip_count": 0, "data_as_of": None}
    conn = get_conn()
    try:
        count = conn.execute("SELECT COUNT(*) FROM zip_data").fetchone()[0]
        data_as_of = conn.execute("SELECT MAX(last_updated) FROM zip_data").fetchone()[0]
        income_count = conn.execute("SELECT COUNT(*) FROM zip_data WHERE avg_agi IS NOT NULL").fetchone()[0]
        return {"seeded": True, "zip_count": count, "data_as_of": data_as_of, "income_zip_count": income_count}
    finally:
        conn.close()


@app.get("/api/home-price")
def get_home_price(zip: str = Query(..., min_length=1, max_length=10)):
    zip_clean = zip.strip().zfill(5)
    if not zip_clean.isdigit() or len(zip_clean) != 5:
        raise HTTPException(status_code=400, detail="Invalid zip code — must be 5 digits")

    if not db_ready():
        raise HTTPException(
            status_code=503,
            detail="Database not seeded yet. Run: make seed",
        )

    conn = get_conn()
    try:
        row = conn.execute(
            "SELECT * FROM zip_data WHERE zip_code = ?", (zip_clean,)
        ).fetchone()
    finally:
        conn.close()

    if row is None:
        raise HTTPException(
            status_code=404,
            detail=f"No home price data found for ZIP code {zip_clean}. "
                   "Some rural areas may not have enough transactions for Zillow to report a value.",
        )

    # Convert to dict so missing columns (old schema) return None instead of crashing
    row_dict = dict(row)
    return {
        "zip_code": row_dict["zip_code"],
        "city": row_dict["city"],
        "state": row_dict["state"],
        "county": row_dict["county"],
        "metro": row_dict["metro"],
        "median_value": row_dict["median_value"],
        "last_updated": row_dict["last_updated"],
        "avg_rent": row_dict.get("avg_rent"),
        "avg_agi": row_dict.get("avg_agi"),
        "income_year": row_dict.get("income_year"),
    }
