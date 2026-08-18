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
 * Importe la clé privée PEM (PKCS8) du service account.
 * Accepte les \n littéraux (copier-coller du JSON Google) comme les vrais retours ligne.
 */
async function importPrivateKey(pem) {
  const body = pem
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const raw = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'pkcs8',
    raw.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

function b64url(str) {
  return b64urlBytes(new TextEncoder().encode(str));
}

function b64urlBytes(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
