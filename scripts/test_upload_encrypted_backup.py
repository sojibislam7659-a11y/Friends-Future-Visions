import importlib.util
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SCRIPT = Path(__file__).with_name("upload_encrypted_backup.py")
SPEC = importlib.util.spec_from_file_location("ffv_backup_uploader", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class FakeResponse:
    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self):
        return b'{"ok":true,"name":"manifest.json"}'


class UploadBackupTests(unittest.TestCase):
    def test_uploads_chunks_then_integrity_manifest(self):
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / "archive.gpg"
            archive.write_bytes(b"A" * (1024 * 1024) + b"last-bytes")
            requests = []

            def fake_urlopen(request, timeout):
                requests.append(json.loads(request.data.decode("utf-8")))
                return FakeResponse()

            output = io.StringIO()
            argv = [
                "upload_encrypted_backup.py",
                "--file", str(archive),
                "--receiver-url", "https://script.google.com/macros/s/test-deployment/exec",
                "--token", "x" * 64,
                "--run-id", "ffv_backup_test_123456",
                "--chunk-size", str(1024 * 1024),
            ]
            with patch.object(sys, "argv", argv), patch.object(MODULE.urllib.request, "urlopen", fake_urlopen), patch("sys.stdout", output):
                MODULE.main()

            self.assertEqual(len(requests), 3)
            self.assertEqual([x["type"] for x in requests], ["chunk", "chunk", "manifest"])
            self.assertEqual(requests[0]["part"], 1)
            self.assertEqual(requests[1]["part"], 2)
            self.assertEqual(requests[0]["total"], 2)
            manifest = requests[2]["manifest"]
            self.assertEqual(manifest["totalParts"], 2)
            self.assertEqual(manifest["totalBytes"], archive.stat().st_size)
            self.assertEqual(len(manifest["archiveSha256"]), 64)
            self.assertEqual([p["part"] for p in manifest["parts"]], [1, 2])
            self.assertNotIn("x" * 64, output.getvalue())

    def test_rejects_non_apps_script_receiver_url(self):
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / "archive.gpg"
            archive.write_bytes(b"encrypted")
            argv = [
                "upload_encrypted_backup.py",
                "--file", str(archive),
                "--receiver-url", "https://example.com/exec",
                "--token", "x" * 64,
                "--run-id", "ffv_backup_test_123456",
            ]
            with patch.object(sys, "argv", argv):
                with self.assertRaises(SystemExit):
                    MODULE.main()


if __name__ == "__main__":
    unittest.main()
