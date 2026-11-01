#!/usr/bin/env python
"""Promote or create an administrator account.

    python scripts/create_admin.py --email admin@example.com --password 'StrongPass123' --name 'Studio Admin'
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))
sys.path.insert(0, str(BACKEND_DIR / "scripts"))

from init_db import ensure_admin  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="Create or promote an admin user")
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--name", default="Studio Admin")
    args = parser.parse_args()
    ensure_admin(args.email, args.password, args.name)


if __name__ == "__main__":
    main()
