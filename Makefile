SHELL := /bin/bash
BACKEND := backend
FRONTEND := frontend
PY := .venv/bin/python
PIP := .venv/bin/pip

.PHONY: help setup install backend-install frontend-install migrate seed admin dev-api dev-web test test-api test-web lint build check db-up db-down clean

help:
	@echo "AI Fashion Studio — available targets"
	@echo "  make setup          Create the virtualenv, install backend + frontend dependencies"
	@echo "  make db-up          Start PostgreSQL via docker compose"
	@echo "  make migrate        Apply Alembic migrations"
	@echo "  make seed           Seed the garment catalogue"
	@echo "  make admin EMAIL=you@example.com PASSWORD='StrongPass123'"
	@echo "  make dev-api        Run the FastAPI server on :8000"
	@echo "  make dev-web        Run the Vite dev server on :5173"
	@echo "  make test           Run backend tests + frontend unit tests"
	@echo "  make lint           Ruff + ESLint + TypeScript checks"
	@echo "  make build          Production frontend build"
	@echo "  make check          lint + tests + build (pre-commit gate)"

setup: install
	@test -f .env || cp .env.example .env && echo "Created .env from .env.example — set SECRET_KEY and DATABASE_URL."

install: backend-install frontend-install

backend-install:
	@test -d .venv || python3 -m venv .venv
	$(PIP) install --quiet --upgrade pip
	$(PIP) install --quiet -r $(BACKEND)/requirements-dev.txt

frontend-install:
	cd $(FRONTEND) && npm install

db-up:
	docker compose up -d db

db-down:
	docker compose down

migrate:
	cd $(BACKEND) && ../$(PY) -m alembic upgrade head

seed:
	cd $(BACKEND) && ../$(PY) scripts/init_db.py --skip-migrate

admin:
	@test -n "$(EMAIL)" || (echo "EMAIL=... PASSWORD=... required" && exit 1)
	cd $(BACKEND) && ../$(PY) scripts/create_admin.py --email "$(EMAIL)" --password "$(PASSWORD)" --name "$(or $(NAME),Studio Admin)"

dev-api:
	cd $(BACKEND) && ../$(PY) -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

dev-web:
	cd $(FRONTEND) && npm run dev

test: test-api test-web

test-api:
	cd $(BACKEND) && ../$(PY) -m pytest

test-web:
	cd $(FRONTEND) && npm run test -- --run

lint:
	cd $(BACKEND) && ../$(PY) -m ruff check app tests
	cd $(FRONTEND) && npm run lint && npm run typecheck

build:
	cd $(FRONTEND) && npm run build

check: lint test build

clean:
	rm -rf $(FRONTEND)/dist $(FRONTEND)/node_modules/.vite
	find . -name "__pycache__" -type d -prune -exec rm -rf {} +
