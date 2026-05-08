.PHONY: up down seed logs shell-backend prod-up prod-down prod-seed prod-logs

# ── Local dev ──────────────────────────────────────────────────────────────

up:
	docker compose up --build -d
	@echo ""
	@echo "App running at http://localhost"
	@echo "API docs at  http://localhost/api/docs"
	@echo ""
	@echo "First time? Run: make seed"

down:
	docker compose down

seed:
	docker compose exec backend python scripts/seed_db.py

logs:
	docker compose logs -f

shell-backend:
	docker compose exec backend bash

# ── Production (Azure VM) ──────────────────────────────────────────────────

prod-up:
	docker compose -f docker-compose.prod.yml up --build -d
	@echo ""
	@echo "Production app running at http://localhost"
	@echo ""
	@echo "First time? Run: make prod-seed"

prod-down:
	docker compose -f docker-compose.prod.yml down

prod-seed:
	docker compose -f docker-compose.prod.yml exec backend python scripts/seed_db.py

prod-logs:
	docker compose -f docker-compose.prod.yml logs -f
