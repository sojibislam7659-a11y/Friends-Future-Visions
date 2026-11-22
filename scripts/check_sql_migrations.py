#!/usr/bin/env python3
"""Parse Supabase migrations and PL/pgSQL function bodies."""

from pathlib import Path
import re
import sys

from pglast import parse_plpgsql, parse_sql


ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "supabase" / "migrations"
VERIFICATION = ROOT / "supabase" / "verification"

# Match complete PL/pgSQL CREATE FUNCTION statements so the procedural body
# is parsed separately; parse_sql() treats dollar-quoted bodies as opaque text.
PLPGSQL_FUNCTION = re.compile(
    r"(?is)\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\b.*?"
    r"\bLANGUAGE\s+plpgsql\b.*?AS\s+\$function\$.*?\$function\$;"
)

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
            matches = list(PLPGSQL_FUNCTION.finditer(source))
            declared = len(re.findall(r"(?is)\bLANGUAGE\s+plpgsql\b", source))
            if declared != len(matches):
                raise ValueError(
                    f"Found {declared} PL/pgSQL declarations but extracted "
                    f"{len(matches)} complete function definitions"
                )
            for match in matches:
                parse_plpgsql(match.group(0))
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
    print(f"PL/pgSQL body parser passed for {plpgsql_checked} function definitions.")
    if skipped:
        print("Explicitly skipped historical non-standalone fragments: " + ", ".join(skipped))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
