#!/usr/bin/env python3
"""Parse every committed Supabase migration with PostgreSQL's SQL grammar."""

from pathlib import Path
import re
import sys

from pglast import parse_plpgsql, parse_sql


ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "supabase" / "migrations"

# This historical file is a PL/pgSQL function-body fragment, not a standalone
# migration (it starts with BEGIN/IF rather than CREATE FUNCTION). It is already
# represented in the applied Development history; preserve it unchanged and
# exclude it from standalone migration parsing.
PLPGSQL_FUNCTION = re.compile(
    r"(?is)\\bCREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\b.*?"
    r"\\bLANGUAGE\\s+plpgsql\\b.*?AS\\s+\\$function\\$.*?\\$function\\$;"
)

KNOWN_NON_STANDALONE = {
    "20261119190618_use_invoker_for_financial_summary_20261120.sql",
}


def main() -> int:
    files = sorted(MIGRATIONS.glob("*.sql"))
    verification = ROOT / "supabase" / "verification"
    files += sorted(verification.glob("*.sql")) if verification.exists() else []
    if not files:
        print("ERROR: no SQL migration or verification files found", file=sys.stderr)
        return 1

    failed = []
    skipped = []
    plpgsql_checked = 0
    for path in files:
        if path.name in KNOWN_NON_STANDALONE:
            skipped.append(path.name)
            continue
        try:
            source = path.read_text(encoding="utf-8")
            parse_sql(source)
            for match in PLPGSQL_FUNCTION.finditer(source):
                parse_plpgsql(match.group(0))
                plpgsql_checked += 1
        except Exception as exc:  # parser errors include the failing SQL location
            failed.append((path.relative_to(ROOT), str(exc)))

    if failed:
        for path, error in failed:
            print(f"FAIL {path}: {error}", file=sys.stderr)
        return 1

    checked = len(files) - len(skipped)
    migration_count = sum(1 for path in files if path.parent == MIGRATIONS) - len(skipped)
    verification_count = sum(1 for path in files if path.parent == verification)
    print(f"PostgreSQL grammar check passed for {migration_count} standalone migration files and {verification_count} verification files.")
    print(f"PL/pgSQL body parser passed for {plpgsql_checked} function definitions.")
    if skipped:
        print("Explicitly skipped historical non-standalone fragments: " + ", ".join(skipped))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
