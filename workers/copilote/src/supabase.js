// Accès Supabase par l'API REST (PostgREST), avec la clé service : RLS
// activée sans politique publique, seul ce worker lit et écrit
// (apps/on-sort/supabase/copilote.sql).

export class SupabaseErreur extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

function config(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) throw new SupabaseErreur('supabase_non_configure', 503);
  return { base: `${env.SUPABASE_URL.replace(/\/+$/, '')}/rest/v1`, cle: env.SUPABASE_SERVICE_KEY };
}

async function requete(env, chemin, { methode = 'GET', corps, prefer } = {}) {
  const { base, cle } = config(env);
  const reponse = await fetch(`${base}/${chemin}`, {
    method: methode,
    headers: {
      apikey: cle,
      Authorization: `Bearer ${cle}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  if (!reponse.ok) throw new SupabaseErreur(`supabase ${methode} ${chemin.split('?')[0]} : ${reponse.status}`, reponse.status);
  return reponse;
}

const lignes = async (r) => (r.status === 204 ? [] : r.json());
const premiere = async (r) => (await lignes(r))[0] || null;
const eq = (v) => `eq.${encodeURIComponent(v)}`;

/** Papa par numéro haché ou par compte de l'app. */
export async function trouverPapa(env, { waHash, authId }) {
  const filtre = waHash ? `wa_hash=${eq(waHash)}` : `auth_id=${eq(authId)}`;
  return premiere(await requete(env, `papas?${filtre}&select=*&limit=1`));
}

export async function creerPapa(env, { waHash, authId, prenom }) {
  return premiere(await requete(env, 'papas', {
    methode: 'POST',
    corps: { wa_hash: waHash || null, auth_id: authId || null, prenom: prenom || null },
    prefer: 'return=representation',
  }));
}

export async function majPapa(env, papaId, champs) {
  return premiere(await requete(env, `papas?id=${eq(papaId)}`, {
    methode: 'PATCH', corps: champs, prefer: 'return=representation',
  }));
}

export async function enfantsDe(env, papaId) {
  return lignes(await requete(env, `enfants?papa=${eq(papaId)}&select=*&order=cree_le.asc`));
}

export async function ajouterEnfant(env, papaId, { prenom, naissance, gouts }) {
  return premiere(await requete(env, 'enfants', {
    methode: 'POST',
    corps: { papa: papaId, prenom, naissance, gouts: gouts || null },
    prefer: 'return=representation',
  }));
}

/** Souvenirs de l'enfant sur les `jours` derniers jours, du plus récent au plus ancien. */
export async function souvenirsRecents(env, enfantId, jours = 28, maintenant = new Date()) {
  const depuis = new Date(maintenant.getTime() - jours * 86400000).toISOString().slice(0, 10);
  return lignes(await requete(env, `souvenirs?enfant=${eq(enfantId)}&le=gte.${depuis}&select=*&order=le.desc&limit=50`));
}

export async function ajouterSouvenir(env, enfantId, { type, texte }) {
  await requete(env, 'souvenirs', {
    methode: 'POST', corps: { enfant: enfantId, type, texte: String(texte).slice(0, 500) },
  });
}

/** Nombre d'usages d'une brique depuis une date ISO. */
export async function compterUsage(env, papaId, brique, depuisISO) {
  const r = await requete(env, `usage?papa=${eq(papaId)}&brique=${eq(brique)}&le=gte.${encodeURIComponent(depuisISO)}&select=id`, {
    methode: 'HEAD', prefer: 'count=exact',
  });
  // Content-Range : « 0-4/5 », ou « */0 » quand il n'y a rien.
  const total = (r.headers.get('content-range') || '').split('/')[1];
  return Number(total) || 0;
}

export async function noterUsage(env, papaId, brique) {
  return premiere(await requete(env, 'usage', {
    methode: 'POST', corps: { papa: papaId, brique }, prefer: 'return=representation',
  }));
}

export async function noterRetour(env, usageId, retour) {
  await requete(env, `usage?id=${eq(usageId)}`, { methode: 'PATCH', corps: { retour } });
}

/** « Efface tout » : la cascade emporte enfants, souvenirs et usage. */
export async function effacerPapa(env, papaId) {
  await requete(env, `papas?id=${eq(papaId)}`, { methode: 'DELETE' });
}
