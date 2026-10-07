// Veille concurrente : chaque vendredi, la sélection « ce week-end » de
// rennesenfamille.fr (le concurrent rennais, voir decisions.md) est comparée à
// nos sources du samedi pour Rennes.
//
// Décision de Wassim (7 octobre 2026) : veille seulement, pas de contact.
// On ne lit que les TITRES de sa page publique « ce week-end », une fois par
// semaine, pour un usage interne : rien n'est republié, rien n'entre dans nos
// tops. Ses mentions légales interdisent la reproduction de ses contenus.
//
// Le résultat dit, pour chacune de ses sorties du samedi : absente de nos
// sources (→ le lieu est à prospecter), présente mais écartée (et pourquoi),
// ou retenue (avec son score). Le 6 octobre 2026, 14 sur 19 étaient absentes.
//
//   GET  /admin/api/veille   le dernier relevé + l'historique
//   POST /admin/api/veille   relève tout de suite (sinon : cron du vendredi)

import { evaluer, dedoublonner } from './scoring.js';
import { villeParId } from './villes.js';

const URL_CONCURRENT = 'https://www.rennesenfamille.fr/ce-week-end';
const UA = 'PapaParfait-veille/1.0 (+mailto:contact@papaparfait.fr)';
const CLE = 'veille:rennesenfamille';
const CLE_HISTO = 'veille:rennesenfamille:historique';
const HISTO_MAX = 26; // six mois de vendredis

const MOTS_VIDES = new Set(['les', 'des', 'une', 'pour', 'avec', 'dans', 'sur', 'aux', 'par', 'est', 'qui', 'que', 'the', 'and', 'enfants', 'enfant', 'famille', 'atelier', 'ateliers', 'rennes']);

const normaliser = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/&[a-z#0-9]+;/g, ' ').replace(/[’']/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
const motsCles = (s) => normaliser(s).split(' ').filter((m) => m.length >= 3 && !MOTS_VIDES.has(m));
const texte = (h) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#0?39;|&rsquo;/g, '’').replace(/\s+/g, ' ').trim();

/**
 * Les sorties de sa page, par jour : { samedi: [{titre, lieu, heure}], dimanche: [...] }.
 * Forme relevée le 7 octobre 2026 : <h2>20 idées de sorties le samedi 10 octobre</h2>,
 * puis des <a class="event-row …"> avec <small>09:30 · Lieu</small><h3>Titre</h3>.
 */
export function lireSelection(html) {
  const sections = String(html).split(/<h2[^>]*>/).slice(1);
  const resultat = {};
  for (const s of sections) {
    const jour = (texte(s.slice(0, s.indexOf('</h2>'))).match(/le (samedi|dimanche)/i) || [])[1];
    if (!jour) continue;
    resultat[jour.toLowerCase()] = [...s.matchAll(/<a class="event-row[\s\S]*?<\/a>/g)].map((m) => {
      const petit = texte((m[0].match(/<small>([\s\S]*?)<\/small>/) || [])[1]);
      const [heure, lieu] = /^\d{1,2}:\d{2} · /.test(petit) ? petit.split(' · ') : [null, petit];
      return { titre: texte((m[0].match(/<h3>([\s\S]*?)<\/h3>/) || [])[1]), lieu: lieu || null, heure };
    }).filter((x) => x.titre);
  }
  return resultat;
}

/**
 * Notre événement qui correspond à un titre, ou null. Mots significatifs du
 * titre (≥ 3 lettres, hors mots vides) : au moins 2/3 retrouvés dans le nôtre,
 * et au moins un. « Ouescrime – Festival d'escrime artistique » ↔
 * « 2e édition de Ouescrime : festival d'escrime artistique les 10 & 11 octobre ».
 */
export function correspondance(titre, evenements) {
  const cherches = [...new Set(motsCles(titre))];
  if (!cherches.length) return null;
  let meilleur = null;
  for (const ev of evenements) {
    const leurs = new Set(motsCles(ev.titre));
    const trouves = cherches.filter((m) => leurs.has(m)).length;
    const part = trouves / cherches.length;
    if (part >= 2 / 3 && (!meilleur || part > meilleur.part)) meilleur = { ev, part };
  }
  return meilleur ? meilleur.ev : null;
}

/** Le samedi qui vient (aujourd'hui si samedi). */
function prochainSamedi(iso) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + ((6 - d.getUTCDay() + 7) % 7));
  return d.toISOString().slice(0, 10);
}

/**
 * Relève et enregistre. `deps` : lireParams, chargerSources, lireSurcouche,
 * appliquerSurcouche (index.js). Seules les sorties retrouvées sont scorées
 * (≤ 25) : le coût CPU reste minime.
 */
export async function releverVeille(env, deps, maintenant = new Date()) {
  const res = await fetch(URL_CONCURRENT, { headers: { 'User-Agent': UA, Accept: 'text/html' } });
  if (!res.ok) throw new Error(`page concurrente : HTTP ${res.status}`);
  const selection = lireSelection(await res.text());
  const leurs = selection.samedi || [];
  if (!leurs.length) throw new Error('aucune sortie lue le samedi (page modifiée ?)');

  const dateISO = prochainSamedi(maintenant.toISOString().slice(0, 10));
  const ville = villeParId('rennes');
  const p = deps.lireParams(new URL(`https://x/top?city=rennes&date=${dateISO}&age=3`));
  const [{ evenements: bruts, meteo }, surcouche] = await Promise.all([deps.chargerSources(env, p), deps.lireSurcouche(env)]);
  const nos = dedoublonner(deps.appliquerSurcouche(bruts, surcouche, dateISO));
  const ctx = { dateISO, lat: ville.lat, lon: ville.lon, age: 3, rayonKm: p.rayonKm, meteo };

  const lignes = leurs.map((x) => {
    const ev = correspondance(x.titre, nos);
    if (!ev) return { ...x, statut: 'absente' };
    const r = evaluer(ev, ctx);
    return r.exclu
      ? { ...x, statut: 'ecartee', motif: r.exclu, notre: ev.titre, source: ev.origine }
      : { ...x, statut: 'retenue', score: r.score, notre: ev.titre, source: ev.origine };
  });
  const releve = {
    le: maintenant.toISOString(), dateISO, total: lignes.length,
    absentes: lignes.filter((l) => l.statut === 'absente').length,
    ecartees: lignes.filter((l) => l.statut === 'ecartee').length,
    retenues: lignes.filter((l) => l.statut === 'retenue').length,
    lignes,
  };
  await env.VOTES.put(CLE, JSON.stringify(releve));
  const histo = (await env.VOTES.get(CLE_HISTO, 'json')) || [];
  const resume = { le: releve.le, dateISO, total: releve.total, absentes: releve.absentes, ecartees: releve.ecartees, retenues: releve.retenues };
  await env.VOTES.put(CLE_HISTO, JSON.stringify([resume, ...histo.filter((h) => h.dateISO !== dateISO)].slice(0, HISTO_MAX)));
  return resume;
}

export async function lireVeille(env) {
  const [releve, historique] = await Promise.all([env.VOTES.get(CLE, 'json'), env.VOTES.get(CLE_HISTO, 'json')]);
  return { releve: releve || null, historique: historique || [] };
}
