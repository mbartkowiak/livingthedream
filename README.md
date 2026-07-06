# Living the Dream — US Home Price & Affordability Lookup

Search any US ZIP code (or city name) to see its median home value, average rent,
average household income, and 10-year price trend — then get a full affordability
verdict, a rent-vs-buy break-even analysis, a line-item monthly budget you can
customize, side-by-side ZIP comparisons, and a reverse search that finds every
ZIP code your salary can afford.

**Data sources:** Zillow ZHVI (home values + history) · Zillow ZORI (rents) ·
IRS SOI (average AGI per ZIP) · Census gazetteer (ZIP coordinates) · FRED
(live 30-yr mortgage rate) · Tax Foundation (property tax rates) · BEA Regional
Price Parities (regional cost scaling) · BLS/EIA/USDA/KFF and others for budget
line items. Not financial advice.

## Features

- **Home Lookup** — value/rent/income stats, 10-yr price chart with 1-yr & 5-yr
  appreciation, rent-vs-buy break-even card (equity, appreciation, opportunity
  cost), and a map of nearby ZIPs colored cheaper/similar/pricier with
  click-through.
- **Budget Analysis** — 19-category line-item budget for the area's average
  earner vs. the national median. Household presets (single / couple / family),
  single vs. married-filing-jointly taxes, per-state property tax and regional
  price scaling, and click-to-edit amounts (saved in your browser).
- **Compare ZIPs** — up to 3 areas side by side, including the salary each one
  requires under the full budget model.
- **Where Can I Afford?** — enter a salary, get every ZIP your budget clears
  (computed per state), with state counts and the best areas inside budget.
- **Shareable URLs** — `/?zip=90210&tab=budget` restores the view.

## Architecture

```
browser ──► nginx (:80)
              ├── /        React + Vite + Tailwind frontend
              └── /api/    FastAPI backend ──► SQLite (zillow.db, docker volume)
                                                ▲
                                     scripts/seed_db.py
                              (Zillow + IRS + Census downloads)
```

- `frontend/` — React app. All budget/tax/affordability math lives in
  `src/utils/` (`taxCalc`, `budgetCalc`, `affordability`, `rentVsBuy`,
  `stateData`) — the backend never re-implements it; the affordability finder
  sends per-state price caps computed client-side.
- `backend/` — FastAPI (`main.py`): `/api/home-price`, `/api/history`,
  `/api/search-city`, `/api/nearby`, `/api/mortgage-rate` (FRED, cached 12h),
  `POST /api/affordable-zips`, `/api/status`, `/api/health`.
- `nginx/` — reverse proxy; prod config also serves the built frontend.

## Quickstart (local dev)

Requires Docker + Docker Compose.

```sh
make up      # build & start nginx + frontend (vite dev server) + backend
make seed    # first time only: download data & populate SQLite (~10 min)
```

App: http://localhost · API docs: http://localhost/api/docs

> **Upgrading from an older database?** Re-run `make seed` — the price-history
> table and ZIP coordinates were added to the schema. The API tolerates old
> databases (trend chart and nearby-ZIP layer just stay empty until reseeded).

Without docker: `uvicorn main:app` in `backend/` (set `DATABASE_PATH`) and
`npm run dev` in `frontend/` — vite proxies `/api` to `localhost:8000`.

Other targets: `make down`, `make logs`, `make shell-backend`, and `prod-*`
variants for the production compose file.

## Tests

```sh
cd frontend && npm test          # vitest — tax/budget/affordability/break-even engine
cd backend && python -m pytest   # FastAPI endpoints (needs requirements-dev.txt)
```

CI runs both suites plus the TypeScript build on every push to `main`; the
deploy job to the Azure VM only runs if they pass
(`.github/workflows/deploy.yml`).

## Refreshing data

Zillow publishes monthly; rerun `make seed` (or `make prod-seed`) to refresh.
Tax brackets, property-tax rates, and RPP tables are constants in
`frontend/src/utils/` — update annually (sources are cited inline).
