#!/usr/bin/env python3
"""Check captured Production Edge Function baselines against the Release sources."""

from hashlib import sha256
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT = ROOT / "backup" / "production-edge-functions" / "2026-11-22"
# The current live Production snapshots were captured before the pending
# schema-dependent rollout. Only invite-member is already the same retired 410
# implementation; the other three intentionally need deployment after DB parity.
EXPECTED_PRODUCTION_MATCH = {
    "send-push": False,
    "review-member-signup": False,
    "invite-member": True,
    "create-member-login": False,
}


def main() -> int:
    failures = []
    for name, expected_match in EXPECTED_PRODUCTION_MATCH.items():
        release = ROOT / "supabase" / "functions" / name / "index.ts"
        captured = SNAPSHOT / name / "index.ts"
        if not release.is_file() or not captured.is_file():
            failures.append(f"{name}: Release source or captured Production baseline is missing")
            continue
        release_bytes = release.read_bytes()
        captured_bytes = captured.read_bytes()
        matches = release_bytes == captured_bytes
        if matches != expected_match:
            failures.append(
                f"{name}: expected Production baseline match={expected_match}, observed {matches}"
            )
            continue
        release_hash = sha256(release_bytes).hexdigest()
        captured_hash = sha256(captured_bytes).hexdigest()
        state = "already source-matched" if matches else "requires post-migration rollout"
        print(
            f"{name}: {state}; Release sha256={release_hash}; "
            f"captured Production sha256={captured_hash}"
        )

    google_sync = SNAPSHOT / "google-sheets-sync" / "index.ts"
    if not google_sync.is_file():
        failures.append("Production-only google-sheets-sync snapshot is missing")
    else:
        print("google-sheets-sync: preserved Production-only source snapshot")

    if failures:
        for failure in failures:
            print("FAIL: " + failure, file=sys.stderr)
        return 1
    print("Production Edge Function baseline checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
