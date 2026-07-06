import math
import os
import sqlite3
import time

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Literal, Optional

import requests

DATABASE_PATH = os.getenv("DATABASE_PATH", "/app/data/zillow.db")

FRED_MORTGAGE_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=MORTGAGE30US"
RATE_CACHE_TTL = 12 * 3600  # refresh the FRED rate at most twice a day

app = FastAPI(title="Home Price Lookup API", docs_url="/api/docs", redoc_url=None)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
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


def clean_zip(zip_raw: str) -> str:
    zip_clean = zip_raw.strip().zfill(5)
    if not zip_clean.isdigit() or len(zip_clean) != 5:
        raise HTTPException(status_code=400, detail="Invalid zip code — must be 5 digits")
    return zip_clean


def require_db() -> None:
    if not db_ready():
        raise HTTPException(status_code=503, detail="Database not seeded yet. Run: make seed")


def row_to_result(row_dict: dict) -> dict:
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
        # Older databases predate these columns — reseed to populate them
        "latitude": row_dict.get("latitude"),
        "longitude": row_dict.get("longitude"),
    }


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
    zip_clean = clean_zip(zip)
    require_db()

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

    return row_to_result(dict(row))


@app.get("/api/history")
def get_history(zip: str = Query(..., min_length=1, max_length=10)):
    """Monthly ZHVI series for a ZIP (up to 10 years). Empty if db predates history."""
    zip_clean = clean_zip(zip)
    require_db()

    conn = get_conn()
    try:
        rows = conn.execute(
            "SELECT month, value FROM zip_history WHERE zip_code = ? ORDER BY month",
            (zip_clean,),
        ).fetchall()
    except sqlite3.OperationalError:
        return {"zip_code": zip_clean, "series": []}
    finally:
        conn.close()

    return {
        "zip_code": zip_clean,
        "series": [{"month": r["month"], "value": r["value"]} for r in rows],
    }


@app.get("/api/search-city")
def search_city(q: str = Query(..., min_length=2, max_length=60)):
    """Autocomplete: ZIPs whose city name starts with the query."""
    require_db()
    term = q.strip()
    if not term:
        return {"results": []}

    conn = get_conn()
    try:
        rows = conn.execute(
            """
            SELECT zip_code, city, state, median_value
            FROM zip_data
            WHERE city LIKE ?
            ORDER BY (city = ?) DESC, city, zip_code
            LIMIT 8
            """,
            (f"{term}%", term),
        ).fetchall()
    finally:
        conn.close()

    return {"results": [dict(r) for r in rows]}


def _haversine_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 3958.8
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


@app.get("/api/nearby")
def get_nearby(
    zip: str = Query(..., min_length=1, max_length=10),
    radius: float = Query(25, ge=1, le=100),
    limit: int = Query(40, ge=1, le=200),
):
    """ZIPs within `radius` miles of the given ZIP, nearest first."""
    zip_clean = clean_zip(zip)
    require_db()

    conn = get_conn()
    try:
        try:
            center = conn.execute(
                "SELECT latitude, longitude FROM zip_data WHERE zip_code = ?",
                (zip_clean,),
            ).fetchone()
        except sqlite3.OperationalError:
            return {"center": None, "results": []}  # db predates coordinates — reseed

        if center is None or center["latitude"] is None:
            return {"center": None, "results": []}

        lat, lng = center["latitude"], center["longitude"]
        # ~1 degree latitude ≈ 69 miles; pad the box, exact-filter below
        deg = radius / 69.0 * 1.2
        lon_deg = deg / max(0.2, math.cos(math.radians(lat)))
        rows = conn.execute(
            """
            SELECT zip_code, city, state, median_value, avg_rent, avg_agi, latitude, longitude
            FROM zip_data
            WHERE latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?
              AND zip_code != ?
            """,
            (lat - deg, lat + deg, lng - lon_deg, lng + lon_deg, zip_clean),
        ).fetchall()
    finally:
        conn.close()

    results = []
    for r in rows:
        d = _haversine_miles(lat, lng, r["latitude"], r["longitude"])
        if d <= radius:
            item = dict(r)
            item["distance_miles"] = round(d, 1)
            results.append(item)
    results.sort(key=lambda x: x["distance_miles"])

    return {"center": {"latitude": lat, "longitude": lng}, "results": results[:limit]}


_rate_cache: dict = {"rate": None, "as_of": None, "fetched_at": 0.0}


@app.get("/api/mortgage-rate")
def mortgage_rate():
    """Current average 30-yr fixed rate (FRED MORTGAGE30US), cached for 12h."""
    now = time.time()
    if now - _rate_cache["fetched_at"] > RATE_CACHE_TTL:
        _rate_cache["fetched_at"] = now  # even on failure, don't retry every request
        try:
            resp = requests.get(FRED_MORTGAGE_URL, timeout=10)
            resp.raise_for_status()
            for line in reversed(resp.text.strip().splitlines()):
                date_str, _, value = line.partition(",")
                try:
                    _rate_cache["rate"] = float(value)
                    _rate_cache["as_of"] = date_str
                    break
                except ValueError:
                    continue  # header row or missing "." observation
        except Exception:
            pass  # keep last known value (or None)

    return {"rate": _rate_cache["rate"], "as_of": _rate_cache["as_of"], "source": "FRED MORTGAGE30US"}


class AffordableZipsRequest(BaseModel):
    """Thresholds are computed client-side by the budget engine (single source of
    truth): max affordable home price (buy) or monthly rent (rent) per state."""
    mode: Literal["buy", "rent"]
    thresholds: dict[str, float] = Field(..., min_length=1, max_length=60)
    state: Optional[str] = None
    limit: int = Field(200, ge=1, le=500)


@app.post("/api/affordable-zips")
def affordable_zips(req: AffordableZipsRequest):
    require_db()

    states = {s.upper(): v for s, v in req.thresholds.items() if v > 0}
    if req.state:
        st = req.state.upper()
        states = {st: states[st]} if st in states else {}
    if not states:
        return {"total": 0, "by_state": [], "results": []}

    value_col = "median_value" if req.mode == "buy" else "avg_rent"
    clauses, params = [], []
    for st, threshold in states.items():
        clauses.append(f"(state = ? AND {value_col} IS NOT NULL AND {value_col} <= ?)")
        params.extend([st, threshold])
    where = " OR ".join(clauses)

    conn = get_conn()
    try:
        total = conn.execute(f"SELECT COUNT(*) FROM zip_data WHERE {where}", params).fetchone()[0]
        by_state = conn.execute(
            f"SELECT state, COUNT(*) AS count FROM zip_data WHERE {where} GROUP BY state ORDER BY count DESC",
            params,
        ).fetchall()
        # Highest value first = "the best area you can afford"
        rows = conn.execute(
            f"""
            SELECT zip_code, city, state, metro, median_value, avg_rent, avg_agi
            FROM zip_data WHERE {where}
            ORDER BY {value_col} DESC
            LIMIT ?
            """,
            params + [req.limit],
        ).fetchall()
    finally:
        conn.close()

    return {
        "total": total,
        "by_state": [dict(r) for r in by_state],
        "results": [dict(r) for r in rows],
    }
