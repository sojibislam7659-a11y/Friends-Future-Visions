import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const supabaseUrl = process.env.FFV_PROD_SUPABASE_URL || "";
const serviceKey = process.env.FFV_PROD_SERVICE_ROLE_KEY || "";
const outputDir = process.argv[2] || "backup-output/project";
const expectedProjectRef = "ugtzmtmsfaajclftfeuz";

if (!supabaseUrl.startsWith("https://") || !serviceKey) {
  throw new Error("Required Supabase URL or service-role secret is missing.");
}
const hostname = new URL(supabaseUrl).hostname;
if (hostname !== expectedProjectRef + ".supabase.co") {
  throw new Error("Refusing to export from an unexpected Supabase project.");
}

const headers = {
  apikey: serviceKey,
  Authorization: "Bearer " + serviceKey
};

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) }
  });
  if (!response.ok) {
    throw new Error("Supabase API request failed (" + response.status + ") at " + new URL(url).pathname);
  }
  return response.json();
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function safePath(bucket, objectPath) {
  const segments = objectPath.split("/");
  if (!segments.length || segments.some(s => !s || s === "." || s === ".." || s.includes(String.fromCharCode(92)))) {
    throw new Error("Unsafe Storage object path encountered.");
  }
  return path.join(outputDir, "storage", bucket, ...segments);
}

await mkdir(outputDir, { recursive: true });

/* Auth users: metadata only. Password hashes, refresh tokens and recovery tokens
   are intentionally excluded; these cannot be restored from this export. */
const users = [];
for (let page = 1; ; page++) {
  const data = await requestJson(
    supabaseUrl + "/auth/v1/admin/users?page=" + page + "&per_page=1000"
  );
  const batch = Array.isArray(data) ? data : (data.users || []);
  for (const user of batch) {
    users.push({
      id: user.id,
      aud: user.aud,
      role: user.role,
      email: user.email,
      phone: user.phone,
      created_at: user.created_at,
      updated_at: user.updated_at,
      confirmed_at: user.confirmed_at,
      email_confirmed_at: user.email_confirmed_at,
      phone_confirmed_at: user.phone_confirmed_at,
      last_sign_in_at: user.last_sign_in_at,
      banned_until: user.banned_until,
      is_anonymous: user.is_anonymous,
      app_metadata: user.app_metadata || {},
      user_metadata: user.user_metadata || {},
      identities: (user.identities || []).map(identity => ({
        identity_id: identity.identity_id,
        user_id: identity.user_id,
        provider: identity.provider,
        created_at: identity.created_at,
        updated_at: identity.updated_at,
        last_sign_in_at: identity.last_sign_in_at
      })),
      factors: (user.factors || []).map(factor => ({
        id: factor.id,
        factor_type: factor.factor_type,
        status: factor.status,
        friendly_name: factor.friendly_name,
        created_at: factor.created_at,
        updated_at: factor.updated_at
      }))
    });
  }
  if (batch.length < 1000) break;
}
await writeFile(
  path.join(outputDir, "auth-users.json"),
  JSON.stringify({
    exported_at: new Date().toISOString(),
    user_count: users.length,
    limitation: "No password hashes, access tokens, refresh tokens, or recovery tokens are exported. A password reset/re-authentication procedure is required for restore.",
    users
  }, null, 2) + "\n"
);

/* Storage: download every object byte and save a per-object SHA-256 manifest. */
const buckets = await requestJson(supabaseUrl + "/storage/v1/bucket");
const bucketManifest = [];
const objectManifest = [];
let totalBytes = 0;

async function walkBucket(bucket, prefix = "") {
  let offset = 0;
  const limit = 1000;
  while (true) {
    const items = await requestJson(
      supabaseUrl + "/storage/v1/object/list/" + encodeURIComponent(bucket.name),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prefix,
          limit,
          offset,
          sortBy: { column: "name", order: "asc" }
        })
      }
    );
    if (!Array.isArray(items)) throw new Error("Unexpected Storage list response.");
    for (const item of items) {
      const objectPath = prefix ? prefix + "/" + item.name : item.name;
      if (!item.id && !item.metadata) {
        await walkBucket(bucket, objectPath);
        continue;
      }
      const urlPath = objectPath.split("/").map(encodeURIComponent).join("/");
      const response = await fetch(
        supabaseUrl + "/storage/v1/object/" + encodeURIComponent(bucket.name) + "/" + urlPath,
        { headers }
      );
      if (!response.ok) {
        throw new Error("Storage object download failed (" + response.status + ") for bucket " + bucket.name);
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      const destination = safePath(bucket.name, objectPath);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, bytes);
      const digest = sha256(bytes);
      totalBytes += bytes.length;
      objectManifest.push({
        bucket: bucket.name,
        path: objectPath,
        size_bytes: bytes.length,
        content_type: response.headers.get("content-type") || item.metadata?.mimetype || null,
        sha256: digest,
        created_at: item.created_at || null,
        updated_at: item.updated_at || null,
        metadata: item.metadata || null
      });
    }
    if (items.length < limit) break;
    offset += items.length;
  }
}

for (const bucket of buckets) {
  bucketManifest.push({
    id: bucket.id,
    name: bucket.name,
    public: bucket.public,
    file_size_limit: bucket.file_size_limit,
    allowed_mime_types: bucket.allowed_mime_types,
    created_at: bucket.created_at,
    updated_at: bucket.updated_at
  });
  await walkBucket(bucket);
}

await writeFile(path.join(outputDir, "storage-buckets.json"), JSON.stringify(bucketManifest, null, 2) + "\n");
await writeFile(path.join(outputDir, "storage-objects.json"), JSON.stringify({
  object_count: objectManifest.length,
  total_bytes: totalBytes,
  objects: objectManifest
}, null, 2) + "\n");

await writeFile(path.join(outputDir, "export-summary.json"), JSON.stringify({
  project_ref: expectedProjectRef,
  exported_at: new Date().toISOString(),
  auth_user_count: users.length,
  storage_bucket_count: bucketManifest.length,
  storage_object_count: objectManifest.length,
  storage_total_bytes: totalBytes,
  database_dump_expected: "production-public-private.dump (created by workflow)",
  auth_password_hashes_included: false,
  vault_secret_values_included: false,
  edge_function_source_snapshot: "backup/production-edge-functions/2026-11-22"
}, null, 2) + "\n");

process.stdout.write(JSON.stringify({
  authUsers: users.length,
  buckets: bucketManifest.length,
  objects: objectManifest.length,
  storageBytes: totalBytes
}) + "\n");
