/**
 * Friends Future Vision Forever — encrypted backup receiver.
 *
 * Receives already-encrypted archive chunks and provides token-authenticated,
 * exact-run recovery endpoints for the trusted GitHub Actions restore workflow.
 * It does not expose generic Drive folder listing or browsing.
 *
 * Required Script Properties:
 *   FFV_BACKUP_TOKEN  - random 256-bit bearer token
 *   FFV_BACKUP_FOLDER_ID - ID of the dedicated Drive backup folder
 *
 * Deploy as a Web App: execute as the owner; access: Anyone.
 * The bearer token is mandatory because the endpoint is publicly reachable.
 */

function doGet() {
  return json_({ ok: true, service: 'FFV encrypted backup receiver', version: 3 });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return json_({ ok: false, error: 'busy' });

  try {
    var props = PropertiesService.getScriptProperties();
    var expectedToken = props.getProperty('FFV_BACKUP_TOKEN') || '';
    var folderId = props.getProperty('FFV_BACKUP_FOLDER_ID') || '';

    if (expectedToken.length < 40 || !folderId) {
      return json_({ ok: false, error: 'receiver_not_configured' });
    }

    var raw = e && e.postData && e.postData.contents;
    if (!raw || raw.length > 15000000) {
      return json_({ ok: false, error: 'invalid_or_oversized_request' });
    }

    var payload;
    try { payload = JSON.parse(raw); } catch (_) {
      return json_({ ok: false, error: 'invalid_json' });
    }

    if (!payload || !constantTimeEqual_(String(payload.token || ''), expectedToken)) {
      return json_({ ok: false, error: 'unauthorized' });
    }

    if (!/^[A-Za-z0-9_-]{16,64}$/.test(String(payload.runId || ''))) {
      return json_({ ok: false, error: 'invalid_run_id' });
    }

    var folder = DriveApp.getFolderById(folderId);

    if (payload.type === 'chunk') {
      var part = Number(payload.part);
      var total = Number(payload.total);
      var encoded = String(payload.data || '');
      var expectedHash = String(payload.sha256 || '').toLowerCase();

      if (!Number.isInteger(part) || !Number.isInteger(total) ||
          total < 1 || total > 100 || part < 1 || part > total) {
        return json_({ ok: false, error: 'invalid_part_number' });
      }
      if (!encoded || encoded.length > 14000000 ||
          !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
        return json_({ ok: false, error: 'invalid_chunk_data' });
      }
      if (!/^[a-f0-9]{64}$/.test(expectedHash)) {
        return json_({ ok: false, error: 'invalid_sha256' });
      }

      var bytes = Utilities.base64Decode(encoded);
      var actualHash = sha256_(bytes);
      if (!constantTimeEqual_(actualHash, expectedHash)) {
        return json_({ ok: false, error: 'checksum_mismatch' });
      }

      var name = 'FFV_' + payload.runId + '_part_' +
        ('0000' + part).slice(-4) + '.enc';
      var existing = folder.getFilesByName(name);
      if (existing.hasNext()) {
        var oldFile = existing.next();
        if (sha256_(oldFile.getBlob().getBytes()) === actualHash) {
          return json_({ ok: true, duplicate: true, name: name, sha256: actualHash });
        }
        return json_({ ok: false, error: 'part_exists_with_different_content' });
      }

      folder.createFile(Utilities.newBlob(bytes, 'application/octet-stream', name));
      return json_({ ok: true, name: name, sha256: actualHash });
    }

    if (payload.type === 'manifest') {
      var manifest = payload.manifest;
      if (!manifest || manifest.runId !== payload.runId ||
          !Number.isInteger(manifest.totalParts) ||
          manifest.totalParts < 1 || manifest.totalParts > 100 ||
          !/^[a-f0-9]{64}$/.test(String(manifest.archiveSha256 || '')) ||
          !Array.isArray(manifest.parts) ||
          manifest.parts.length !== manifest.totalParts ||
          !Number.isSafeInteger(manifest.totalBytes) || manifest.totalBytes < 1) {
        return json_({ ok: false, error: 'invalid_manifest' });
      }

      // Fail closed: publish a manifest only after every declared chunk exists
      // and its byte length and SHA-256 match. The archive-level checksum is
      // re-checked after download/reassembly by the restore verifier.
      var verifiedBytes = 0;
      for (var i = 0; i < manifest.totalParts; i++) {
        var descriptor = manifest.parts[i];
        var expectedPart = i + 1;
        if (!descriptor || descriptor.part !== expectedPart ||
            !/^[a-f0-9]{64}$/.test(String(descriptor.sha256 || '')) ||
            !Number.isSafeInteger(descriptor.sizeBytes) ||
            descriptor.sizeBytes < 1) {
          return json_({ ok: false, error: 'invalid_manifest_part_' + expectedPart });
        }

        var partName = 'FFV_' + payload.runId + '_part_' +
          ('0000' + expectedPart).slice(-4) + '.enc';
        var partFiles = folder.getFilesByName(partName);
        if (!partFiles.hasNext()) {
          return json_({ ok: false, error: 'missing_part_' + expectedPart });
        }
        var partBytes = partFiles.next().getBlob().getBytes();
        if (partBytes.length !== descriptor.sizeBytes ||
            sha256_(partBytes) !== descriptor.sha256) {
          return json_({ ok: false, error: 'part_verification_failed_' + expectedPart });
        }
        verifiedBytes += partBytes.length;
      }
      if (verifiedBytes !== manifest.totalBytes) {
        return json_({ ok: false, error: 'manifest_total_size_mismatch' });
      }

      var manifestName = 'FFV_' + payload.runId + '_manifest.json';
      var manifestText = JSON.stringify(manifest, null, 2);
      var prior = folder.getFilesByName(manifestName);
      if (prior.hasNext()) {
        var old = prior.next();
        if (old.getBlob().getDataAsString() === manifestText) {
          return json_({ ok: true, duplicate: true, name: manifestName });
        }
        return json_({ ok: false, error: 'manifest_already_exists' });
      }
      folder.createFile(manifestName, manifestText, MimeType.PLAIN_TEXT);
      return json_({ ok: true, name: manifestName });
    }


    // Read-only recovery endpoints. They expose only files belonging to the
    // exact run ID and manifest, and only to callers holding the 256-bit token.
    if (payload.type === 'download_manifest') {
      var manifestName = 'FFV_' + payload.runId + '_manifest.json';
      var manifestFiles = folder.getFilesByName(manifestName);
      if (!manifestFiles.hasNext()) return json_({ ok: false, error: 'backup_not_found' });

      var storedManifest;
      try {
        storedManifest = JSON.parse(manifestFiles.next().getBlob().getDataAsString());
      } catch (_) {
        return json_({ ok: false, error: 'manifest_invalid_json' });
      }
      if (!validManifest_(storedManifest, payload.runId)) {
        return json_({ ok: false, error: 'manifest_invalid' });
      }
      return json_({ ok: true, manifest: storedManifest });
    }

    if (payload.type === 'download_chunk') {
      var requestedPart = Number(payload.part);
      if (!Number.isInteger(requestedPart) || requestedPart < 1 || requestedPart > 100) {
        return json_({ ok: false, error: 'invalid_part_number' });
      }

      var storedManifestName = 'FFV_' + payload.runId + '_manifest.json';
      var storedManifestFiles = folder.getFilesByName(storedManifestName);
      if (!storedManifestFiles.hasNext()) return json_({ ok: false, error: 'backup_not_found' });

      var chunkManifest;
      try {
        chunkManifest = JSON.parse(storedManifestFiles.next().getBlob().getDataAsString());
      } catch (_) {
        return json_({ ok: false, error: 'manifest_invalid_json' });
      }
      if (!validManifest_(chunkManifest, payload.runId) || requestedPart > chunkManifest.totalParts) {
        return json_({ ok: false, error: 'manifest_or_part_invalid' });
      }

      var descriptor = chunkManifest.parts[requestedPart - 1];
      var chunkName = 'FFV_' + payload.runId + '_part_' +
        ('0000' + requestedPart).slice(-4) + '.enc';
      var chunkFiles = folder.getFilesByName(chunkName);
      if (!chunkFiles.hasNext()) return json_({ ok: false, error: 'chunk_not_found' });

      var chunkBytes = chunkFiles.next().getBlob().getBytes();
      if (chunkBytes.length !== descriptor.sizeBytes ||
          !constantTimeEqual_(sha256_(chunkBytes), descriptor.sha256)) {
        return json_({ ok: false, error: 'stored_chunk_integrity_failed' });
      }
      if (chunkBytes.length > 8 * 1024 * 1024) {
        return json_({ ok: false, error: 'chunk_exceeds_download_limit' });
      }

      return json_({
        ok: true,
        part: requestedPart,
        sizeBytes: chunkBytes.length,
        sha256: descriptor.sha256,
        data: Utilities.base64Encode(chunkBytes)
      });
    }

    return json_({ ok: false, error: 'unsupported_payload_type' });
  } catch (err) {
    // Do not log request bodies, tokens, or file contents.
    return json_({ ok: false, error: 'receiver_error', message: String(err.message || err).slice(0, 160) });
  } finally {
    lock.releaseLock();
  }
}

function sha256_(bytes) {
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes);
  return digest.map(function (b) {
    var v = (b + 256) % 256;
    return ('0' + v.toString(16)).slice(-2);
  }).join('');
}

function constantTimeEqual_(a, b) {
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function validManifest_(manifest, expectedRunId) {
  if (!manifest || manifest.runId !== expectedRunId ||
      !Number.isInteger(manifest.totalParts) ||
      manifest.totalParts < 1 || manifest.totalParts > 100 ||
      !/^[a-f0-9]{64}$/.test(String(manifest.archiveSha256 || '')) ||
      !Array.isArray(manifest.parts) ||
      manifest.parts.length !== manifest.totalParts ||
      !Number.isSafeInteger(manifest.totalBytes) || manifest.totalBytes < 1) {
    return false;
  }
  var sum = 0;
  for (var i = 0; i < manifest.parts.length; i++) {
    var part = manifest.parts[i];
    if (!part || part.part !== i + 1 ||
        !Number.isSafeInteger(part.sizeBytes) || part.sizeBytes < 1 ||
        part.sizeBytes > 8 * 1024 * 1024 ||
        !/^[a-f0-9]{64}$/.test(String(part.sha256 || ''))) return false;
    sum += part.sizeBytes;
  }
  return sum === manifest.totalBytes;
}
