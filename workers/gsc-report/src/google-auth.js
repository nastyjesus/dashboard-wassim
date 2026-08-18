// Auth Google service account → access token OAuth2 (flow JWT bearer).
// Signé en RS256 via WebCrypto (dispo nativement dans les Workers).
// Scope lecture seule Search Console.

const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

/** Cache token en mémoire (durée de vie de l'isolate — suffisant pour un cron). */
let cached = { token: null, exp: 0 };

export function hasGoogleCreds(env) {
  return Boolean(env.GOOGLE_SA_EMAIL && env.GOOGLE_SA_PRIVATE_KEY);
}

/**
 * Récupère un access token pour le service account.
 * @param {object} env
 * @returns {Promise<string>}
 */
export async function getAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  if (cached.token && cached.exp - 60 > now) return cached.token;

  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: env.GOOGLE_SA_EMAIL,
    scope: SCOPE,
    aud: env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const key = await importPrivateKey(env.GOOGLE_SA_PRIVATE_KEY);
  const sig = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    key,
    new TextEncoder().encode(unsigned),
  );
  const jwt = `${unsigned}.${b64urlBytes(new Uint8Array(sig))}`;

  const res = await fetch(env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`google.token ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  cached = { token: data.access_token, exp: now + (data.expires_in || 3600) };
  return cached.token;
}

/**
 * Normalise la clé privée quel que soit le format collé dans le secret :
 * - le JSON complet du service account (on extrait `private_key`),
 * - la valeur avec ou sans guillemets,
 * - des `\n` littéraux (copier-coller du JSON) ou de vrais retours ligne.
 * Renvoie le corps base64 du bloc PKCS8, ou jette une erreur explicite.
 * @param {string} raw
 * @returns {string}
 */
export function extractPemBody(raw) {
  let s = String(raw || '').trim();
  if (!s) throw new Error('GOOGLE_SA_PRIVATE_KEY vide');
  // JSON complet du service account collé tel quel ?
  if (s.startsWith('{')) {
    try {
      const parsed = JSON.parse(s);
      if (parsed.private_key) s = parsed.private_key;
    } catch {
      // JSON invalide (souvent tronqué) — on tente quand même l'extraction du bloc PEM.
    }
  }
  s = s.replace(/\\n/g, '\n').replace(/^["']+|["'],?$/g, '');
  const m = s.match(/-----BEGIN PRIVATE KEY-----([\s\S]*?)-----END PRIVATE KEY-----/);
  if (!m) {
    throw new Error(
      'GOOGLE_SA_PRIVATE_KEY: bloc "-----BEGIN PRIVATE KEY-----…-----END PRIVATE KEY-----" introuvable — '
      + 'colle le champ private_key complet du JSON (ou le JSON entier), sans le tronquer',
    );
  }
  const body = m[1].replace(/[^A-Za-z0-9+/=]/g, '');
  // Une clé RSA 2048 PKCS8 fait ~1600 caractères base64 : nettement moins = tronquée.
  if (body.length < 1000) {
    throw new Error(`GOOGLE_SA_PRIVATE_KEY: clé tronquée (${body.length} caractères base64) — recolle-la en entier`);
  }
  return body;
}

/** Importe la clé privée PKCS8 pour signature RS256. */
export async function importPrivateKey(pem) {
  const body = extractPemBody(pem);
  let rawBytes;
  try {
    rawBytes = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  } catch {
    throw new Error('GOOGLE_SA_PRIVATE_KEY: base64 invalide — la clé a été altérée au collage, recolle-la depuis key.json');
  }
  try {
    return await crypto.subtle.importKey(
      'pkcs8',
      rawBytes.buffer,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    );
  } catch (e) {
    throw new Error(
      'GOOGLE_SA_PRIVATE_KEY: clé illisible (PKCS8 invalide) — probablement tronquée ou altérée au collage. '
      + 'Regénère une clé (`gcloud iam service-accounts keys create`) et recolle le champ private_key tel quel. '
      + `Détail: ${e.message || e}`,
    );
  }
}

/**
 * Diagnostic du format de clé pour /health : n'expose rien, dit juste si la
 * clé stockée est exploitable.
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function checkKeyFormat(env) {
  if (!hasGoogleCreds(env)) return { ok: false, error: 'GOOGLE_SA_EMAIL / GOOGLE_SA_PRIVATE_KEY manquants' };
  try {
    await importPrivateKey(env.GOOGLE_SA_PRIVATE_KEY);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

function b64url(str) {
  return b64urlBytes(new TextEncoder().encode(str));
}

function b64urlBytes(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
