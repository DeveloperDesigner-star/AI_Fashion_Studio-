#!/usr/bin/env python
"""Create the schema, seed the catalogue and optionally create an admin user.

Usage (from backend/):
    python scripts/init_db.py                     # migrate + seed catalogue
    python scripts/init_db.py --demo-marketplace  # + sample studios (dev only)
    python scripts/init_db.py --admin-email you@example.com --admin-password '...'
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from sqlalchemy import select  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.core.security import hash_password, password_problems  # noqa: E402
from app.db.seed import seed_catalog, seed_demo_marketplace  # noqa: E402
from app.db.session import SessionLocal  # noqa: E402
from app.models.profile import Profile  # noqa: E402
from app.models.user import User  # noqa: E402


def run_migrations() -> None:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    command.upgrade(config, "head")


def ensure_admin(email: str, password: str, full_name: str) -> None:
    problems = password_problems(password)
    if problems:
        raise SystemExit("Admin password is too weak: " + ", ".join(problems))
    db = SessionLocal()
    try:
        existing = db.scalar(select(User).where(User.email == email.lower()))
        if existing:
            existing.role = "admin"
            existing.hashed_password = hash_password(password)
            existing.is_active = True
            db.commit()
            print(f"Updated existing user {email} to admin.")
            return
        user = User(
            email=email.lower(),
            hashed_password=hash_password(password),
            full_name=full_name,
            role="admin",
            is_verified=True,
        )
        db.add(user)
        db.flush()
        db.add(Profile(user_id=user.id, display_name=full_name.split(" ")[0]))
        db.commit()
        print(f"Created admin account {email}.")
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Initialise the AI Fashion Studio database")
    parser.add_argument("--skip-migrate", action="store_true", help="Do not run Alembic migrations")
    parser.add_argument("--demo-marketplace", action="store_true", help="Seed two sample studios")
    parser.add_argument("--admin-email")
    parser.add_argument("--admin-password")
    parser.add_argument("--admin-name", default="Studio Admin")
    args = parser.parse_args()

    print(f"Database: {settings.database_url.split('@')[-1]}")
    if not args.skip_migrate:
        run_migrations()
        print("Migrations applied.")

    db = SessionLocal()
    try:
        result = seed_catalog(db)
        print(f"Catalogue seeded: {result}")
        if args.demo_marketplace:
            if settings.is_production:
                raise SystemExit("Refusing to seed demo marketplace data in production.")
            print(f"Demo studios added: {seed_demo_marketplace(db)}")
    finally:
        db.close()

    if args.admin_email and args.admin_password:
        ensure_admin(args.admin_email, args.admin_password, args.admin_name)


if __name__ == "__main__":
    main()
