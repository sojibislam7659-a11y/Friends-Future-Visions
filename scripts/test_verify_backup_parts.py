import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("verify_backup_parts.py")
SPEC = importlib.util.spec_from_file_location("ffv_backup_verifier", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class VerifyBackupPartsTests(unittest.TestCase):
    def test_reassembles_and_verifies_all_parts(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            run_id = "ffv_backup_test_123456"
            parts_dir = root / "parts"
            parts_dir.mkdir()
            chunks = [b"encrypted-part-one", b"encrypted-part-two"]
            descriptors = []
            for number, chunk in enumerate(chunks, start=1):
                name = "FFV_" + run_id + "_part_" + str(number).zfill(4) + ".enc"
                (parts_dir / name).write_bytes(chunk)
                descriptors.append({
                    "part": number,
                    "sizeBytes": len(chunk),
                    "sha256": hashlib.sha256(chunk).hexdigest()
                })
            archive = b"".join(chunks)
            manifest = {
                "runId": run_id,
                "totalParts": len(chunks),
                "totalBytes": len(archive),
                "archiveSha256": hashlib.sha256(archive).hexdigest(),
                "parts": descriptors
            }
            manifest_path = root / ("FFV_" + run_id + "_manifest.json")
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            output = root / "restored.gpg"
            result = MODULE.verify_and_reassemble(manifest_path, parts_dir, output)
            self.assertEqual(output.read_bytes(), archive)
            self.assertEqual(result["parts"], 2)
            self.assertEqual(result["bytes"], len(archive))

    def test_rejects_corrupted_chunk_and_removes_partial_output(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            run_id = "ffv_backup_test_123456"
            parts_dir = root / "parts"
            parts_dir.mkdir()
            original = b"encrypted-part"
            name = "FFV_" + run_id + "_part_0001.enc"
            (parts_dir / name).write_bytes(b"corrupted")
            manifest = {
                "runId": run_id,
                "totalParts": 1,
                "totalBytes": len(original),
                "archiveSha256": hashlib.sha256(original).hexdigest(),
                "parts": [{
                    "part": 1,
                    "sizeBytes": len(original),
                    "sha256": hashlib.sha256(original).hexdigest()
                }]
            }
            manifest_path = root / "manifest.json"
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            output = root / "restored.gpg"
            with self.assertRaises(ValueError):
                MODULE.verify_and_reassemble(manifest_path, parts_dir, output)
            self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
