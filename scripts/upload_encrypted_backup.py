#!/usr/bin/env python3
"""Upload one already-encrypted archive to the FFV Apps Script Drive receiver."""

import argparse
import base64
import hashlib
import json
import math
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

CHUNK_SIZE = 8 * 1024 * 1024
MAX_PARTS = 100


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def post_json(url: str, payload: dict, retries: int = 3) -> dict:
    body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    last_error = None
    for attempt in range(retries):
        try:
            # urllib follows the Apps Script 302 response to its content host.
            with urllib.request.urlopen(request, timeout=120) as response:
                result = json.loads(response.read().decode("utf-8"))
            if not isinstance(result, dict) or result.get("ok") is not True:
                reason = result.get("error", "invalid_receiver_response") if isinstance(result, dict) else "invalid_receiver_response"
                raise RuntimeError("Drive receiver rejected the request: " + str(reason))
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


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", required=True, type=Path)
    parser.add_argument("--receiver-url", default=os.environ.get("FFV_DRIVE_RECEIVER_URL", ""))
    parser.add_argument("--token", default=os.environ.get("FFV_BACKUP_TOKEN", ""))
    parser.add_argument("--run-id", default=os.environ.get("FFV_BACKUP_RUN_ID", ""))
    parser.add_argument("--chunk-size", type=int, default=CHUNK_SIZE)
    args = parser.parse_args()

    if not args.file.is_file():
        raise SystemExit("Encrypted archive file does not exist.")
    if not args.receiver_url or not args.token or len(args.token) < 40:
        raise SystemExit("Drive receiver URL or bearer token is missing.")
    parsed = urllib.parse.urlparse(args.receiver_url)
    if parsed.scheme != "https" or parsed.hostname != "script.google.com" or not parsed.path.endswith("/exec"):
        raise SystemExit("Receiver URL must be the owner's HTTPS Apps Script /exec URL.")
    if not re.fullmatch(r"[A-Za-z0-9_-]{16,64}", args.run_id):
        raise SystemExit("Backup run ID must be 16–64 URL-safe characters.")
    if args.chunk_size < 1024 * 1024 or args.chunk_size > 8 * 1024 * 1024:
        raise SystemExit("Chunk size must be between 1 MiB and 8 MiB.")

    total_bytes = args.file.stat().st_size
    if total_bytes < 1:
        raise SystemExit("Encrypted archive is empty.")
    total_parts = math.ceil(total_bytes / args.chunk_size)
    if total_parts > MAX_PARTS:
        raise SystemExit("Encrypted archive exceeds the receiver's 100-part limit.")

    archive_hash = sha256_file(args.file)
    descriptors = []
    with args.file.open("rb") as stream:
        for part in range(1, total_parts + 1):
            data = stream.read(args.chunk_size)
            part_hash = hashlib.sha256(data).hexdigest()
            payload = {
                "type": "chunk",
                "token": args.token,
                "runId": args.run_id,
                "part": part,
                "total": total_parts,
                "data": base64.b64encode(data).decode("ascii"),
                "sha256": part_hash,
            }
            response = post_json(args.receiver_url, payload)
            descriptors.append({
                "part": part,
                "sizeBytes": len(data),
                "sha256": part_hash,
            })
            print("Uploaded encrypted chunk " + str(part) + "/" + str(total_parts) +
                  (" (duplicate verified)" if response.get("duplicate") else ""))

    manifest = {
        "runId": args.run_id,
        "totalParts": total_parts,
        "totalBytes": total_bytes,
        "archiveSha256": archive_hash,
        "parts": descriptors,
    }
    response = post_json(args.receiver_url, {
        "type": "manifest",
        "token": args.token,
        "runId": args.run_id,
        "manifest": manifest,
    })
    print("Drive manifest accepted: " + str(response.get("name", "verified")))


if __name__ == "__main__":
    main()
