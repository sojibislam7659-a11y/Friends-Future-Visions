#!/usr/bin/env python3
"""Parse every committed Supabase migration with PostgreSQL's SQL grammar."""

from pathlib import Path
import sys

from pglast import parse_sql


ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "supabase" / "migrations"

# This historical file is a PL/pgSQL function-body fragment, not a standalone
# migration (it starts with BEGIN/IF rather than CREATE FUNCTION). It is already
# represented in the applied Development history; preserve it unchanged and
# exclude it from standalone migration parsing.
KNOWN_NON_STANDALONE = {
    "20261119190618_use_invoker_for_financial_summary_20261120.sql",
}


def main() -> int:
    files = sorted(MIGRATIONS.glob("*.sql"))
    if not files:
        print("ERROR: no SQL migration files found", file=sys.stderr)
        return 1

    failed = []
    skipped = []
    for path in files:
        if path.name in KNOWN_NON_STANDALONE:
            skipped.append(path.name)
            continue
        try:
            parse_sql(path.read_text(encoding="utf-8"))
        except Exception as exc:  # parser errors include the failing SQL location
            failed.append((path.relative_to(ROOT), str(exc)))

    if failed:
        for path, error in failed:
            print(f"FAIL {path}: {error}", file=sys.stderr)
        return 1

    checked = len(files) - len(skipped)
    print(f"PostgreSQL grammar check passed for {checked} standalone migration files.")
    if skipped:
        print("Explicitly skipped historical non-standalone fragments: " + ", ".join(skipped))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
