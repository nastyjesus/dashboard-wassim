// Prospection des lieux : les théâtres, parcs, musées et cinémas que Wassim
// invite à proposer leurs sorties (formulaire du site, voir propositions.js).
//
// Décisions de Wassim (6 octobre 2026) : ~25 lieux par ville ouverte, quatre
// types (spectacle jeune public, loisirs privés, musées/sciences, cinémas),
// suivi dans l'admin, e-mails envoyés à la main depuis contact@papaparfait.fr
// (jamais d'envoi automatique : la délivrabilité du domaine sert aussi aux
// alertes du week-end).
//
// Stockage : un seul document KV `prospect:lieux` ({version, lieux: [...]}) —
// quelques centaines de lieux, lus et écrits ensemble par l'admin.
//
//   GET  /admin/api/prospection          le document
//   POST /admin/api/prospection          {id, statut?, note?} : une mise à jour

const CLE = 'prospect:lieux';
export const STATUTS = ['a-contacter', 'contacte', 'relance', 'a-propose', 'refus', 'injoignable'];
const TYPES = ['spectacle', 'loisirs', 'musee', 'cinema'];

const sansAccents = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
/** Identifiant stable d'un lieu : ville + nom normalisé. */
export const idLieu = (ville, nom) => `${ville}:${sansAccents(nom).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;

export async function lireProspection(env) {
  return (await env.VOTES.get(CLE, 'json')) || { version: 0, lieux: [] };
}

/**
 * Fusionne une liste de lieux (recherche) dans le document : les nouveaux
 * arrivent « à contacter », les connus gardent leur statut et leur note.
 * Sert au chargement initial et aux compléments (scripts, pas l'admin).
 */
export function fusionner(doc, nouveaux, maintenant = new Date().toISOString()) {
  const parId = new Map(doc.lieux.map((l) => [l.id, l]));
  for (const n of nouveaux) {
    if (!n || !n.nom || !n.ville || !TYPES.includes(n.type)) continue;
    const id = idLieu(n.ville, n.nom);
    const existant = parId.get(id);
    const fiche = {
      id, ville: n.ville, type: n.type, nom: String(n.nom).slice(0, 160), commune: n.commune || null,
      site: n.site || null, email: n.email || null, pageContact: n.pageContact || null,
      telephone: n.telephone || null, pourquoi: n.pourquoi || null,
    };
    parId.set(id, existant
      ? { ...fiche, statut: existant.statut, note: existant.note, contacteLe: existant.contacteLe, majLe: existant.majLe }
      : { ...fiche, statut: 'a-contacter', note: '', ajouteLe: maintenant });
  }
  return { version: doc.version + 1, lieux: [...parId.values()] };
}

/** POST /admin/api/prospection — statut et/ou note d'un lieu. */
export async function majLieu(env, { id, statut, note }) {
  const doc = await lireProspection(env);
  const lieu = doc.lieux.find((l) => l.id === id);
  if (!lieu) return { erreur: 'lieu introuvable' };
  const le = new Date().toISOString();
  if (statut !== undefined) {
    if (!STATUTS.includes(statut)) return { erreur: 'statut inconnu' };
    // Première prise de contact datée : c'est elle qui déclenche « à relancer ».
    if (statut === 'contacte' && !lieu.contacteLe) lieu.contacteLe = le;
    if (statut === 'relance') lieu.relanceLe = le;
    lieu.statut = statut;
  }
  if (note !== undefined) lieu.note = String(note).slice(0, 500);
  lieu.majLe = le;
  doc.version += 1;
  await env.VOTES.put(CLE, JSON.stringify(doc));
  return { ok: true, lieu };
}

const hote = (url) => {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return null; }
};
const WEBMAILS = /^(gmail|yahoo|hotmail|outlook|orange|free|wanadoo|laposte|sfr|icloud|live)\./;

/**
 * Une proposition arrive : si elle vient d'un lieu prospecté (même domaine
 * d'e-mail ou de site, ou même nom), il passe « a proposé ». Sans effet si
 * rien ne correspond — une proposition spontanée n'a pas besoin de fiche.
 */
export async function rapprocherProposition(env, p) {
  const doc = await lireProspection(env);
  if (!doc.lieux.length) return null;
  const domaineMail = (p.contactEmail || '').split('@')[1] || '';
  const domaine = WEBMAILS.test(domaineMail) ? null : domaineMail;
  const sites = [p.urlOfficielle, p.billetterie].map(hote).filter(Boolean);
  const nom = sansAccents(p.organisme).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const lieu = doc.lieux.find((l) => {
    const h = hote(l.site);
    const domaineLieu = (l.email || '').split('@')[1];
    return (domaine && (domaine === h || domaine === domaineLieu))
      || (h && sites.includes(h))
      || (nom && sansAccents(l.nom).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() === nom);
  });
  if (!lieu || lieu.statut === 'a-propose') return lieu ? lieu.id : null;
  lieu.statut = 'a-propose';
  lieu.majLe = new Date().toISOString();
  lieu.note = [lieu.note, `Proposition reçue : « ${p.titre} »`].filter(Boolean).join(' — ').slice(0, 500);
  doc.version += 1;
  await env.VOTES.put(CLE, JSON.stringify(doc));
  return lieu.id;
}
