#!/usr/bin/env python3
"""Check Release Edge Function sources against the current Production snapshots."""

from hashlib import sha256
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT = ROOT / "backup" / "production-edge-functions" / "2026-11-22"
# Production versions were deployed after the ordered schema/security parity
# rollout. These Release sources must now match the refreshed live snapshots.
EXPECTED_PRODUCTION_MATCH = {
    "send-push": True,
    "review-member-signup": True,
    "invite-member": True,
    "create-member-login": True,
}


def main() -> int:
    failures = []
    for name, expected_match in EXPECTED_PRODUCTION_MATCH.items():
        release = ROOT / "supabase" / "functions" / name / "index.ts"
        captured = SNAPSHOT / name / "index.ts"
        if not release.is_file() or not captured.is_file():
            failures.append(f"{name}: Release source or captured Production snapshot is missing")
            continue
        release_bytes = release.read_bytes()
        captured_bytes = captured.read_bytes()
        matches = release_bytes == captured_bytes
        if matches != expected_match:
            failures.append(
                f"{name}: expected Production snapshot match={expected_match}, observed {matches}"
            )
            continue
        release_hash = sha256(release_bytes).hexdigest()
        captured_hash = sha256(captured_bytes).hexdigest()
        print(
            f"{name}: source matched; Release sha256={release_hash}; "
            f"Production sha256={captured_hash}"
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
    print("Production Edge Function source parity checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
