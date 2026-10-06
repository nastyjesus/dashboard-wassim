// Propositions de sorties par les organisateurs (lieux, associations,
// compagnies). Le formulaire vit sur le site WordPress (papaparfait.fr,
// périmètre Cowork) et envoie ici.
//
//   POST /propositions            le formulaire (multipart/form-data)
//   GET  /photos/<id>             photo d'une proposition (publique, id aléatoire)
//   GET  /admin/api/propositions  la file (admin)
//   POST /admin/api/propositions  {id, action: 'valider'|'refuser', motif?, champs?}
//
// Pourquoi (6 octobre 2026) : 14 des 19 sorties du samedi listées par le
// concurrent rennais ne sont dans aucun agenda open data (théâtres, parcs
// privés, cinémas). Un lieu qui propose sa sortie nous donne aussi ce que les
// agendas n'ont pas : prix enfant/adulte, âge, réservation, photo.
//
// Décisions de Wassim (6 octobre 2026) :
//  - validation dans l'admin, e-mail à contact@papaparfait.fr à chaque
//    proposition ; l'organisateur reçoit un accusé puis la décision ;
//  - événements datés ET lieux permanents, 0-10 ans, villes ouvertes seulement
//    (refus immédiat ailleurs) ;
//  - photo ≤ 2 Mo en KV ; anti-spam : champ piège + 5 envois/heure/IP ;
//  - une sortie validée devient une sortie manuelle (surcouche admin), scorée
//    comme les autres : aucun bonus, le GO reste honnête.

import { VILLES } from './villes.js';
import { distanceKm } from './scoring.js';
import { envoyerEmail } from './alerte.js';
import { executerAction } from './admin/surcouche.js';
import { rapprocherProposition } from './admin/prospection.js';

const CLE = 'prop:fiche:';
const CLE_PHOTO = 'prop:photo:';
const CLE_LIMITE = 'prop:limite:';
const ALERTE_A = 'contact@papaparfait.fr';
const ENVOIS_PAR_HEURE = 5;
const PHOTO_MAX = 2 * 1024 * 1024;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const RAYON_VILLE_KM = 40; // même rayon que /top
const SEANCES_MAX = 30;

/** Tranches d'âge du formulaire → bornes. « 10+ » n'a pas de borne haute. */
export const TRANCHES = { '0-3': [0, 3], '3-6': [3, 6], '6-10': [6, 10], '10+': [10, null] };

/** Nom affichable d'une ville ouverte, pour les messages. */
const NOMS_VILLES = VILLES.map((v) => v.nom).join(', ');

const txt = (v, max) => String(v ?? '').trim().slice(0, max);
const echapper = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const coche = (v) => v === 'on' || v === 'true' || v === '1' || v === 'oui';

function prix(v) {
  const s = txt(v, 10).replace(',', '.').replace(/\s*€$/, '');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n <= 500 ? Math.round(n * 100) / 100 : NaN;
}

/**
 * Lit et valide le formulaire. Renvoie {proposition} ou {erreurs: {champ: message}}.
 * Ne touche ni au réseau ni au KV : testable seul.
 */
export function lireFormulaire(form, aujourdhui = new Date().toISOString().slice(0, 10)) {
  const erreurs = {};
  const g = (k, max = 200) => txt(form.get(k), max);
  const type = g('type', 10) === 'lieu' ? 'lieu' : 'evenement';
  const p = {
    type,
    titre: g('titre', 160),
    lieuNom: g('lieuNom', 120),
    adresse: g('adresse', 200),
    codePostal: g('codePostal', 5),
    ville: g('ville', 80),
    description: g('description', 2000),
    tranches: form.getAll('ages').map(String).filter((a) => a in TRANCHES),
    gratuit: coche(form.get('gratuit')),
    prixEnfant: prix(form.get('prixEnfant')),
    prixAdulte: prix(form.get('prixAdulte')),
    reservation: coche(form.get('reservation')),
    billetterie: g('billetterie', 500),
    urlOfficielle: g('urlOfficielle', 500),
    organisme: g('organisme', 120),
    contactNom: g('contactNom', 80),
    contactEmail: g('contactEmail', 160).toLowerCase(),
    telephone: g('telephone', 30),
  };
  if (p.titre.length < 3) erreurs.titre = 'Le titre est obligatoire.';
  if (!p.lieuNom) erreurs.lieuNom = 'Le nom du lieu est obligatoire.';
  if (!p.adresse) erreurs.adresse = 'L’adresse est obligatoire.';
  if (!/^\d{5}$/.test(p.codePostal)) erreurs.codePostal = 'Code postal à 5 chiffres.';
  if (!p.ville) erreurs.ville = 'La ville est obligatoire.';
  if (p.description.length < 40) erreurs.description = 'Décrivez la sortie en quelques phrases (40 caractères au moins).';
  if (!p.tranches.length) erreurs.ages = 'Choisissez au moins une tranche d’âge.';
  else if (p.tranches.every((t) => t === '10+')) erreurs.ages = 'Papa Parfait s’adresse aux familles avec des enfants de 0 à 10 ans.';
  if (Number.isNaN(p.prixEnfant)) erreurs.prixEnfant = 'Un montant en euros (ex. 8 ou 8,50).';
  if (Number.isNaN(p.prixAdulte)) erreurs.prixAdulte = 'Un montant en euros (ex. 12).';
  if (!p.gratuit && p.prixEnfant === null && p.prixAdulte === null) erreurs.prixEnfant = 'Indiquez un prix, ou cochez « Gratuit ».';
  for (const k of ['billetterie', 'urlOfficielle']) {
    if (p[k] && !/^https?:\/\/\S+$/i.test(p[k])) erreurs[k] = 'Une adresse web commençant par https://';
  }
  if (!p.organisme) erreurs.organisme = 'Le nom de l’organisme est obligatoire.';
  if (!p.contactNom) erreurs.contactNom = 'Votre nom est obligatoire.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(p.contactEmail)) erreurs.contactEmail = 'Une adresse e-mail valide, pour vous répondre.';

  // Âge : l'union des tranches cochées.
  const bornes = p.tranches.map((t) => TRANCHES[t]);
  p.ageMin = bornes.length ? Math.min(...bornes.map((b) => b[0])) : null;
  p.ageMax = bornes.some((b) => b[1] === null) ? null : (bornes.length ? Math.max(...bornes.map((b) => b[1])) : null);

  const date = /^\d{4}-\d{2}-\d{2}$/;
  const heure = /^\d{2}:\d{2}$/;
  const dansUnAn = new Date(`${aujourdhui}T12:00:00Z`);
  dansUnAn.setUTCFullYear(dansUnAn.getUTCFullYear() + 1);
  const limite = dansUnAn.toISOString().slice(0, 10);

  if (type === 'evenement') {
    // Séances : date[], heureDebut[], heureFin[] — un rang par séance.
    const dates = form.getAll('date').map(String);
    const debuts = form.getAll('heureDebut').map(String);
    const fins = form.getAll('heureFin').map(String);
    p.seances = dates.map((d, i) => ({ date: d.trim(), debut: (debuts[i] || '').trim(), fin: (fins[i] || '').trim() }))
      .filter((s) => s.date)
      .slice(0, SEANCES_MAX);
    if (!p.seances.length) erreurs.date = 'Ajoutez au moins une date.';
    else if (p.seances.some((s) => !date.test(s.date) || (s.debut && !heure.test(s.debut)) || (s.fin && !heure.test(s.fin)))) {
      erreurs.date = 'Dates au format JJ/MM/AAAA et heures au format HH:MM.';
    } else if (p.seances.some((s) => s.date < aujourdhui || s.date > limite)) {
      erreurs.date = 'Les dates doivent être à venir, dans les 12 prochains mois.';
    }
  } else {
    p.jours = [...new Set(form.getAll('jours').map(Number).filter((j) => Number.isInteger(j) && j >= 0 && j <= 6))].sort();
    p.horaires = g('horaires', 160);
    p.periodeDebut = g('periodeDebut', 10) || aujourdhui;
    p.periodeFin = g('periodeFin', 10) || limite;
    if (!p.jours.length) erreurs.jours = 'Cochez les jours d’ouverture.';
    if (!p.horaires) erreurs.horaires = 'Indiquez les horaires (ex. « 10h – 18h »).';
    if (!date.test(p.periodeDebut) || !date.test(p.periodeFin) || p.periodeFin < p.periodeDebut) {
      erreurs.periode = 'Période d’ouverture invalide.';
    }
  }
  return Object.keys(erreurs).length ? { erreurs } : { proposition: p };
}

/** Adresse → position (Base Adresse Nationale, gratuite, France entière). */
async function geocoder(p) {
  const q = `${p.adresse} ${p.codePostal} ${p.ville}`;
  const res = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=1`);
  if (!res.ok) return null;
  const f = (await res.json())?.features?.[0];
  if (!f || f.properties?.score < 0.4) return null;
  const [lon, lat] = f.geometry.coordinates;
  return { lat, lon };
}

/** Ville ouverte la plus proche dans le rayon, ou null. */
export function villeOuverte(lat, lon) {
  let meilleure = null;
  for (const v of VILLES) {
    const d = distanceKm(lat, lon, v.lat, v.lon);
    if (d <= RAYON_VILLE_KM && (!meilleure || d < meilleure.d)) meilleure = { v, d };
  }
  return meilleure ? meilleure.v : null;
}

async function limiteDepassee(env, ip) {
  const heure = new Date().toISOString().slice(0, 13);
  const cle = `${CLE_LIMITE}${ip}:${heure}`;
  const n = Number.parseInt((await env.VOTES.get(cle)) || '0', 10) || 0;
  if (n >= ENVOIS_PAR_HEURE) return true;
  await env.VOTES.put(cle, String(n + 1), { expirationTtl: 3700 });
  return false;
}

function resumeTexte(p) {
  const quand = p.type === 'evenement'
    ? p.seances.map((s) => `${s.date}${s.debut ? ` ${s.debut}` : ''}${s.fin ? `–${s.fin}` : ''}`).join(', ')
    : `${p.horaires} (jours : ${p.jours.join(',')}) du ${p.periodeDebut} au ${p.periodeFin}`;
  const tarif = p.gratuit ? 'Gratuit' : [p.prixEnfant !== null && `enfant ${p.prixEnfant} €`, p.prixAdulte !== null && `adulte ${p.prixAdulte} €`].filter(Boolean).join(', ');
  return [
    `${p.titre} — ${p.lieuNom}, ${p.adresse}, ${p.codePostal} ${p.ville}`,
    `Quand : ${quand}`,
    `Âges : ${p.tranches.join(', ')} · Tarif : ${tarif}${p.reservation ? ' · réservation obligatoire' : ''}`,
    `Proposé par ${p.organisme} (${p.contactNom}, ${p.contactEmail}${p.telephone ? `, ${p.telephone}` : ''})`,
  ].join('\n');
}

/** POST /propositions */
export async function recevoirProposition(request, env, ctx) {
  if (!env.VOTES) return { status: 503, corps: { ok: false, erreur: 'indisponible' } };
  let form;
  try { form = await request.formData(); } catch { return { status: 400, corps: { ok: false, erreur: 'formulaire_illisible' } }; }

  // Champ piège : invisible pour un humain. Un robot le remplit ; on lui
  // répond « merci » sans rien enregistrer, pour ne pas l'aider à s'adapter.
  if (txt(form.get('site_web'), 200)) return { status: 200, corps: { ok: true } };

  const ip = request.headers.get('CF-Connecting-IP') || 'inconnue';
  if (await limiteDepassee(env, ip)) {
    return { status: 429, corps: { ok: false, erreur: 'trop_de_propositions', message: 'Trop d’envois depuis votre connexion. Réessayez dans une heure.' } };
  }

  const { proposition: p, erreurs } = lireFormulaire(form);
  if (erreurs) return { status: 400, corps: { ok: false, erreur: 'champs', erreurs } };

  const position = await geocoder(p);
  if (!position) {
    return { status: 400, corps: { ok: false, erreur: 'champs', erreurs: { adresse: 'Adresse introuvable. Vérifiez la rue, le code postal et la ville.' } } };
  }
  const ville = villeOuverte(position.lat, position.lon);
  if (!ville) {
    return {
      status: 400,
      corps: {
        ok: false, erreur: 'hors_zone',
        message: `Papa Parfait n’est pas encore ouvert dans votre secteur (villes ouvertes : ${NOMS_VILLES}). Nous gardons votre région en tête !`,
      },
    };
  }

  const id = crypto.randomUUID();
  const photo = form.get('photo');
  let photoId = null;
  if (photo && typeof photo === 'object' && photo.size > 0) {
    if (!PHOTO_TYPES.includes(photo.type)) {
      return { status: 400, corps: { ok: false, erreur: 'champs', erreurs: { photo: 'Photo au format JPG, PNG ou WEBP.' } } };
    }
    if (photo.size > PHOTO_MAX) {
      return { status: 400, corps: { ok: false, erreur: 'champs', erreurs: { photo: 'Photo de 2 Mo maximum.' } } };
    }
    photoId = id;
    await env.VOTES.put(CLE_PHOTO + id, await photo.arrayBuffer(), { metadata: { type: photo.type } });
  }

  const fiche = { ...p, id, statut: 'attente', recueLe: new Date().toISOString(), ...position, villeId: ville.id, photo: photoId };
  await env.VOTES.put(CLE + id, JSON.stringify(fiche));
  // Un lieu prospecté qui répond passe « a proposé » dans le suivi.
  await rapprocherProposition(env, p).catch((e) => console.error('prospection, rapprochement :', e.message));

  // E-mails après la réponse : l'organisateur n'attend pas Resend.
  if (env.RESEND_KEY) {
    const envois = Promise.allSettled([
      envoyerEmail(env, {
        to: ALERTE_A,
        replyTo: p.contactEmail,
        subject: `Nouvelle proposition : ${p.titre} (${ville.nom})`,
        text: `${resumeTexte(p)}\n\nÀ valider dans l'admin, onglet Propositions.`,
        html: `<pre style="font:14px/1.5 sans-serif;white-space:pre-wrap">${echapper(resumeTexte(p))}</pre><p>À valider dans l'admin, onglet <b>Propositions</b>.</p>`,
      }),
      envoyerEmail(env, {
        to: p.contactEmail,
        replyTo: ALERTE_A,
        subject: `Bien reçu : ${p.titre}`,
        text: `Bonjour ${p.contactNom},\n\nMerci pour votre proposition « ${p.titre} ». Nous la vérifions sous 48 h et vous écrivons dès qu'elle est en ligne dans Papa Parfait.\n\nL'équipe Papa Parfait`,
        html: `<p>Bonjour ${echapper(p.contactNom)},</p><p>Merci pour votre proposition « <b>${echapper(p.titre)}</b> ». Nous la vérifions sous 48 h et vous écrivons dès qu’elle est en ligne dans Papa Parfait.</p><p>L’équipe Papa Parfait</p>`,
      }),
    ]).then((r) => r.filter((x) => x.status === 'rejected').forEach((x) => console.error('proposition, e-mail :', x.reason?.message)));
    if (ctx?.waitUntil) ctx.waitUntil(envois);
  }
  return { status: 200, corps: { ok: true, id, ville: ville.nom } };
}

/** GET /photos/<id> */
export async function servirPhoto(env, id) {
  if (!env.VOTES || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const { value, metadata } = await env.VOTES.getWithMetadata(CLE_PHOTO + id, 'arrayBuffer');
  if (!value) return null;
  return new Response(value, {
    headers: {
      'Content-Type': metadata?.type || 'image/jpeg',
      'Cache-Control': 'public, max-age=86400',
      'Access-Control-Allow-Origin': '*',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/** La file, plus récentes d'abord ; les décisions de plus de 60 jours sont masquées. */
export async function listerPropositions(env) {
  const { keys } = await env.VOTES.list({ prefix: CLE, limit: 1000 });
  const fiches = (await Promise.all(keys.map((k) => env.VOTES.get(k.name, 'json')))).filter(Boolean);
  const il_y_a_60j = new Date(Date.now() - 60 * 86400000).toISOString();
  // En attente d'abord, puis les plus récentes.
  return fiches
    .filter((f) => f.statut === 'attente' || (f.decideLe || f.recueLe) >= il_y_a_60j)
    .sort((a, b) => (b.statut === 'attente') - (a.statut === 'attente') || b.recueLe.localeCompare(a.recueLe));
}

/** Une proposition → la sortie manuelle de la surcouche (format nettoyerManuel). */
export function versManuel(p) {
  const commun = {
    titre: p.titre,
    description: p.description,
    lieuNom: p.lieuNom,
    adresse: `${p.adresse}, ${p.codePostal} ${p.ville}`,
    ville: p.ville,
    lat: p.lat,
    lon: p.lon,
    url: p.urlOfficielle || p.billetterie || undefined,
    gratuit: p.gratuit || (p.prixEnfant === 0 && (p.prixAdulte === 0 || p.prixAdulte === null)),
    ageMin: p.ageMin,
    ...(p.ageMax !== null ? { ageMax: p.ageMax } : {}),
    ...(p.prixEnfant !== null ? { prixEnfant: p.prixEnfant } : {}),
    ...(p.prixAdulte !== null ? { prixAdulte: p.prixAdulte } : {}),
    reservation: p.reservation,
    ...(p.billetterie ? { billetterie: p.billetterie } : {}),
    ...(p.photo ? { photo: p.photo } : {}),
    proposePar: p.organisme,
    villeId: p.villeId,
  };
  if (p.type === 'lieu') {
    return { ...commun, dateDebut: p.periodeDebut, dateFin: p.periodeFin, jours: p.jours, horaires: p.horaires };
  }
  const dates = [...new Set(p.seances.map((s) => s.date))].sort();
  const toutesAvecHeure = p.seances.every((s) => s.debut);
  return {
    ...commun,
    dateDebut: dates[0],
    dateFin: dates[dates.length - 1],
    // Seulement ces jours-là, pas toute la plage du premier au dernier.
    dates,
    // Toutes les séances ont une heure → créneaux (scoring horaire, libellé
    // « 14h – 15h30 »). Sinon, pas de créneau : une séance sans heure codée
    // 00:00 passerait pour « en pleine journée » et s'afficherait « 00h ».
    ...(toutesAvecHeure
      ? { creneaux: p.seances.map((s) => ({ debut: `${s.date}T${s.debut}`, fin: s.fin ? `${s.date}T${s.fin}` : null })) }
      : { horaires: libelleSeances(p.seances) }),
  };
}

/** « le 10/10 à 14h, le 17/10 » — pour des séances dont certaines n'ont pas d'heure. */
function libelleSeances(seances) {
  return seances.slice(0, 6).map((s) => {
    const [, m, j] = s.date.split('-');
    return `le ${j}/${m}${s.debut ? ` à ${s.debut.replace(':', 'h').replace(/h00$/, 'h')}` : ''}`;
  }).join(', ').replace(/^le/, 'Le').slice(0, 160);
}

/** POST /admin/api/propositions {id, action, motif?, champs?} */
export async function deciderProposition(env, { id, action, motif, champs }) {
  const fiche = await env.VOTES.get(CLE + id, 'json');
  if (!fiche) return { erreur: 'proposition introuvable' };
  if (fiche.statut !== 'attente') return { erreur: 'déjà traitée' };
  // Corrections faites par Wassim avant validation (titre, description, prix…).
  const p = { ...fiche, ...(champs && typeof champs === 'object' ? champs : {}) };
  let resultat = {};
  if (action === 'valider') {
    const r = await executerAction(env, {
      type: 'enregistrer-manuel', cle: `manuel:prop-${id}`, titre: p.titre, manuel: versManuel(p),
    });
    if (r.erreur) return { erreur: r.erreur };
    resultat = { surcouche: r.surcouche };
  } else if (action !== 'refuser') {
    return { erreur: 'action inconnue' };
  }
  const decision = { ...p, statut: action === 'valider' ? 'publiee' : 'refusee', decideLe: new Date().toISOString(), ...(motif ? { motif: txt(motif, 500) } : {}) };
  await env.VOTES.put(CLE + id, JSON.stringify(decision));

  if (env.RESEND_KEY) {
    const publiee = action === 'valider';
    await envoyerEmail(env, {
      to: fiche.contactEmail,
      replyTo: ALERTE_A,
      subject: publiee ? `C’est en ligne : ${p.titre}` : `Votre proposition : ${p.titre}`,
      text: publiee
        ? `Bonjour ${fiche.contactNom},\n\n« ${p.titre} » est en ligne dans Papa Parfait : les papas de ${p.ville} et des environs la verront quand elle correspond à l'âge de leur enfant, à leur jour et à la météo.\n\nVous pouvez partager l'app à votre communauté : https://papaparfait.fr\n\nL'équipe Papa Parfait`
        : `Bonjour ${fiche.contactNom},\n\nNous ne pouvons pas publier « ${p.titre} » pour le moment${motif ? ` : ${motif}` : ''}.\n\nN'hésitez pas à nous proposer vos prochaines sorties.\n\nL'équipe Papa Parfait`,
      html: publiee
        ? `<p>Bonjour ${echapper(fiche.contactNom)},</p><p>« <b>${echapper(p.titre)}</b> » est en ligne dans Papa Parfait : les papas de ${echapper(p.ville)} et des environs la verront quand elle correspond à l’âge de leur enfant, à leur jour et à la météo.</p><p>Vous pouvez partager l’app à votre communauté : <a href="https://papaparfait.fr">papaparfait.fr</a></p><p>L’équipe Papa Parfait</p>`
        : `<p>Bonjour ${echapper(fiche.contactNom)},</p><p>Nous ne pouvons pas publier « <b>${echapper(p.titre)}</b> » pour le moment${motif ? ` : ${echapper(motif)}` : ''}.</p><p>N’hésitez pas à nous proposer vos prochaines sorties.</p><p>L’équipe Papa Parfait</p>`,
    }).catch((e) => console.error('proposition, e-mail de décision :', e.message));
  }
  return { ok: true, statut: decision.statut, ...resultat };
}
