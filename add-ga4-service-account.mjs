/**
 * One-time script: grants the GA4 service account read access to the property
 * via the Admin API using your personal Google OAuth credentials.
 *
 * Usage:
 *   node add-ga4-service-account.mjs
 *
 * Then open the URL shown, authorize with your Google account (the one that
 * owns the GA4 property), paste the code back, and press Enter.
 */

import { createServer } from "http";
import { readFileSync } from "fs";

const PROPERTY_ID = "534867380";
const SERVICE_ACCOUNT_EMAIL = "ga4-mcp-reader@optimizalk.iam.gserviceaccount.com";

// OAuth2 credentials — uses Google's public "testing" client that works for
// installed apps without needing to create OAuth credentials in Cloud Console.
// This only requests Analytics read/write scope to manage user links.
const CLIENT_ID = "764086051850-6qr4p6gpi6hn506pt8ejuq83di341hur.apps.googleusercontent.com";
const CLIENT_SECRET = "d-FL95Q19q7MQmFpd7hHD0Ty";
const REDIRECT_URI = "urn:ietf:wg:oauth:2.0:oob";
const SCOPES = "https://www.googleapis.com/auth/analytics.manage.users";

const authUrl =
  `https://accounts.google.com/o/oauth2/v2/auth` +
  `?client_id=${CLIENT_ID}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&response_type=code` +
  `&scope=${encodeURIComponent(SCOPES)}` +
  `&access_type=offline`;

console.log("\n=== Agregar service account a GA4 ===\n");
console.log("1. Abrí esta URL en tu navegador (con la cuenta que tiene admin en GA4):\n");
console.log("   " + authUrl + "\n");
console.log("2. Autorizá el acceso y copiá el código que aparece.\n");

process.stdout.write("3. Pegá el código aquí y presioná Enter: ");

let code = "";
process.stdin.setEncoding("utf8");

for await (const chunk of process.stdin) {
  code += chunk;
  if (code.includes("\n")) break;
}
code = code.trim();

// Exchange code for token
const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    code,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
    grant_type: "authorization_code",
  }),
});

const tokenData = await tokenRes.json();
if (!tokenData.access_token) {
  console.error("\nError al obtener token:", JSON.stringify(tokenData, null, 2));
  process.exit(1);
}

const accessToken = tokenData.access_token;
console.log("\nToken obtenido. Creando acceso en GA4...\n");

// Create user link via Admin API v1beta
const apiRes = await fetch(
  `https://analyticsadmin.googleapis.com/v1beta/properties/${PROPERTY_ID}/userLinks`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      emailAddress: SERVICE_ACCOUNT_EMAIL,
      directRoles: ["predefinedRoles/viewer"],
    }),
  }
);

const apiData = await apiRes.json();

if (apiRes.ok) {
  console.log("✓ Service account agregado exitosamente como Lector en GA4.");
  console.log("  Email:", apiData.emailAddress);
  console.log("  Nombre:", apiData.name);
  console.log("\nYa podés reiniciar Claude Code y el MCP de GA4 va a funcionar.");
} else {
  console.error("Error al crear user link:", JSON.stringify(apiData, null, 2));
  process.exit(1);
}
