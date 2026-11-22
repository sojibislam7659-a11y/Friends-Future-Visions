#!/usr/bin/env python3
"""Validate every non-secret file in a decrypted FFV Production backup."""
import hashlib
import json
import re
import sys
from pathlib import Path, PurePosixPath

EXPECTED_PROJECT_REF = "ugtzmtmsfaajclftfeuz"
EXPECTED_FUNCTIONS = (
    "create-member-login",
    "google-sheets-sync",
    "invite-member",
    "review-member-signup",
    "send-push",
)


def load_json(path: Path):
    if not path.is_file():
        raise ValueError("Required backup metadata file is missing: " + path.name)
    return json.loads(path.read_text(encoding="utf-8"))


def digest_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def verify(root: Path) -> dict:
    if not root.is_dir():
        raise ValueError("Extracted backup directory is missing.")

    summary = load_json(root / "export-summary.json")
    if summary.get("project_ref") != EXPECTED_PROJECT_REF:
        raise ValueError("Backup metadata identifies an unexpected Supabase project.")

    auth = load_json(root / "auth-users.json")
    users = auth.get("users")
    if not isinstance(users, list) or auth.get("user_count") != len(users):
        raise ValueError("Auth metadata user count is inconsistent.")
    ids = [user.get("id") for user in users]
    if any(not isinstance(value, str) or not re.fullmatch(r"[0-9a-fA-F-]{36}", value) for value in ids):
        raise ValueError("Auth metadata contains an invalid user ID.")
    if len(set(ids)) != len(ids):
        raise ValueError("Auth metadata contains duplicate user IDs.")
    if auth.get("limitation") is None:
        raise ValueError("Auth password/token restore limitation is not documented.")

    buckets = load_json(root / "storage-buckets.json")
    storage = load_json(root / "storage-objects.json")
    objects = storage.get("objects")
    if not isinstance(buckets, list) or not isinstance(objects, list):
        raise ValueError("Storage manifests are malformed.")
    if len(buckets) != summary.get("storage_bucket_count"):
        raise ValueError("Storage bucket count differs from export summary.")
    if len(objects) != summary.get("storage_object_count") or storage.get("object_count") != len(objects):
        raise ValueError("Storage object count differs from export summary.")

    bucket_names = {bucket.get("name") for bucket in buckets}
    if len(bucket_names) != len(buckets) or None in bucket_names:
        raise ValueError("Storage bucket names are missing or duplicated.")

    total_bytes = 0
    seen_paths = set()
    for item in objects:
        bucket = item.get("bucket")
        object_path = item.get("path")
        size = item.get("size_bytes")
        expected_hash = item.get("sha256")
        if bucket not in bucket_names or not isinstance(object_path, str):
            raise ValueError("Storage object references an unknown bucket or invalid path.")
        relative = PurePosixPath(object_path)
        if relative.is_absolute() or any(part in ("", ".", "..") for part in relative.parts):
            raise ValueError("Storage object path is unsafe.")
        if not isinstance(size, int) or size < 0 or not isinstance(expected_hash, str) or not re.fullmatch(r"[a-f0-9]{64}", expected_hash):
            raise ValueError("Storage object size or checksum is invalid.")
        key = (bucket, object_path)
        if key in seen_paths:
            raise ValueError("Storage manifest contains a duplicate object path.")
        seen_paths.add(key)
        file_path = root / "storage" / bucket / Path(*relative.parts)
        if not file_path.is_file() or file_path.stat().st_size != size:
            raise ValueError("Storage object file is missing or has the wrong size.")
        if digest_file(file_path) != expected_hash:
            raise ValueError("Storage object SHA-256 mismatch.")
        total_bytes += size

    if total_bytes != storage.get("total_bytes") or total_bytes != summary.get("storage_total_bytes"):
        raise ValueError("Storage total byte count is inconsistent.")

    inventory = load_json(root / "config-inventory.json")
    if inventory.get("storage_db_bucket_count") != len(buckets):
        raise ValueError("Database and API Storage bucket inventories disagree.")
    if inventory.get("storage_db_object_count") != len(objects):
        raise ValueError("Database and API Storage object inventories disagree.")

    dump = root / "production-public-private.dump"
    toc = root / "database-toc.txt"
    if not dump.is_file() or dump.stat().st_size < 1 or not toc.is_file() or toc.stat().st_size < 1:
        raise ValueError("PostgreSQL dump or its TOC listing is missing.")

    functions_root = root / "edge-functions-source"
    for function in EXPECTED_FUNCTIONS:
        folder = functions_root / function
        if not (folder / "index.ts").is_file() or not (folder / "metadata.json").is_file():
            raise ValueError("Edge Function source snapshot is incomplete: " + function)
    if not (root / "PRODUCTION-EDGE-FUNCTION-INVENTORY.md").is_file():
        raise ValueError("Production Edge Function inventory is missing.")
    if not (root / "PRODUCTION-MIGRATION-PLAN.md").is_file():
        raise ValueError("Production migration plan is missing.")

    return {
        "project_ref": EXPECTED_PROJECT_REF,
        "auth_users": len(users),
        "storage_buckets": len(buckets),
        "storage_objects": len(objects),
        "storage_bytes_verified": total_bytes,
        "edge_functions_verified": len(EXPECTED_FUNCTIONS),
        "database_dump_bytes": dump.stat().st_size,
        "database_toc_entries": sum(1 for line in toc.read_text(encoding="utf-8").splitlines() if line.strip() and not line.lstrip().startswith(";")),
    }


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: verify_restore_payload.py EXTRACTED_PROJECT_DIRECTORY")
    try:
        result = verify(Path(sys.argv[1]))
    except Exception as exc:
        print("Decrypted backup validation failed: " + str(exc), file=sys.stderr)
        raise SystemExit(1)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
