from unittest.mock import patch

from fastapi.testclient import TestClient

import main
from main import app

client = TestClient(app)


def test_health():
    resp = client.get("/api/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["db_ready"] is True


def test_status_reports_seeded():
    resp = client.get("/api/status")
    assert resp.status_code == 200
    body = resp.json()
    assert body["seeded"] is True
    assert body["zip_count"] == 5
    assert body["income_zip_count"] == 5


def test_known_zip_returns_full_record():
    resp = client.get("/api/home-price", params={"zip": "90210"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["zip_code"] == "90210"
    assert body["city"] == "Beverly Hills"
    assert body["state"] == "CA"
    assert body["median_value"] == 3_500_000.0
    assert body["avg_rent"] == 5_800.0
    assert body["avg_agi"] == 750_000.0
    assert body["income_year"] == "2022"
    assert body["latitude"] == 34.1030
    assert body["longitude"] == -118.4105


def test_zip_without_coordinates_returns_null_latlng():
    resp = client.get("/api/home-price", params={"zip": "59254"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["latitude"] is None
    assert body["avg_rent"] is None


def test_short_zip_is_left_padded():
    # "1234" → "01234"; not in the db, but must be treated as a valid zip (404, not 400)
    resp = client.get("/api/home-price", params={"zip": "1234"})
    assert resp.status_code == 404
    assert "01234" in resp.json()["detail"]


def test_non_numeric_zip_rejected():
    resp = client.get("/api/home-price", params={"zip": "abcde"})
    assert resp.status_code == 400


def test_unknown_zip_returns_404():
    resp = client.get("/api/home-price", params={"zip": "99999"})
    assert resp.status_code == 404


def test_missing_zip_param_rejected():
    resp = client.get("/api/home-price")
    assert resp.status_code == 422


# ── /api/history ────────────────────────────────────────────────────────────

def test_history_returns_sorted_series():
    resp = client.get("/api/history", params={"zip": "90210"})
    assert resp.status_code == 200
    series = resp.json()["series"]
    assert len(series) == 3
    assert series[0]["month"] == "2025-05-31"
    assert series[-1]["value"] == 3_500_000.0


def test_history_empty_for_zip_without_data():
    resp = client.get("/api/history", params={"zip": "77494"})
    assert resp.status_code == 200
    assert resp.json()["series"] == []


# ── /api/search-city ────────────────────────────────────────────────────────

def test_search_city_prefix_match():
    resp = client.get("/api/search-city", params={"q": "bever"})
    assert resp.status_code == 200
    results = resp.json()["results"]
    assert len(results) == 2
    assert {r["zip_code"] for r in results} == {"90210", "90211"}
    assert results[0]["city"] == "Beverly Hills"


def test_search_city_no_match():
    resp = client.get("/api/search-city", params={"q": "zzzzz"})
    assert resp.status_code == 200
    assert resp.json()["results"] == []


def test_search_city_requires_min_length():
    resp = client.get("/api/search-city", params={"q": "b"})
    assert resp.status_code == 422


# ── /api/nearby ─────────────────────────────────────────────────────────────

def test_nearby_finds_neighbor_within_radius():
    resp = client.get("/api/nearby", params={"zip": "90210", "radius": 25})
    assert resp.status_code == 200
    body = resp.json()
    assert body["center"]["latitude"] == 34.1030
    zips = [r["zip_code"] for r in body["results"]]
    assert "90211" in zips          # ~3 miles away
    assert "77494" not in zips      # Texas is not within 25 miles
    assert body["results"][0]["distance_miles"] < 25


def test_nearby_without_coordinates_returns_empty():
    resp = client.get("/api/nearby", params={"zip": "59254"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["center"] is None
    assert body["results"] == []


# ── /api/mortgage-rate ──────────────────────────────────────────────────────

def test_mortgage_rate_parses_fred_csv():
    class FakeResp:
        text = "observation_date,MORTGAGE30US\n2026-06-25,6.72\n2026-07-02,6.68\n"
        def raise_for_status(self):
            pass

    main._rate_cache.update({"rate": None, "as_of": None, "fetched_at": 0.0})
    with patch.object(main.requests, "get", return_value=FakeResp()):
        resp = client.get("/api/mortgage-rate")
    assert resp.status_code == 200
    body = resp.json()
    assert body["rate"] == 6.68
    assert body["as_of"] == "2026-07-02"


def test_mortgage_rate_survives_fetch_failure():
    main._rate_cache.update({"rate": None, "as_of": None, "fetched_at": 0.0})
    with patch.object(main.requests, "get", side_effect=Exception("offline")):
        resp = client.get("/api/mortgage-rate")
    assert resp.status_code == 200
    assert resp.json()["rate"] is None


# ── /api/affordable-zips ────────────────────────────────────────────────────

def test_affordable_zips_buy_filters_by_state_threshold():
    resp = client.post("/api/affordable-zips", json={
        "mode": "buy",
        "thresholds": {"TX": 300_000, "CA": 300_000},
    })
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["results"][0]["zip_code"] == "79936"   # El Paso ≤ $300k; Katy is $420k
    assert body["by_state"] == [{"state": "TX", "count": 1}]


def test_affordable_zips_rent_mode_ignores_null_rent():
    resp = client.post("/api/affordable-zips", json={
        "mode": "rent",
        "thresholds": {"TX": 2_500, "MT": 2_500},
    })
    assert resp.status_code == 200
    body = resp.json()
    zips = {r["zip_code"] for r in body["results"]}
    assert zips == {"77494", "79936"}   # Plentywood MT has no rent data


def test_affordable_zips_sorted_by_value_desc_and_state_filter():
    resp = client.post("/api/affordable-zips", json={
        "mode": "buy",
        "thresholds": {"TX": 500_000, "CA": 4_000_000},
        "state": "TX",
    })
    assert resp.status_code == 200
    body = resp.json()
    assert [r["zip_code"] for r in body["results"]] == ["77494", "79936"]


def test_affordable_zips_rejects_bad_mode():
    resp = client.post("/api/affordable-zips", json={
        "mode": "steal", "thresholds": {"TX": 100},
    })
    assert resp.status_code == 422
