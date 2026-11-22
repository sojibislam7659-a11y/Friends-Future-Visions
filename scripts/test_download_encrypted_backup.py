import base64
import hashlib
import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SCRIPT = Path(__file__).with_name("download_encrypted_backup.py")
SPEC = importlib.util.spec_from_file_location("ffv_backup_downloader", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class DownloadRestoreTests(unittest.TestCase):
    def test_downloads_and_verifies_each_chunk_and_archive(self):
        chunks = [b"encrypted-part-one", b"encrypted-part-two"]
        run_id = "ffv_backup_test_123456"
        manifest = {
            "runId": run_id,
            "totalParts": 2,
            "totalBytes": sum(map(len, chunks)),
            "archiveSha256": hashlib.sha256(b"".join(chunks)).hexdigest(),
            "parts": [
                {"part": i, "sizeBytes": len(chunk), "sha256": hashlib.sha256(chunk).hexdigest()}
                for i, chunk in enumerate(chunks, 1)
            ],
        }

        def fake_post(_url, _token, payload):
            if payload["type"] == "download_manifest":
                return {"ok": True, "manifest": manifest}
            index = payload["part"] - 1
            chunk = chunks[index]
            return {
                "ok": True,
                "part": payload["part"],
                "sizeBytes": len(chunk),
                "sha256": hashlib.sha256(chunk).hexdigest(),
                "data": base64.b64encode(chunk).decode("ascii"),
            }

        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "backup.gpg"
            with patch.object(MODULE, "post_json", side_effect=fake_post):
                result = MODULE.download_backup(
                    "https://script.google.com/macros/s/test-deployment/exec",
                    "x" * 64, run_id, output
                )
            self.assertEqual(output.read_bytes(), b"".join(chunks))
            self.assertEqual(result["parts"], 2)
            self.assertEqual(result["bytes"], sum(map(len, chunks)))

    def test_rejects_wrong_whole_archive_hash_and_removes_partial_file(self):
        chunk = b"encrypted-part"
        run_id = "ffv_backup_test_123456"
        manifest = {
            "runId": run_id,
            "totalParts": 1,
            "totalBytes": len(chunk),
            "archiveSha256": "0" * 64,
            "parts": [{"part": 1, "sizeBytes": len(chunk), "sha256": hashlib.sha256(chunk).hexdigest()}],
        }

        def fake_post(_url, _token, payload):
            if payload["type"] == "download_manifest":
                return {"ok": True, "manifest": manifest}
            return {
                "ok": True, "part": 1, "sizeBytes": len(chunk),
                "sha256": hashlib.sha256(chunk).hexdigest(),
                "data": base64.b64encode(chunk).decode("ascii"),
            }

        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "backup.gpg"
            with patch.object(MODULE, "post_json", side_effect=fake_post):
                with self.assertRaises(ValueError):
                    MODULE.download_backup(
                        "https://script.google.com/macros/s/test-deployment/exec",
                        "x" * 64, run_id, output
                    )
            self.assertFalse(output.exists())
            self.assertFalse(output.with_name(output.name + ".partial").exists())


if __name__ == "__main__":
    unittest.main()
