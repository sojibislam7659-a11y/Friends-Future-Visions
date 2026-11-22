#!/usr/bin/env python3
"""Verify staged Edge Function sources match the captured live Production sources."""

from hashlib import sha256
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT = ROOT / "backup" / "production-edge-functions" / "2026-11-22"
FUNCTIONS = ("send-push", "review-member-signup", "invite-member", "create-member-login")


def main() -> int:
    failures = []
    for name in FUNCTIONS:
        deployed = ROOT / "supabase" / "functions" / name / "index.ts"
        captured = SNAPSHOT / name / "index.ts"
        if not deployed.is_file() or not captured.is_file():
            failures.append(f"{name}: source or Production snapshot is missing")
            continue
        live_source = deployed.read_bytes()
        captured_source = captured.read_bytes()
        if live_source != captured_source:
            failures.append(f"{name}: Release source differs from captured Production source")
            continue
        digest = sha256(live_source).hexdigest()
        print(f"{name}: exact Production source match ({digest})")

    google_sync = SNAPSHOT / "google-sheets-sync" / "index.ts"
    if not google_sync.is_file():
        failures.append("Production-only google-sheets-sync snapshot is missing")
    else:
        print("google-sheets-sync: preserved Production-only source snapshot")

    if failures:
        for failure in failures:
            print("FAIL: " + failure, file=sys.stderr)
        return 1
    print("Edge Function source parity checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
