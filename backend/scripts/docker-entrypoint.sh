#!/usr/bin/env sh
# Apply migrations, then serve. Safe to restart: migrations are idempotent.
set -eu

echo "[entrypoint] applying database migrations"
python -m alembic upgrade head

if [ "${SEED_CATALOGUE:-true}" = "true" ]; then
  echo "[entrypoint] ensuring catalogue seed data"
  python scripts/init_db.py --skip-migrate
fi

echo "[entrypoint] starting API on port ${PORT:-8000}"
exec python -m uvicorn app.main:app \
  --host 0.0.0.0 \
  --port "${PORT:-8000}" \
  --workers "${WEB_CONCURRENCY:-2}" \
  --proxy-headers \
  --forwarded-allow-ips="*"
