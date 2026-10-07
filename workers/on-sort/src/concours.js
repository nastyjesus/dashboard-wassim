// Concours avec des lieux partenaires : des places à gagner, pour faire
// connaître Papa Parfait et faire grossir l'alerte du week-end.
//
//   GET  /concours/<id>              infos publiques (ouvert ? lot, dates…)
//   GET  /concours/<id>/reglement    le règlement (page HTML)
//   POST /concours/<id>/participer   le formulaire (page du site WordPress)
//   GET  /admin/api/concours         liste + nombre de participants
//   POST /admin/api/concours         {action: enregistrer|tirer|prevenir, …}
//   GET  /admin/api/concours/participants?id=   export CSV
//
// Décisions de Wassim (7 octobre 2026) :
//  - participation sur une page du site, formulaire envoyé ici ;
//  - prénom, e-mail, ville ; l'alerte du week-end est une case DÉCOCHÉE par
//    défaut, jamais une condition de participation (consentement libre, RGPD) ;
//  - tirage par un bouton dans l'admin (tracé : date, nombre de participants),
//    puis envoi aux gagnants après relecture.

import { VILLES, villeParId } from './villes.js';
import { envoyerEmail, abonnerSansCompte } from './alerte.js';

const CLE_LISTE = 'concours:liste';
const CLE_P = 'concours:p:'; // concours:p:<id>:<empreinte e-mail>
const CLE_LIMITE = 'concours:limite:';
const ENVOIS_PAR_HEURE = 10;

const txt = (v, max) => String(v ?? '').trim().slice(0, max);
const echapper = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const coche = (v) => v === 'on' || v === 'true' || v === '1' || v === 'oui';

async function empreinte(texte) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texte));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

export async function lireConcours(env) {
  return (await env.VOTES.get(CLE_LISTE, 'json')) || { version: 0, concours: [] };
}

async function ecrireConcours(env, doc) {
  doc.version += 1;
  await env.VOTES.put(CLE_LISTE, JSON.stringify(doc));
}

/** Ouvert maintenant ? (les dates de fin sont incluses jusqu'à 23:59 heure de Paris ≈ UTC+2). */
export function estOuvert(c, maintenant = new Date()) {
  const t = maintenant.toISOString();
  return Boolean(c) && !c.tirageLe && t >= `${c.debut}T00:00:00Z` && t <= `${c.fin}T21:59:59Z`;
}

/** Vue publique : rien de personnel. */
function publique(c, maintenant) {
  return {
    id: c.id, titre: c.titre, lot: c.lot, partenaire: c.partenaire, partenaireUrl: c.partenaireUrl || null,
    villes: c.villes, nbGagnants: c.nbGagnants, debut: c.debut, fin: c.fin, ouvert: estOuvert(c, maintenant),
  };
}

export async function concoursPublic(env, id) {
  const c = (await lireConcours(env)).concours.find((x) => x.id === id);
  return c ? publique(c, new Date()) : null;
}

/** Règlement généré à partir du concours : une page sobre, imprimable. */
export function pageReglement(c) {
  const villes = (c.villes || []).map((v) => villeParId(v)?.nom).filter(Boolean).join(', ') || 'toutes les villes ouvertes de Papa Parfait';
  const date = (iso) => iso.split('-').reverse().join('/');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Règlement — ${echapper(c.titre)}</title><meta name="robots" content="noindex">
<style>body{font:16px/1.6 system-ui,sans-serif;max-width:720px;margin:32px auto;padding:0 16px;color:#1B2430;background:#ECE6DA}h1{font-size:24px}h2{font-size:18px;margin-top:24px}</style></head><body>
<h1>Règlement du jeu-concours « ${echapper(c.titre)} »</h1>
<h2>1. Organisateur</h2><p>Le jeu est organisé par l’éditeur de Papa Parfait (papaparfait.fr — voir les mentions légales du site), en partenariat avec ${echapper(c.partenaire)}.</p>
<h2>2. Durée</h2><p>Du ${date(c.debut)} au ${date(c.fin)} inclus, 23 h 59 (heure de Paris).</p>
<h2>3. Participation</h2><p>Gratuite et sans obligation d’achat, ouverte à toute personne majeure résidant en France métropolitaine. Une seule participation par adresse e-mail. Participer ne nécessite pas de créer un compte ni de s’abonner à quoi que ce soit : l’inscription à l’alerte du week-end est une option distincte, décochée par défaut, et sans effet sur les chances de gagner.</p>
<h2>4. Dotation</h2><p>${echapper(c.lot)} — ${Number(c.nbGagnants)} gagnant(s). Lots offerts par ${echapper(c.partenaire)}, ni échangeables ni remboursables. Zone concernée : ${echapper(villes)}.</p>
<h2>5. Tirage au sort</h2><p>Après la clôture, les gagnants sont tirés au sort parmi les participations valides par un tirage aléatoire informatique, puis prévenus par e-mail. Sans réponse de leur part sous 7 jours, le lot peut être réattribué.</p>
<h2>6. Données personnelles</h2><p>Prénom, e-mail et ville servent uniquement à gérer le jeu et à contacter les gagnants ; ils sont supprimés 3 mois après le tirage. Ils ne sont ni vendus ni transmis au partenaire, sauf le prénom et l’e-mail des gagnants pour la remise du lot. Droit d’accès, de rectification et d’effacement : contact@papaparfait.fr.</p>
<h2>7. Litiges</h2><p>Le présent règlement est soumis au droit français. Toute question : contact@papaparfait.fr.</p>
</body></html>`;
}

async function limiteDepassee(env, ip) {
  const cle = `${CLE_LIMITE}${ip}:${new Date().toISOString().slice(0, 13)}`;
  const n = Number.parseInt((await env.VOTES.get(cle)) || '0', 10) || 0;
  if (n >= ENVOIS_PAR_HEURE) return true;
  await env.VOTES.put(cle, String(n + 1), { expirationTtl: 3700 });
  return false;
}

/** POST /concours/<id>/participer */
export async function participer(request, env, id) {
  if (!env.VOTES) return { status: 503, corps: { ok: false, erreur: 'indisponible' } };
  let form;
  try { form = await request.formData(); } catch { return { status: 400, corps: { ok: false, erreur: 'formulaire_illisible' } }; }
  if (txt(form.get('site_web'), 200)) return { status: 200, corps: { ok: true } }; // champ piège

  const c = (await lireConcours(env)).concours.find((x) => x.id === id);
  if (!c) return { status: 404, corps: { ok: false, erreur: 'concours_inconnu' } };
  if (!estOuvert(c)) return { status: 400, corps: { ok: false, erreur: 'clos', message: 'Ce concours est terminé. Merci de votre intérêt !' } };
  if (await limiteDepassee(env, request.headers.get('CF-Connecting-IP') || 'inconnue')) {
    return { status: 429, corps: { ok: false, erreur: 'trop_de_participations', message: 'Trop d’envois depuis votre connexion. Réessayez dans une heure.' } };
  }

  const prenom = txt(form.get('prenom'), 60);
  const email = txt(form.get('email'), 160).toLowerCase();
  const ville = txt(form.get('ville'), 40);
  const erreurs = {};
  if (!prenom) erreurs.prenom = 'Votre prénom, pour vous féliciter si vous gagnez.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) erreurs.email = 'Une adresse e-mail valide, pour vous prévenir.';
  if (!villeParId(ville)) erreurs.ville = 'Choisissez votre ville.';
  if (!coche(form.get('reglement'))) erreurs.reglement = 'Merci d’accepter le règlement du jeu.';
  if (Object.keys(erreurs).length) return { status: 400, corps: { ok: false, erreur: 'champs', erreurs } };

  const cle = `${CLE_P}${id}:${await empreinte(email)}`;
  if (await env.VOTES.get(cle)) return { status: 200, corps: { ok: true, deja: true } };
  const alerte = coche(form.get('alerte'));
  await env.VOTES.put(cle, JSON.stringify({ prenom, email, villeId: ville, alerte, le: new Date().toISOString() }));
  if (alerte) await abonnerSansCompte(env, { email, prenom, villeId: ville, source: `concours:${id}` });
  return { status: 200, corps: { ok: true } };
}

async function participants(env, id) {
  const { keys } = await env.VOTES.list({ prefix: `${CLE_P}${id}:`, limit: 1000 });
  return (await Promise.all(keys.map((k) => env.VOTES.get(k.name, 'json')))).filter(Boolean);
}

/** GET /admin/api/concours */
export async function listerConcours(env) {
  const doc = await lireConcours(env);
  const concours = await Promise.all(doc.concours.map(async (c) => {
    const ps = await participants(env, c.id);
    return { ...c, ouvert: estOuvert(c), nbParticipants: ps.length, nbAlerte: ps.filter((p) => p.alerte).length };
  }));
  return { version: doc.version, concours };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const VILLES_IDS = new Set(VILLES.map((v) => v.id));

function nettoyer(brut) {
  const c = {
    id: txt(brut.id, 60).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, ''),
    titre: txt(brut.titre, 160),
    lot: txt(brut.lot, 300),
    partenaire: txt(brut.partenaire, 120),
    partenaireUrl: txt(brut.partenaireUrl, 500) || null,
    villes: (Array.isArray(brut.villes) ? brut.villes : []).filter((v) => VILLES_IDS.has(v)),
    nbGagnants: Number.parseInt(brut.nbGagnants, 10),
    debut: txt(brut.debut, 10),
    fin: txt(brut.fin, 10),
  };
  if (!c.id || !c.titre || !c.lot || !c.partenaire) return { erreur: 'identifiant, titre, lot et partenaire obligatoires' };
  if (!Number.isInteger(c.nbGagnants) || c.nbGagnants < 1 || c.nbGagnants > 50) return { erreur: 'nombre de gagnants entre 1 et 50' };
  if (!DATE.test(c.debut) || !DATE.test(c.fin) || c.fin < c.debut) return { erreur: 'dates de début et de fin invalides' };
  if (c.partenaireUrl && !/^https?:\/\//.test(c.partenaireUrl)) return { erreur: 'lien du partenaire en https://' };
  return { concours: c };
}

/** Tirage uniforme sans remise (crypto.getRandomValues, pas Math.random). */
export function tirer(liste, n) {
  const pool = [...liste];
  const choisis = [];
  while (choisis.length < n && pool.length) {
    const r = new Uint32Array(1);
    crypto.getRandomValues(r);
    choisis.push(pool.splice(r[0] % pool.length, 1)[0]);
  }
  return choisis;
}

/** POST /admin/api/concours */
export async function agirConcours(env, corps) {
  const doc = await lireConcours(env);
  if (corps.action === 'enregistrer') {
    const { concours: c, erreur } = nettoyer(corps.concours || {});
    if (erreur) return { erreur };
    const i = doc.concours.findIndex((x) => x.id === c.id);
    if (i >= 0 && doc.concours[i].tirageLe) return { erreur: 'concours déjà tiré : il ne se modifie plus' };
    if (i >= 0) doc.concours[i] = { ...doc.concours[i], ...c }; else doc.concours.unshift({ ...c, creeLe: new Date().toISOString() });
    await ecrireConcours(env, doc);
    return { ok: true };
  }
  const c = doc.concours.find((x) => x.id === corps.id);
  if (!c) return { erreur: 'concours introuvable' };

  if (corps.action === 'tirer') {
    if (c.tirageLe) return { erreur: 'déjà tiré' };
    if (estOuvert(c)) return { erreur: 'le concours est encore ouvert : attendre la clôture' };
    const ps = await participants(env, c.id);
    if (!ps.length) return { erreur: 'aucun participant' };
    c.gagnants = tirer(ps, c.nbGagnants).map((p) => ({ prenom: p.prenom, email: p.email, villeId: p.villeId }));
    c.tirageLe = new Date().toISOString();
    c.tirageParmi = ps.length;
    await ecrireConcours(env, doc);
    return { ok: true, gagnants: c.gagnants, parmi: ps.length };
  }

  if (corps.action === 'prevenir') {
    if (!c.tirageLe) return { erreur: 'tirer au sort d’abord' };
    if (c.prevenusLe) return { erreur: 'gagnants déjà prévenus' };
    if (!env.RESEND_KEY) return { erreur: 'envoi d’e-mail non configuré (RESEND_KEY)' };
    const resultats = await Promise.allSettled(c.gagnants.map((g) => envoyerEmail(env, {
      to: g.email,
      replyTo: 'contact@papaparfait.fr',
      subject: `Bravo ${g.prenom}, vous avez gagné : ${c.lot}`,
      text: `Bonjour ${g.prenom},\n\nBonne nouvelle : vous avez été tiré(e) au sort au jeu « ${c.titre} » et gagnez ${c.lot}, offert par ${c.partenaire}.\n\nRépondez simplement à cet e-mail sous 7 jours pour que nous organisions la remise de votre lot.\n\nÀ bientôt,\nL'équipe Papa Parfait`,
      html: `<p>Bonjour ${echapper(g.prenom)},</p><p>Bonne nouvelle : vous avez été tiré(e) au sort au jeu « <b>${echapper(c.titre)}</b> » et gagnez <b>${echapper(c.lot)}</b>, offert par ${echapper(c.partenaire)}.</p><p>Répondez simplement à cet e-mail <b>sous 7 jours</b> pour que nous organisions la remise de votre lot.</p><p>À bientôt,<br>L’équipe Papa Parfait</p>`,
    })));
    c.prevenusLe = new Date().toISOString();
    c.prevenus = resultats.filter((r) => r.status === 'fulfilled').length;
    await ecrireConcours(env, doc);
    return { ok: true, prevenus: c.prevenus, echecs: resultats.length - c.prevenus };
  }
  return { erreur: 'action inconnue' };
}

/** GET /admin/api/concours/participants?id= — CSV (point-virgule, pour Excel). */
export async function csvParticipants(env, id) {
  const ps = await participants(env, id);
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return ['prenom;email;ville;alerte;le', ...ps.map((p) => [p.prenom, p.email, p.villeId, p.alerte ? 'oui' : 'non', p.le].map(cell).join(';'))].join('\r\n');
}

const CONSERVATION_JOURS = 90;

/**
 * Purge promise par le règlement : les participations d'un concours tiré il y
 * a plus de 3 mois sont effacées (les gagnants aussi, de la fiche du
 * concours). Un participant qui a coché l'alerte reste abonné : c'est une
 * inscription distincte, avec son propre lien de désabonnement.
 * Appelée chaque matin par le cron (index.js).
 */
export async function purgerConcours(env, maintenant = new Date()) {
  if (!env.VOTES) return { purges: 0 };
  const doc = await lireConcours(env);
  const limite = new Date(maintenant.getTime() - CONSERVATION_JOURS * 86400000).toISOString();
  let purges = 0;
  for (const c of doc.concours) {
    if (!c.tirageLe || c.purgeLe || c.tirageLe > limite) continue;
    const { keys } = await env.VOTES.list({ prefix: `${CLE_P}${c.id}:`, limit: 1000 });
    for (const k of keys) { await env.VOTES.delete(k.name); purges += 1; }
    c.gagnants = (c.gagnants || []).map((g) => ({ prenom: g.prenom, villeId: g.villeId }));
    c.purgeLe = maintenant.toISOString();
  }
  if (purges || doc.concours.some((c) => c.purgeLe === maintenant.toISOString())) await ecrireConcours(env, doc);
  return { purges };
}
