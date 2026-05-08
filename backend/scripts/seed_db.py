#!/usr/bin/env python3
"""
Download Zillow ZHVI + ZORI + IRS SOI data and seed the local SQLite database.

Run once to populate, then monthly to refresh:
    make seed
"""
import io
import os
import sqlite3
import sys

import pandas as pd
import requests

DATABASE_PATH = os.getenv("DATABASE_PATH", "/app/data/zillow.db")

ZILLOW_ZHVI_URL = (
    "https://files.zillowstatic.com/research/public_csvs/zhvi/"
    "Zip_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv"
)
# Zillow changes these filenames periodically — try in order until one works
ZILLOW_ZORI_URLS = [
    "https://files.zillowstatic.com/research/public_csvs/zori/Zip_zori_sm_month.csv",
    "https://files.zillowstatic.com/research/public_csvs/zori/Zip_zori_uc_sfrcondomfr_sm_month.csv",
    "https://files.zillowstatic.com/research/public_csvs/zori/Zip_ZORI_AllHomesPlusMultifamily_Smoothed.csv",
]

IRS_YEARS = ["22", "21", "20"]
IRS_URL_TEMPLATE = "https://www.irs.gov/pub/irs-soi/{year}zpallagi.csv"

ZILLOW_META_COLS = {
    "RegionID", "SizeRank", "RegionName", "RegionType",
    "StateName", "State", "City", "Metro", "CountyName",
}


# ── helpers ────────────────────────────────────────────────────────────────

def stream_download(url: str, label: str) -> bytes:
    print(f"Downloading {label}…\n  {url}")
    resp = requests.get(url, timeout=180, stream=True)
    resp.raise_for_status()

    total = int(resp.headers.get("content-length", 0))
    chunks: list[bytes] = []
    received = 0
    for chunk in resp.iter_content(chunk_size=65_536):
        chunks.append(chunk)
        received += len(chunk)
        if total:
            pct = received / total * 100
            print(f"\r  {pct:5.1f}%  ({received // 1_024} KB / {total // 1_024} KB)", end="", flush=True)
    print()
    return b"".join(chunks)


def load_zillow_series(urls: list[str], label: str, value_col: str) -> pd.DataFrame:
    """Try each URL in order until one works, parse CSV, return zip_code + latest value."""
    raw = None
    for url in urls:
        try:
            raw = stream_download(url, label)
            break
        except requests.HTTPError as e:
            print(f"  {url} — {e}, trying next…")

    if raw is None:
        print(f"WARNING: Could not download {label} — will be blank.", file=sys.stderr)
        return pd.DataFrame(columns=["zip_code", value_col])

    df = pd.read_csv(io.BytesIO(raw), dtype={"RegionName": str})

    date_cols = [c for c in df.columns if c not in ZILLOW_META_COLS]
    if not date_cols:
        print(f"ERROR: No date columns found in {label} CSV.", file=sys.stderr)
        sys.exit(1)

    latest = date_cols[-1]
    print(f"Most recent {label} column: {latest}")

    out = df[["RegionName", latest]].copy()
    out = out.rename(columns={"RegionName": "zip_code", latest: value_col})
    out["zip_code"] = out["zip_code"].str.zfill(5)
    out = out.dropna(subset=[value_col])
    return out


# ── Zillow ZHVI (home prices + location metadata) ──────────────────────────

def load_zillow_home_prices() -> pd.DataFrame:
    raw = stream_download(ZILLOW_ZHVI_URL, "Zillow ZHVI (home prices)")
    df = pd.read_csv(io.BytesIO(raw), dtype={"RegionName": str})

    date_cols = [c for c in df.columns if c not in ZILLOW_META_COLS]
    if not date_cols:
        print("ERROR: No date columns found in Zillow ZHVI CSV.", file=sys.stderr)
        sys.exit(1)

    latest = date_cols[-1]
    print(f"Most recent ZHVI column: {latest}")

    out = df[["RegionName", "City", "State", "CountyName", "Metro", latest]].copy()
    out = out.rename(columns={
        "RegionName": "zip_code",
        "City": "city",
        "State": "state",
        "CountyName": "county",
        "Metro": "metro",
        latest: "median_value",
    })
    out["zip_code"] = out["zip_code"].str.zfill(5)
    out["last_updated"] = latest
    out = out.dropna(subset=["median_value"])
    return out


# ── IRS SOI ────────────────────────────────────────────────────────────────

def load_irs_income() -> tuple[pd.DataFrame, str]:
    for year in IRS_YEARS:
        url = IRS_URL_TEMPLATE.format(year=year)
        try:
            raw = stream_download(url, f"IRS SOI (tax year 20{year})")
        except requests.HTTPError as e:
            print(f"  Skipping 20{year}: {e}")
            continue

        df = pd.read_csv(io.BytesIO(raw), dtype={"zipcode": str, "ZIPCODE": str})
        df.columns = [c.lower() for c in df.columns]

        if "zipcode" not in df.columns:
            print(f"  Skipping 20{year}: 'zipcode' column not found.")
            continue

        df = df[~df["zipcode"].isin(["0", "00000"])]
        df["zipcode"] = df["zipcode"].str.zfill(5)

        if (df["agi_stub"] == 0).any():
            df = df[df["agi_stub"] == 0].copy()
        else:
            df = df[df["agi_stub"] > 0].groupby("zipcode", as_index=False).agg(
                n1=("n1", "sum"), a00100=("a00100", "sum")
            )

        df = df[df["n1"] > 0].copy()
        df["avg_agi"] = (df["a00100"] * 1_000 / df["n1"]).round(0)

        result = df[["zipcode", "avg_agi"]].rename(columns={"zipcode": "zip_code"})
        print(f"IRS data loaded: {len(result):,} ZIP codes  (tax year 20{year})")
        return result, f"20{year}"

    print("WARNING: Could not download IRS SOI data — income will be blank.", file=sys.stderr)
    return pd.DataFrame(columns=["zip_code", "avg_agi"]), ""


# ── seed ───────────────────────────────────────────────────────────────────

def seed() -> None:
    os.makedirs(os.path.dirname(os.path.abspath(DATABASE_PATH)), exist_ok=True)

    zhvi_df = load_zillow_home_prices()
    zori_df = load_zillow_series(ZILLOW_ZORI_URLS, "Zillow ZORI (rents)", "avg_rent")
    irs_df, income_year = load_irs_income()

    # Left-join everything onto ZHVI — missing data becomes NULL
    merged = zhvi_df.merge(zori_df, on="zip_code", how="left")
    merged = merged.merge(irs_df, on="zip_code", how="left")
    merged["income_year"] = income_year if income_year else None

    print("Writing to database…")
    conn = sqlite3.connect(DATABASE_PATH)

    conn.execute("DROP TABLE IF EXISTS zip_data")
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
            income_year  TEXT
        )
    """)

    rows = [
        (
            row.zip_code,
            str(row.city or ""),
            str(row.state or ""),
            str(row.county or ""),
            str(row.metro or ""),
            float(row.median_value),
            row.last_updated,
            float(row.avg_rent) if pd.notna(row.avg_rent) else None,
            float(row.avg_agi) if pd.notna(row.avg_agi) else None,
            row.income_year if pd.notna(row.income_year) else None,
        )
        for row in merged.itertuples(index=False)
    ]

    conn.executemany("""
        INSERT OR REPLACE INTO zip_data
            (zip_code, city, state, county, metro, median_value, last_updated,
             avg_rent, avg_agi, income_year)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, rows)
    conn.commit()
    conn.close()

    rent_count = sum(1 for r in rows if r[7] is not None)
    income_count = sum(1 for r in rows if r[8] is not None)
    print(f"\nDone.")
    print(f"  {len(rows):,} ZIP codes with home price data")
    print(f"  {rent_count:,} ZIP codes with rent data")
    print(f"  {income_count:,} ZIP codes with income data")
    print(f"  → {DATABASE_PATH}")


if __name__ == "__main__":
    seed()
