#!/usr/bin/env python3
"""Parse Supabase migrations, PL/pgSQL functions, and DO blocks."""

from pathlib import Path
import re
import sys

from pglast import parse_plpgsql, parse_sql, split


ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "supabase" / "migrations"
VERIFICATION = ROOT / "supabase" / "verification"

DO_BLOCK = re.compile(r"(?is)^\s*DO\s+(\$[A-Za-z_0-9]*\$)([\s\S]*?)\1\s*;?\s*$")

# Historical applied file is a body fragment rather than standalone SQL.
KNOWN_NON_STANDALONE = {
    "20261119190618_use_invoker_for_financial_summary_20261120.sql",
}


def main() -> int:
    files = sorted(MIGRATIONS.glob("*.sql"))
    files += sorted(VERIFICATION.glob("*.sql")) if VERIFICATION.exists() else []
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
            for statement_number, statement in enumerate(split(source)):
                if (
                    re.search(r"(?is)^\s*CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\b", statement)
                    and re.search(r"(?is)\bLANGUAGE\s+plpgsql\b", statement)
                ):
                    parse_plpgsql(statement)
                    plpgsql_checked += 1
                    continue
                do_match = DO_BLOCK.match(statement)
                if do_match:
                    tag, body = do_match.groups()
                    synthetic_function = (
                        f"CREATE FUNCTION __ffv_do_block_{statement_number}() "
                        f"RETURNS void LANGUAGE plpgsql AS {tag}{body}{tag};"
                    )
                    parse_plpgsql(synthetic_function)
                    plpgsql_checked += 1
        except Exception as exc:
            failed.append((path.relative_to(ROOT), str(exc)))

    if failed:
        for path, error in failed:
            print(f"FAIL {path}: {error}", file=sys.stderr)
        return 1

    migration_count = sum(1 for path in files if path.parent == MIGRATIONS) - len(skipped)
    verification_count = sum(1 for path in files if path.parent == VERIFICATION)
    print(
        f"PostgreSQL grammar check passed for {migration_count} standalone "
        f"migration files and {verification_count} verification files."
    )
    print(f"PL/pgSQL body parser passed for {plpgsql_checked} function and DO-block definitions.")
    if skipped:
        print("Explicitly skipped historical non-standalone fragments: " + ", ".join(skipped))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
