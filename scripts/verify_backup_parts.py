#!/usr/bin/env python3
"""Reassemble Drive receiver chunks and verify every SHA-256 checksum."""

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def verify_and_reassemble(manifest_path: Path, parts_dir: Path, output_path: Path) -> dict:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    run_id = manifest.get("runId")
    total_parts = manifest.get("totalParts")
    total_bytes = manifest.get("totalBytes")
    archive_hash = manifest.get("archiveSha256")
    parts = manifest.get("parts")

    if not isinstance(run_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]{16,64}", run_id):
        raise ValueError("Manifest runId is invalid.")
    if not isinstance(total_parts, int) or total_parts < 1 or total_parts > 100:
        raise ValueError("Manifest totalParts is invalid.")
    if not isinstance(total_bytes, int) or total_bytes < 1:
        raise ValueError("Manifest totalBytes is invalid.")
    if not isinstance(archive_hash, str) or not re.fullmatch(r"[a-f0-9]{64}", archive_hash):
        raise ValueError("Manifest archive SHA-256 is invalid.")
    if not isinstance(parts, list) or len(parts) != total_parts:
        raise ValueError("Manifest part list is incomplete.")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    overall = hashlib.sha256()
    written = 0
    try:
        with output_path.open("wb") as output:
            for expected_part, descriptor in enumerate(parts, start=1):
                if descriptor.get("part") != expected_part:
                    raise ValueError("Manifest part order is invalid.")
                expected_size = descriptor.get("sizeBytes")
                expected_hash = descriptor.get("sha256")
                if not isinstance(expected_size, int) or expected_size < 1:
                    raise ValueError("Manifest part size is invalid.")
                if not isinstance(expected_hash, str) or not re.fullmatch(r"[a-f0-9]{64}", expected_hash):
                    raise ValueError("Manifest part checksum is invalid.")

                part_name = "FFV_" + run_id + "_part_" + str(expected_part).zfill(4) + ".enc"
                part_path = parts_dir / part_name
                if not part_path.is_file():
                    raise ValueError("Missing encrypted chunk: " + part_name)
                data = part_path.read_bytes()
                if len(data) != expected_size:
                    raise ValueError("Encrypted chunk size mismatch: " + part_name)
                if digest(data) != expected_hash:
                    raise ValueError("Encrypted chunk checksum mismatch: " + part_name)
                output.write(data)
                overall.update(data)
                written += len(data)

        if written != total_bytes:
            raise ValueError("Reassembled archive byte count does not match manifest.")
        if overall.hexdigest() != archive_hash:
            raise ValueError("Whole encrypted archive SHA-256 does not match manifest.")
    except Exception:
        output_path.unlink(missing_ok=True)
        raise

    return {
        "runId": run_id,
        "parts": total_parts,
        "bytes": written,
        "sha256": overall.hexdigest(),
        "output": str(output_path),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--parts-dir", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    try:
        result = verify_and_reassemble(args.manifest, args.parts_dir, args.output)
    except Exception as exc:
        print("Backup verification failed: " + str(exc), file=sys.stderr)
        raise SystemExit(1)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
