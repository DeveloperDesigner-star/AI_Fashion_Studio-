#!/usr/bin/env sh
# Apply migrations, then serve. Safe to restart: migrations are idempotent.
set -eu

echo "[entrypoint] applying database migrations"
python -m alembic upgrade head

if [ "${SEED_CATALOGUE:-true}" = "true" ]; then
  echo "[entrypoint] ensuring catalogue seed data"
  python scripts/init_db.py --skip-migrate
fi

if [ -n "${BOOTSTRAP_ADMIN_EMAIL:-}" ] || [ -n "${BOOTSTRAP_ADMIN_PASSWORD:-}" ]; then
  if [ -z "${BOOTSTRAP_ADMIN_EMAIL:-}" ] || [ -z "${BOOTSTRAP_ADMIN_PASSWORD:-}" ]; then
    echo "[entrypoint] BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD must both be set" >&2
    exit 1
  fi
  echo "[entrypoint] creating or updating the bootstrap administrator"
  python scripts/create_admin.py \
    --email "$BOOTSTRAP_ADMIN_EMAIL" \
    --password "$BOOTSTRAP_ADMIN_PASSWORD" \
    --name "${BOOTSTRAP_ADMIN_NAME:-Studio Admin}"
fi

echo "[entrypoint] starting API on port ${PORT:-8000}"
exec python -m uvicorn app.main:app \
  --host 0.0.0.0 \
  --port "${PORT:-8000}" \
  --workers "${WEB_CONCURRENCY:-2}" \
  --proxy-headers \
  --forwarded-allow-ips="*"
