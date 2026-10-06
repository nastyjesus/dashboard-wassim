// Source : agenda RSS des médiathèques de Lorient (CMS Decalog).
// https://mediatheque.lorient.bzh/agenda/rss/nid/218450
//
// Seule source dans Lorient même (DATAtourisme ne couvre pas l'agglo :
// rien à moins de 18 km le 10 octobre 2026). Volume modeste (3-4 rendez-vous
// par samedi) mais étiqueté par public : « Petite enfance », « Maternelle >
// 3 ans », « Famille »…
//
// Forme relevée le 5 octobre 2026 : un <item> par séance, <pubDate> = début
// de la séance (heure locale avec fuseau), étiquettes en badges HTML en tête
// de <description> (lieu, public, type). Pas de coordonnées : les trois
// lieux sont géocodés ici (Base Adresse Nationale, adresses de la page
// horaires officielle).

import { champsDescription, texteLisible } from '../texte.js';
import { distanceKm } from '../scoring.js';

const RSS_DEFAUT = 'https://mediatheque.lorient.bzh/agenda/rss/nid/218450';
const CENTRE = { lat: 47.748, lon: -3.366 }; // Lorient
// Au-delà, aucune médiathèque de Lorient n'entre dans le rayon : on
// n'interroge pas le flux pour rien (les trois lieux sont à < 3 km du centre).
const MARGE_KM = 5;

const LIEUX = {
  'Médiathèque François Mitterrand': { adresse: '4 place François Mitterrand, 56100 Lorient', lat: 47.754654, lon: -3.365923 },
  'Médiathèque de Kervénanec': { adresse: '5 rue Maurice Thorez, 56100 Lorient', lat: 47.740952, lon: -3.393335 },
  'Médiathèque de Keryado': { adresse: '24 rue de Kersabiec, 56100 Lorient', lat: 47.764416, lon: -3.385134 },
};
// « Dans les 3 médiathèques » : la plus centrale, en lieu de référence.
const LIEU_DEFAUT = 'Médiathèque François Mitterrand';

/**
 * Étiquettes de public → phrase que les heuristiques famille savent lire
 * (tranche d'âge, « en famille », exclusions), placée en tête de description.
 */
const PUBLICS = {
  'Petite enfance': 'Pour les tout-petits de 0 à 3 ans',
  'Maternelle > 3 ans': 'Pour les enfants de 3 à 6 ans',
  'Enfant > 6 ans': 'Pour les enfants à partir de 6 ans',
  Famille: 'À partager en famille',
  Adolescent: 'Pour les ados',
  Senior: 'Pour les seniors',
};

/**
 * Les médiathèques étiquettent elles-mêmes leurs séances enfants. Sans une
 * de ces étiquettes, une séance n'est pas une sortie famille, même si son
 * texte emploie un mot qui y ressemble (« Vente et dédicace » d'illustrateurs
 * d'un univers « fantastique », constaté le 5 octobre 2026).
 */
const PUBLICS_ENFANT = new Set(['Petite enfance', 'Maternelle > 3 ans', 'Enfant > 6 ans', 'Famille']);

const MOIS = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };

const ENTITES = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', rsquo: '’', lsquo: '‘', laquo: '«', raquo: '»',
  ldquo: '“', rdquo: '”', hellip: '…', ndash: '–', mdash: '—', oelig: 'œ', OElig: 'Œ',
  eacute: 'é', egrave: 'è', ecirc: 'ê', euml: 'ë', Eacute: 'É', Egrave: 'È', Ecirc: 'Ê',
  agrave: 'à', acirc: 'â', Agrave: 'À', ccedil: 'ç', Ccedil: 'Ç', icirc: 'î', iuml: 'ï',
  ocirc: 'ô', ugrave: 'ù', ucirc: 'û', uuml: 'ü',
};

function decoder(s) {
  return String(s || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-z]+);/gi, (m, nom) => ENTITES[nom] ?? m);
}

function texteBrut(html) {
  return decoder(String(html || '').replace(/<(script|style|iframe)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ').trim();
}

/** « Sat, 10 Oct 2026 14:30:00 +0200 » → { date: '2026-10-10', heure: '14:30' } (heure locale). */
function debutLocal(pubDate) {
  const m = /(\d{1,2}) (\w{3}) (\d{4}) (\d{2}):(\d{2})/.exec(pubDate || '');
  if (!m || !MOIS[m[2]]) return null;
  return { date: `${m[3]}-${MOIS[m[2]]}-${m[1].padStart(2, '0')}`, heure: `${m[4]}:${m[5]}` };
}

function cdata(bloc, balise) {
  const m = new RegExp(`<${balise}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${balise}>`).exec(bloc);
  return m ? m[1].trim() : '';
}

export function normaliser(bloc) {
  const titre = texteBrut(cdata(bloc, 'title'));
  const debut = debutLocal(cdata(bloc, 'pubDate'));
  if (!titre || !debut) return null;
  const html = cdata(bloc, 'description');
  // Les badges (lieu, public, type) précèdent le texte : on les lit puis on
  // les retire pour ne garder que la description.
  const etiquettes = [...html.matchAll(/class="badge"[^>]*>\s*([^<]+?)\s*</g)].map((m) => decoder(m[1]).trim());
  const corps = html.replace(/<div class="node-item-tags">[\s\S]*?<\/div>/, ' ');
  const lieuNom = etiquettes.find((e) => LIEUX[e]) || (etiquettes.includes('Dans les 3 médiathèques') ? 'Médiathèques de Lorient' : null);
  const lieu = LIEUX[lieuNom] || LIEUX[LIEU_DEFAUT];
  const publics = etiquettes.filter((e) => PUBLICS[e]).map((e) => PUBLICS[e]);
  const lien = cdata(bloc, 'link');
  return {
    origine: 'mediatheques-lorient',
    source: null, // pas de licence à citer (≠ DATAtourisme) ; la fiche renvoie au site
    majLe: null,
    id: `${lien}#${debut.date}T${debut.heure}`,
    titre,
    // Le public en tête : lisible sur la fiche, et c'est là (titre +
    // description) que la détection d'âge le cherche.
    ...champsDescription([publics.join('. '), texteLisible(corps)].filter(Boolean).join('\n')),
    motsCles: etiquettes.filter((e) => !LIEUX[e] && !PUBLICS[e]),
    dateDebut: debut.date,
    dateFin: debut.date,
    horaires: null,
    creneaux: [{ debut: `${debut.date}T${debut.heure}`, fin: null }],
    lieuNom: lieuNom || LIEU_DEFAUT,
    adresse: lieu.adresse,
    ville: 'Lorient',
    lat: lieu.lat,
    lon: lieu.lon,
    url: lien || 'https://mediatheque.lorient.bzh/au-programme',
    // « Tous les évènements des médiathèques sont gratuits » (site officiel).
    gratuit: true,
    publicEnfant: etiquettes.some((e) => PUBLICS_ENFANT.has(e)),
  };
}

/**
 * Séances du jour demandé, si Lorient est dans le rayon.
 * @param {{MEDIATHEQUES_LORIENT_RSS?: string}} env
 * @param {{lat: number, lon: number, rayonKm: number, dateISO: string}} params
 * @returns {Promise<{ok: boolean, evenements: object[], horsZone?: boolean, erreur?: string}>}
 */
export async function evenementsMediathequesLorient(env, { lat, lon, rayonKm, dateISO }) {
  if (distanceKm(lat, lon, CENTRE.lat, CENTRE.lon) > (rayonKm || 40) + MARGE_KM) {
    return { ok: true, evenements: [], horsZone: true };
  }
  try {
    const res = await fetch(env.MEDIATHEQUES_LORIENT_RSS || RSS_DEFAUT, {
      headers: { Accept: 'application/rss+xml, application/xml', 'User-Agent': 'on-sort-poc (papa-parfait)' },
    });
    if (!res.ok) return { ok: false, evenements: [], erreur: `HTTP ${res.status}` };
    const xml = await res.text();
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
    // Le flux annonce toujours des semaines de programme : vide, c'est une
    // page d'erreur ou un blocage, pas une journée sans séance.
    if (!items.length) return { ok: false, evenements: [], erreur: 'flux_vide' };
    const duJour = items.map((m) => normaliser(m[1])).filter((ev) => ev && ev.dateDebut === dateISO);
    const evenements = duJour.filter((ev) => ev.publicEnfant);
    return { ok: true, evenements, seancesDuJour: duJour.length };
  } catch (e) {
    return { ok: false, evenements: [], erreur: String(e.message || e) };
  }
}
