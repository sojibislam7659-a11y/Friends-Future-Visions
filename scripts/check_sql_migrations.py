#!/usr/bin/env python3
"""Parse every committed Supabase migration with PostgreSQL's SQL grammar."""

from pathlib import Path
import sys

from pglast import parse_sql


ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "supabase" / "migrations"


def main() -> int:
    files = sorted(MIGRATIONS.glob("*.sql"))
    if not files:
        print("ERROR: no SQL migration files found", file=sys.stderr)
        return 1

    failed = []
    for path in files:
        try:
            parse_sql(path.read_text(encoding="utf-8"))
        except Exception as exc:  # parser errors include the failing SQL location
            failed.append((path.relative_to(ROOT), str(exc)))

    if failed:
        for path, error in failed:
            print(f"FAIL {path}: {error}", file=sys.stderr)
        return 1

    print(f"PostgreSQL grammar check passed for {len(files)} migration files.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
