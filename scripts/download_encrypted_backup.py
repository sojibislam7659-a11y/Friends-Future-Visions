#!/usr/bin/env python3
"""Download and verify one encrypted FFV backup directly from the Drive receiver.

The script writes only to the caller-provided temporary path. It never prints
receiver tokens, manifest contents, archive bytes, or encryption material.
"""
import argparse
import base64
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

MAX_PARTS = 100
MAX_CHUNK_BYTES = 8 * 1024 * 1024


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def post_json(url: str, token: str, payload: dict, retries: int = 3) -> dict:
    body = json.dumps({**payload, "token": token}, separators=(",", ":")).encode("utf-8")
    request = urllib.request.Request(
        url, data=body,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    last_error = None
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(request, timeout=240) as response:
                result = json.loads(response.read().decode("utf-8"))
            if not isinstance(result, dict) or result.get("ok") is not True:
                reason = result.get("error", "invalid_receiver_response") if isinstance(result, dict) else "invalid_receiver_response"
                raise RuntimeError("Drive receiver rejected restore request: " + str(reason))
            return result
        except urllib.error.HTTPError as exc:
            last_error = RuntimeError("Drive receiver HTTP error " + str(exc.code))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            last_error = RuntimeError("Drive receiver request failed: " + type(exc).__name__)
        except RuntimeError:
            raise
        if attempt + 1 < retries:
            time.sleep(2 ** attempt)
    raise last_error or RuntimeError("Drive receiver request failed")


def validate_manifest(manifest: dict, expected_run_id: str) -> None:
    if not isinstance(manifest, dict) or manifest.get("runId") != expected_run_id:
        raise ValueError("Drive manifest run ID does not match the requested backup.")
    total_parts = manifest.get("totalParts")
    total_bytes = manifest.get("totalBytes")
    archive_hash = manifest.get("archiveSha256")
    parts = manifest.get("parts")
    if not isinstance(total_parts, int) or not 1 <= total_parts <= MAX_PARTS:
        raise ValueError("Drive manifest part count is invalid.")
    if not isinstance(total_bytes, int) or total_bytes < 1:
        raise ValueError("Drive manifest total size is invalid.")
    if not isinstance(archive_hash, str) or not re.fullmatch(r"[a-f0-9]{64}", archive_hash):
        raise ValueError("Drive manifest archive checksum is invalid.")
    if not isinstance(parts, list) or len(parts) != total_parts:
        raise ValueError("Drive manifest part list is incomplete.")
    size_sum = 0
    for index, descriptor in enumerate(parts, start=1):
        if not isinstance(descriptor, dict) or descriptor.get("part") != index:
            raise ValueError("Drive manifest part order is invalid.")
        size = descriptor.get("sizeBytes")
        digest = descriptor.get("sha256")
        if not isinstance(size, int) or not 1 <= size <= MAX_CHUNK_BYTES:
            raise ValueError("Drive manifest chunk size is invalid.")
        if not isinstance(digest, str) or not re.fullmatch(r"[a-f0-9]{64}", digest):
            raise ValueError("Drive manifest chunk checksum is invalid.")
        size_sum += size
    if size_sum != total_bytes:
        raise ValueError("Drive manifest total size does not match its chunks.")


def download_backup(receiver_url: str, token: str, run_id: str, output_path: Path) -> dict:
    parsed = urllib.parse.urlparse(receiver_url)
    if parsed.scheme != "https" or parsed.hostname != "script.google.com" or not parsed.path.endswith("/exec"):
        raise ValueError("Receiver URL must be the owner's HTTPS Apps Script /exec URL.")
    if len(token) < 40:
        raise ValueError("Drive receiver token is missing or too short.")
    if not re.fullmatch(r"[A-Za-z0-9_-]{16,64}", run_id):
        raise ValueError("Backup run ID format is invalid.")

    response = post_json(receiver_url, token, {"type": "download_manifest", "runId": run_id})
    manifest = response.get("manifest")
    validate_manifest(manifest, run_id)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = output_path.with_name(output_path.name + ".partial")
    overall = hashlib.sha256()
    written = 0
    try:
        with temporary_path.open("wb") as output:
            for descriptor in manifest["parts"]:
                part = descriptor["part"]
                response = post_json(receiver_url, token, {
                    "type": "download_chunk", "runId": run_id, "part": part
                })
                if response.get("part") != part or response.get("sizeBytes") != descriptor["sizeBytes"]:
                    raise ValueError("Drive receiver returned unexpected chunk metadata.")
                encoded = response.get("data")
                if not isinstance(encoded, str):
                    raise ValueError("Drive receiver returned no chunk data.")
                data = base64.b64decode(encoded, validate=True)
                if len(data) != descriptor["sizeBytes"] or sha256(data) != descriptor["sha256"]:
                    raise ValueError("Downloaded encrypted chunk failed SHA-256 verification.")
                if response.get("sha256") != descriptor["sha256"]:
                    raise ValueError("Drive receiver chunk checksum metadata mismatch.")
                output.write(data)
                overall.update(data)
                written += len(data)
                print("Downloaded and verified encrypted chunk " + str(part) + "/" + str(manifest["totalParts"]))

        if written != manifest["totalBytes"]:
            raise ValueError("Downloaded archive byte count does not match the manifest.")
        if overall.hexdigest() != manifest["archiveSha256"]:
            raise ValueError("Whole encrypted archive SHA-256 does not match the Drive manifest.")
        os.replace(temporary_path, output_path)
    except Exception:
        temporary_path.unlink(missing_ok=True)
        output_path.unlink(missing_ok=True)
        raise

    return {"runId": run_id, "parts": manifest["totalParts"], "bytes": written, "sha256": overall.hexdigest()}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--receiver-url", default=os.environ.get("FFV_DRIVE_RECEIVER_URL", ""))
    parser.add_argument("--token", default=os.environ.get("FFV_BACKUP_TOKEN", ""))
    args = parser.parse_args()
    try:
        result = download_backup(args.receiver_url, args.token, args.run_id, args.output)
    except Exception as exc:
        print("Drive backup download/verification failed: " + str(exc), file=sys.stderr)
        raise SystemExit(1)
    print("Encrypted archive downloaded and fully verified: " + str(result["bytes"]) + " bytes; SHA-256 " + result["sha256"])


if __name__ == "__main__":
    main()
