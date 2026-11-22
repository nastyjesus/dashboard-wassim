// Nettoyage hebdo du deck, le samedi matin après la réunion du vendredi :
// le job (python job.py nettoyage) efface des slides membres la photo et la
// demande « Qui peut m'aider à rencontrer » de la semaine écoulée, pour
// qu'une infomerciale ne réapparaisse pas si le membre n'en renvoie pas.
// Ce module donne au job son plan et enregistre le résultat.
//
// Clés KV propres au nettoyage :
//   nettoyage:<lundi>   résultat du nettoyage réussi de cette semaine (le job
//                       ne refait rien s'il existe : créneaux de rattrapage)
//   dernier_nettoyage   dernier résultat, réussi ou non (affiché dans l'admin)
// Clés touchées après un nettoyage réussi : applique:<id> et
// photo_appliquee:<id> de la semaine écoulée, depot:<id>/photo:<id> restés en
// attente d'avant la coupure, recherche/a_une_photo de la fiche membre.
// L'historique envois:<lundi> n'est jamais touché.

import { lundiParis } from './index.js';
import { purgerConferencesPassees } from './conference.js';

const ZONE_PARIS = 'Europe/Paris';
// Coupure : vendredi 12:00 (heure de Paris), réunion du matin terminée. Un
// dépôt plus récent vise la réunion suivante : il survit au nettoyage, et sa
// slide est laissée telle quelle s'il y est déjà posé.
const JOUR_COUPURE = 4; // jours après le lundi (4 = vendredi)
const HEURE_COUPURE = '12:00';

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});
const lire = async (env, cle, defaut) => (await env.KV.get(cle, 'json')) ?? defaut;

// « AAAA-MM-JJ HH:MM » à l'heure de Paris (comparable comme une chaîne).
export const heureParis = (date) => new Intl.DateTimeFormat('sv-SE', {
  timeZone: ZONE_PARIS, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
}).format(date);

const decaler = (jour, n) => {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// Semaine à nettoyer : celle de la dernière coupure passée. Un lancement
// manuel en début de semaine vise donc la semaine précédente, jamais la
// réunion à venir.
export function semaineANettoyer(maintenant) {
  const coupureDe = (lundi) => `${decaler(lundi, JOUR_COUPURE)} ${HEURE_COUPURE}`;
  let semaine = lundiParis(maintenant);
  if (heureParis(maintenant) < coupureDe(semaine)) semaine = decaler(semaine, -7);
  return { semaine, coupure: coupureDe(semaine) };
}

const avantCoupure = (iso, coupure) => {
  const d = iso ? new Date(iso) : null;
  return !d || Number.isNaN(d.getTime()) || heureParis(d) < coupure;
};

async function valeurs(env, prefixe) {
  const { keys } = await env.KV.list({ prefix: prefixe });
  return Promise.all(keys.map(async ({ name }) => ({ cle: name, id: name.slice(prefixe.length), valeur: await lire(env, name, null) })));
}

export async function planNettoyage(env, maintenant = new Date()) {
  const { semaine, coupure } = semaineANettoyer(maintenant);
  const [fait, membres, ms] = await Promise.all([lire(env, `nettoyage:${semaine}`, null), lire(env, 'membres', []), lire(env, 'ms', null)]);
  // slides où un dépôt de la nouvelle semaine est déjà posé : on n'y touche pas
  const preserver = (await valeurs(env, 'applique:'))
    .filter(({ valeur }) => valeur?.statut === 'pose' && !avantCoupure(valeur.date, coupure))
    .map(({ id }) => Number(id));
  // slides de conférence posées pour cette réunion (ou une plus ancienne) :
  // retirées ; celles d'une réunion à venir restent
  return { semaine, coupure, deja_fait: Boolean(fait?.ok), nettoyage: fait, preserver, conference_jusqu_au: decaler(semaine, JOUR_COUPURE), membres, ms };
}

const ids = (liste) => (Array.isArray(liste) ? liste : []).map((x) => Number(typeof x === 'object' && x ? x.slide_id : x)).filter(Number.isFinite);

export async function enregistrerNettoyage(env, corps, maintenant = new Date()) {
  const { semaine, coupure } = semaineANettoyer(maintenant);
  if (corps.semaine && corps.semaine !== semaine) {
    return json({ erreur: `Plan périmé : semaine ${corps.semaine} reçue, ${semaine} attendue.` }, 409);
  }
  const nettoyees = ids(corps.nettoyees);
  const dejaVides = ids(corps.deja_vides);
  const resultat = {
    semaine,
    coupure,
    date: maintenant.toISOString(),
    ok: Boolean(corps.ok),
    message: String(corps.message ?? '').slice(0, 300),
    nettoyees: nettoyees.length,
    deja_vides: dejaVides.length,
    preservees: ids(corps.preservees).length,
    non_reconnues: Number(corps.non_reconnues) || 0,
    sauvegarde: String(corps.sauvegarde ?? '').slice(0, 200),
    statuts_remis_a_zero: 0,
    depots_perimes: 0,
    conference: Number(corps.conference) || 0,
    fichiers_conference_effaces: 0,
  };
  if (resultat.ok) {
    // statuts « posé » (ou « introuvable ») de la semaine écoulée
    for (const { cle, id, valeur } of await valeurs(env, 'applique:')) {
      if (!avantCoupure(valeur?.date, coupure)) continue;
      await env.KV.delete(cle);
      await env.KV.delete(`photo_appliquee:${id}`);
      resultat.statuts_remis_a_zero += 1;
    }
    // dépôts jamais posés, faits pour la réunion passée : périmés
    for (const { cle, id, valeur } of await valeurs(env, 'depot:')) {
      if (!avantCoupure(valeur?.date, coupure)) continue;
      await env.KV.delete(cle);
      await env.KV.delete(`photo:${id}`);
      resultat.depots_perimes += 1;
    }
    // la page membre ne doit plus pré-remplir l'ancienne demande
    const vides = new Set([...nettoyees, ...dejaVides]);
    const membres = await lire(env, 'membres', []);
    if (membres.some((m) => vides.has(m.slide_id))) {
      for (const m of membres) if (vides.has(m.slide_id)) Object.assign(m, { recherche: '', a_une_photo: false });
      await env.KV.put('membres', JSON.stringify(membres));
    }
    // fichiers des conférences passées : plus utiles une fois retirées du deck
    resultat.fichiers_conference_effaces = await purgerConferencesPassees(env, decaler(semaine, JOUR_COUPURE));
    await env.KV.put(`nettoyage:${semaine}`, JSON.stringify(resultat));
  }
  await env.KV.put('dernier_nettoyage', JSON.stringify(resultat));
  return json(resultat);
}

// Routes du job (authentification vérifiée par l'appelant, comme /api/job/*).
export async function routesNettoyage(request, env, url) {
  const maintenant = url.searchParams.get('maintenant') ? new Date(url.searchParams.get('maintenant')) : new Date();
  if (Number.isNaN(maintenant.getTime())) return json({ erreur: 'maintenant : date invalide.' }, 400);
  if (request.method === 'GET') return json(await planNettoyage(env, maintenant));
  if (request.method === 'POST') {
    let corps;
    try { corps = await request.json(); } catch { return json({ erreur: 'Requête illisible.' }, 400); }
    return enregistrerNettoyage(env, corps, maintenant);
  }
  return null;
}
