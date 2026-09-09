/* Génère une paire de clés VAPID pour le push web.
   Usage :  node scripts/gen-vapid.mjs

   La clé privée n'est jamais affichée : elle est écrite dans .vapid.local.json,
   ignoré par git. Seule la clé publique sort sur la sortie standard — elle est
   publique par nature (elle finit dans cockpit.html).

   Ensuite :
     node -e "console.log(JSON.stringify(require('./.vapid.local.json').privateJwk))" | npx wrangler secret put VAPID_PRIVATE_JWK
     node -e "console.log(require('./.vapid.local.json').publicKey)"                  | npx wrangler secret put VAPID_PUBLIC_KEY
*/

import { webcrypto as crypto } from "node:crypto";
import { writeFileSync, existsSync } from "node:fs";

const FICHIER = new URL("../.vapid.local.json", import.meta.url);

if (existsSync(FICHIER) && !process.argv.includes("--force")) {
  console.error("Des clés existent déjà dans .vapid.local.json.");
  console.error("Les remplacer casserait tous les abonnements en cours. Utiliser --force pour insister.");
  process.exit(1);
}

const b64url = (buf) => Buffer.from(buf).toString("base64")
  .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const paire = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const jwk = await crypto.subtle.exportKey("jwk", paire.privateKey);
const publicKey = b64url(await crypto.subtle.exportKey("raw", paire.publicKey));

writeFileSync(FICHIER, JSON.stringify({
  publicKey,
  privateJwk: { kty: jwk.kty, crv: jwk.crv, d: jwk.d, x: jwk.x, y: jwk.y },
}, null, 2) + "\n", { mode: 0o600 });

console.log("Clés écrites dans .vapid.local.json (ignoré par git).");
console.log("");
console.log("VAPID_PUBLIC_KEY — à recopier dans cockpit.html :");
console.log(publicKey);
