import { readFileSync, existsSync } from "node:fs";
import assert from "node:assert/strict";

const html = readFileSync("public/login.html", "utf8");
const login = readFileSync("public/login.js", "utf8");
const brand = readFileSync("public/brand-logo.js", "utf8");
const client = readFileSync("public/supabase-client.js", "utf8");

assert.match(html, /id="superAdminMfaPanel"/, "MFA panel must exist in login HTML");
assert.match(html, /id="mfaCode"/, "MFA code input must exist");
assert.match(html, /id="mfaQrCode"/, "MFA QR image must exist");
assert.match(html, /src="login\.js"/, "MFA login module must be loaded");
assert.match(html, /friends-future-vision-logo\.svg/, "Bootstrap favicon must exist");
assert.ok(existsSync("public/friends-future-vision-logo.svg"), "Production favicon asset is missing");
assert.ok(existsSync("public/password-visibility.js"), "Password visibility helper is missing");
assert.match(login, /async function getLoginProfile\(/, "Pre-migration profile fallback is required");
assert.match(login, /supabase\.auth\.mfa\.enroll\(/, "Super Admin TOTP enrollment is required");
assert.match(login, /supabase\.auth\.mfa\.challenge\(/, "Super Admin TOTP challenge is required");
assert.match(login, /supabase\.auth\.mfa\.verify\(/, "Super Admin TOTP verification is required");
assert.ok((login.match(/getLoginProfile\(/g) || []).length >= 3, "Both existing-session and fresh-login paths must use schema-compatible profile lookup");
assert.match(client, /https:\/\/ugtzmtmsfaajclftfeuz\.supabase\.co/, "Bootstrap client must point to Production");
assert.match(brand, /Friends Future Vision Forever/, "Brand text must use singular Vision");
assert.doesNotMatch(brand, /Friends Future Visions Forever/, "Plural brand spelling must not remain");
process.stdout.write("Production MFA bootstrap checks passed.\n");
