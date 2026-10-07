// Encart « Le top du moment » des pages thématiques du site WordPress
// (papaparfait.fr, périmètre Cowork) : « Que faire à Rennes ce week-end avec
// les enfants », « … avec un enfant de 2 ans », « … quand il pleut »…
//
//   GET /encart?ville=rennes&page=ce-week-end[&jour=dimanche]
//     → un fragment HTML (200), ou 204 si rien à montrer (hors saison, top vide).
//
// Décisions de Wassim (7 octobre 2026) : texte durable rédigé par Cowork +
// cet encart, inséré CÔTÉ SERVEUR par un shortcode WordPress (Google le lit
// comme du texte) ; bouton vers l'app avec ville et âge préremplis ; pages
// d'abord pour Rennes, Nantes, Bordeaux, Lille et Paris.
//
// Le fragment ne dépend d'aucune feuille de style : classes « pp-encart-* »
// que le thème peut habiller, et un style minimal en ligne.

import { scorer, selectionner, dedoublonner } from './scoring.js';
import { villeParId } from './villes.js';

const LIEN_APP = 'https://papa-parfait-web.loumiwassim.workers.dev';
const AGE_DEFAUT = 3;

const plus = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const jourSemaine = (iso) => new Date(`${iso}T12:00:00Z`).getUTCDay();
/** Prochain jour de la semaine `j` (0 = dimanche), aujourd'hui compris. */
const prochain = (iso, j) => plus(iso, (j - jourSemaine(iso) + 7) % 7);
/** Prochain lundi, mardi, jeudi ou vendredi (jours d'école), aujourd'hui compris. */
function prochainJourEcole(iso) {
  let d = iso;
  while (![1, 2, 4, 5].includes(jourSemaine(d))) d = plus(d, 1);
  return d;
}
/** Dans une fenêtre saisonnière : le prochain samedi qui y tombe, sinon le premier jour à venir ; null hors saison. */
function dateSaison(iso, debut, fin) {
  if (iso > fin) return null;
  const depart = iso < debut ? debut : iso;
  const samedi = prochain(depart, 6);
  return samedi <= fin ? samedi : depart;
}

const aLaRaison = (r) => (ev) => (ev.raisons || []).includes(r);
const duGenre = (g) => (ev) => ev.genre === g;

/**
 * Les pages. Chacune dit : quel jour, quel âge, quel filtre, et son titre.
 * Les saisons portent leurs dates 2026-2027 (vacances : zones A, B et C
 * confondues pour la Toussaint ; à mettre à jour chaque année).
 */
export const PAGES = {
  'aujourd-hui': { titre: 'aujourd’hui', date: (t) => t },
  'ce-week-end': { titre: 'ce week-end', date: (t, jour) => prochain(t, jour === 'dimanche' ? 0 : 6) },
  bebe: { titre: 'avec un bébé', age: 0, date: (t) => prochain(t, 6) },
  '1-an': { titre: 'avec un enfant de 1 an', age: 1, date: (t) => prochain(t, 6) },
  '2-ans': { titre: 'avec un enfant de 2 ans', age: 2, date: (t) => prochain(t, 6) },
  '3-ans': { titre: 'avec un enfant de 3 ans', age: 3, date: (t) => prochain(t, 6) },
  '4-5-ans': { titre: 'avec un enfant de 4-5 ans', age: 4, date: (t) => prochain(t, 6) },
  '6-10-ans': { titre: 'avec un enfant de 6 à 10 ans', age: 7, date: (t) => prochain(t, 6) },
  'quand-il-pleut': { titre: 'quand il pleut', pluie: true, date: (t) => prochain(t, 6) },
  gratuit: { titre: 'gratuitement', filtre: (ev) => ev.gratuit === true || aLaRaison('Gratuit')(ev), date: (t) => prochain(t, 6) },
  'apres-l-ecole': { titre: 'après l’école', filtre: aLaRaison('Après l’école'), date: prochainJourEcole },
  'vacances-toussaint': { titre: 'pendant les vacances de la Toussaint', date: (t) => dateSaison(t, '2026-10-17', '2026-11-01') },
  // Halloween : la semaine qui précède, là où se concentrent les animations.
  halloween: { titre: 'pour Halloween', filtre: duGenre('halloween'), date: (t) => dateSaison(t, '2026-10-24', '2026-11-01') },
  noel: { titre: 'pour Noël', filtre: duGenre('noel'), date: (t) => dateSaison(t, '2026-11-28', '2026-12-24') },
  carnaval: { titre: 'pour le carnaval', filtre: duGenre('parade'), date: (t) => dateSaison(t, '2027-02-06', '2027-03-14') },
};

const echapper = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function dateLongue(iso) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}

/** Mention exigée par les licences (DATAtourisme, Que faire à Paris) — même règle que l'app. */
function mention(ev) {
  if (!ev.source) return null;
  if (!ev.majLe) return `Source : ${ev.source}`;
  const [a, m, j] = ev.majLe.split('-');
  return `Source : ${ev.source}, mise à jour le ${j}/${m}/${a}`;
}

/** Les pastilles utiles hors de l'app : âge, gratuit, à l'abri, à ne pas rater. */
const PASTILLES = /^(\d|Dès|Gratuit|À l’abri|À ne pas rater|Après l’école|Pensé pour)/;

export function rendre({ ville, page, dateISO, age, top }) {
  // L'app ne connaît que 0-5 ans (contrat site ↔ app) : la page « 6-10 ans »
  // envoie 5, l'âge le plus proche, plutôt qu'un 7 que l'app ramènerait à 3.
  const lien = `${LIEN_APP}/?ville=${encodeURIComponent(ville.id)}&age=${Math.min(age, 5)}`;
  const items = top.map((ev) => {
    const lieu = [ev.lieuNom, ev.ville].filter(Boolean).join(', ');
    const tags = (ev.raisons || []).filter((r) => PASTILLES.test(r)).slice(0, 3);
    const m = mention(ev);
    return '<li class="pp-encart-sortie" style="margin:0 0 14px">'
      + `<strong class="pp-encart-titre">${echapper(ev.titre)}</strong>`
      + `<div class="pp-encart-infos" style="font-size:.95em">${echapper([lieu, ev.horaires].filter(Boolean).join(' · '))}</div>`
      + (tags.length ? `<div class="pp-encart-tags" style="font-size:.85em">${tags.map((t) => echapper(t)).join(' · ')}</div>` : '')
      + (m ? `<div class="pp-encart-source" style="font-size:.75em;opacity:.7">${echapper(m)}</div>` : '')
      + '</li>';
  }).join('');
  return `<section class="pp-encart" style="border:2px solid #1B2430;border-radius:10px;padding:16px 20px;margin:24px 0">`
    + `<h2 class="pp-encart-entete" style="margin-top:0">Le top du moment à ${echapper(ville.nom)} ${echapper(page.titre)} — ${echapper(dateLongue(dateISO))}</h2>`
    + `<ol class="pp-encart-liste" style="padding-left:20px">${items}</ol>`
    + `<p class="pp-encart-cta" style="margin-bottom:0"><a href="${echapper(lien)}" style="display:inline-block;background:#FF8A00;color:#1B2430;border:2px solid #1B2430;border-radius:999px;padding:10px 20px;font-weight:700;text-decoration:none">Voir le top du jour pour mon enfant</a></p>`
    + `<p class="pp-encart-maj" style="font-size:.75em;opacity:.7;margin-bottom:0">Sélection calculée par Papa Parfait selon l’âge, la distance, l’horaire et la météo — mise à jour plusieurs fois par jour.</p>`
    + '</section>';
}

/**
 * Calcule l'encart. `deps` : chargerSources, lireParams, lireSurcouche,
 * appliquerSurcouche (index.js) — injectés pour éviter un import circulaire.
 * @returns {Promise<{statut: number, html?: string, erreur?: string}>}
 */
export async function calculerEncart(url, env, deps, aujourdhui = new Date().toISOString().slice(0, 10)) {
  const ville = villeParId(url.searchParams.get('ville') || '');
  const page = PAGES[url.searchParams.get('page') || ''];
  if (!ville) return { statut: 400, erreur: 'ville_inconnue' };
  if (!page) return { statut: 400, erreur: 'page_inconnue' };
  const dateISO = page.date(aujourdhui, url.searchParams.get('jour'));
  if (!dateISO) return { statut: 204 }; // hors saison : rien à afficher
  const age = page.age ?? AGE_DEFAUT;

  const p = deps.lireParams(new URL(`https://x/top?city=${ville.id}&date=${dateISO}&age=${age}`));
  const [{ evenements: bruts, meteo }, surcouche] = await Promise.all([deps.chargerSources(env, p), deps.lireSurcouche(env)]);
  const evenements = deps.appliquerSurcouche(bruts, surcouche, dateISO);
  const ctx = {
    dateISO, lat: p.lat, lon: p.lon, age, rayonKm: p.rayonKm,
    // « Quand il pleut » : on classe comme un jour de pluie, quelle que soit la prévision.
    meteo: page.pluie ? { ...(meteo || {}), pluie: true } : meteo,
  };
  const retenus = dedoublonner(evenements).map((ev) => scorer(ev, ctx)).filter(Boolean)
    .filter(page.filtre || (() => true))
    .filter((ev) => !ev.masque);
  const top = selectionner(retenus, 5);
  if (!top.length) return { statut: 204 };
  return { statut: 200, html: rendre({ ville, page, dateISO, age, top }) };
}
