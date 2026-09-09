/* Push Web (VAPID) — notification système sur le téléphone, sans app tierce.
   On envoie une poussée SANS charge utile : le Service Worker rappelle /relances
   pour composer le texte. Ça évite le chiffrement aes128gcm et ne laisse transiter
   aucune donnée client par le service de push (Apple, Google…). */

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)))
  .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/* Douze heures : au-delà, les services de push rejettent le jeton. */
const TTL_JWT = 12 * 3600;
/* Le push survit douze heures si le téléphone est éteint. */
const TTL_PUSH = 12 * 3600;

async function cleSignature(env) {
  const jwk = JSON.parse(env.VAPID_PRIVATE_JWK);
  return crypto.subtle.importKey(
    "jwk",
    { ...jwk, key_ops: ["sign"], ext: true },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

/* Jeton VAPID pour une origine de service de push donnée. */
async function jetonVapid(env, audience) {
  const header = b64url(new TextEncoder().encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64url(new TextEncoder().encode(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + TTL_JWT,
    sub: env.VAPID_SUBJECT || "mailto:loumiwassim@gmail.com",
  })));
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    await cleSignature(env),
    new TextEncoder().encode(`${header}.${body}`),
  );
  return `${header}.${body}.${b64url(signature)}`;
}

const cleKV = async (endpoint) => {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  return "push:" + [...new Uint8Array(h)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
};

export async function abonner(env, endpoint) {
  const cle = await cleKV(endpoint);
  await env.PILOT_KV.put(cle, JSON.stringify({ endpoint, depuis: new Date().toISOString() }));
  return cle;
}

export async function desabonner(env, endpoint) {
  await env.PILOT_KV.delete(await cleKV(endpoint));
}

/* Pousse à tous les appareils enregistrés. Nettoie les abonnements morts (404/410). */
export async function pousserATous(env) {
  if (!env.VAPID_PRIVATE_JWK || !env.VAPID_PUBLIC_KEY) return { envoyes: 0, purges: 0 };
  const liste = await env.PILOT_KV.list({ prefix: "push:" });
  let envoyes = 0, purges = 0;

  for (const { name } of liste.keys) {
    const brut = await env.PILOT_KV.get(name);
    if (!brut) continue;
    const { endpoint } = JSON.parse(brut);
    try {
      const audience = new URL(endpoint).origin;
      const r = await fetch(endpoint, {
        method: "POST",
        headers: {
          "TTL": String(TTL_PUSH),
          "Content-Length": "0",
          "Urgency": "normal",
          "Authorization": `vapid t=${await jetonVapid(env, audience)}, k=${env.VAPID_PUBLIC_KEY}`,
        },
      });
      if (r.status === 404 || r.status === 410) { await env.PILOT_KV.delete(name); purges++; }
      else if (r.ok) envoyes++;
    } catch (e) {
      /* Un abonnement cassé ne doit pas faire tomber le digest Telegram. */
    }
  }
  return { envoyes, purges };
}
