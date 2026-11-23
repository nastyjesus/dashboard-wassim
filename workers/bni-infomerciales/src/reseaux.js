// Réseaux sociaux : un membre « responsable réseaux sociaux », désigné par
// Wassim dans l'admin (sans date de fin, jusqu'à remplacement), dépose chaque
// semaine ses contenus (PowerPoint, PDF, images) pour la réunion du vendredi,
// avant le jeudi 12:00 (heure de Paris). Le job les pose juste après la slide
// repère « RÉSEAUX SOCIAUX » (mercredi soir, jeudi midi) et le nettoyage du
// samedi les retire, puis efface les fichiers du KV.
//
// Clés KV :
//   reseaux_responsables  [{ slide_id, nom, email, jeton, designe_le, remplace_le }]
//                         le plus récent d'abord (données perso ; un seul sans remplace_le)
//   reseaux:<vendredi>    { vendredi, brouillon, depot }
//                         brouillon / depot : { fichiers: [{ envoi, nom, type, taille, morceaux }], par, ... }
//   reseaux_applique:<vendredi>  { valide_le, ok, slides, message, le } résultat de la pose par le job
//                         (clé à part : le job n'écrase jamais un dépôt validé entre-temps)
//   reseaux_morceau:<envoi>:<n>  morceau d'un fichier déposé (le KV limite une valeur à 25 Mio)
//   reseaux_temoin:<envoi>:<n>   témoin léger « morceau reçu » (la validation ne relit pas les morceaux)
//   Morceaux et témoins expirent au bout de 21 jours (pas d'orphelins).
//
// Aucune route publique ne renvoie le contenu d'un fichier : seuls l'admin et
// le job (X-Wassim-Auth) le lisent.

import { heureParis } from './nettoyage.js';
import {
  TAILLE_MORCEAU, TAILLE_MAX, nouveauJeton, decaler, libelleJour, vendrediCible,
  supprimerFichiers, reponseMorceaux, morceauPourJob,
} from './conference.js';

export { TAILLE_MORCEAU, TAILLE_MAX };
export const FICHIERS_MAX = 10;
// 80 Mo au total en morceaux de 8 Mio : au plus 10 morceaux pleins + 1 entamé par fichier
export const MORCEAUX_MAX = Math.ceil(TAILLE_MAX / TAILLE_MORCEAU) + FICHIERS_MAX;
const PREFIXE = 'reseaux_morceau';
const PREFIXE_TEMOIN = 'reseaux_temoin';
const DUREE_MORCEAUX = 21 * 24 * 3600; // secondes (expirationTtl du KV)
const NOM_FICHIER_MAX = 120;
// Retrait unique des 2 slides posées à la main avant le module (semaine du
// 2026-11-23 seulement, puis plus jamais).
const RETRAIT_UNIQUE = { jour: '2026-11-28', slides: [2113419610, 2113419611] }; // samedi, date de Paris

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});
const erreur = (message, status = 400) => json({ erreur: message }, status);
const lire = async (env, cle, defaut) => (await env.KV.get(cle, 'json')) ?? defaut;
const ecrire = (env, cle, valeur) => env.KV.put(cle, JSON.stringify(valeur));
const prenomDe = (nom) => String(nom ?? '').split(/\s+/)[0];
const cleSemaine = (vendredi) => `reseaux:${vendredi}`;

// Limite de dépôt : jeudi 12:00 (heure de Paris), la veille de la réunion.
export const limiteDepot = (vendredi) => `${decaler(vendredi, -1)} 12:00`;
export const libelleLimite = (vendredi) => `${libelleJour(decaler(vendredi, -1))} 12h`;
export const depotFerme = (vendredi, maintenant) => heureParis(maintenant) >= limiteDepot(vendredi);

const TYPES = {
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', libelle: 'PowerPoint' },
  pdf: { mime: 'application/pdf', libelle: 'PDF' },
  jpg: { mime: 'image/jpeg', libelle: 'image JPG' },
  png: { mime: 'image/png', libelle: 'image PNG' },
};
export const typeDe = (nom) => {
  const m = String(nom).match(/\.(pptx|pdf|jpe?g|png)$/i);
  if (!m) return null;
  const ext = m[1].toLowerCase();
  return ext === 'jpeg' ? 'jpg' : ext;
};

// Vérifie le type réel du fichier sur son premier morceau (pas seulement l'extension).
// pptx : en-tête zip seulement (le job refuse de toute façon un pptx illisible).
export function signatureValide(type, octets) {
  const debut = (...attendu) => attendu.every((b, i) => octets[i] === b);
  if (type === 'pdf') {
    // %PDF toléré dans les 1024 premiers octets (comme les lecteurs PDF)
    const zone = octets.subarray(0, 1024);
    for (let i = zone.indexOf(0x25); i !== -1 && i + 3 < zone.length; i = zone.indexOf(0x25, i + 1)) {
      if (zone[i + 1] === 0x50 && zone[i + 2] === 0x44 && zone[i + 3] === 0x46) return true;
    }
    return false;
  }
  if (type === 'jpg') return debut(0xff, 0xd8, 0xff);
  if (type === 'png') return debut(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  if (type === 'pptx') return debut(0x50, 0x4b, 0x03, 0x04);
  return false;
}

// coupe par caractères (code points) : jamais une paire de substitution UTF-16 cassée
const nomPropre = (nom) => Array.from(String(nom ?? '').replace(/[\\/\r\n\t\u0000-\u001f\u007f]/g, ' ').trim()).slice(-NOM_FICHIER_MAX).join('');

// ---------- responsable (admin) ----------

export async function responsableActuel(env) {
  return (await lire(env, 'reseaux_responsables', [])).find((r) => !r.remplace_le) ?? null;
}

export async function nommerResponsable(env, corps, maintenant, origine) {
  const membres = await lire(env, 'membres', []);
  const membre = membres.find((m) => m.slide_id === Number(corps?.slide_id));
  if (!membre) return erreur('Membre inconnu.');
  const emails = await lire(env, 'emails', {});
  const email = String(corps.email ?? '').trim() || emails[membre.slide_id] || '';
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return erreur('Email invalide.');
  const liste = await lire(env, 'reseaux_responsables', []);
  const actuel = liste.find((r) => !r.remplace_le);
  let resultat;
  if (actuel && actuel.slide_id === membre.slide_id) {
    // même membre : on garde son lien (seul l'email peut changer)
    actuel.email = email;
    resultat = actuel;
  } else {
    // nouveau responsable : le lien de l'ancien ne marche plus, son envoi
    // commencé (non validé) est abandonné ; un dépôt déjà validé reste
    if (actuel) actuel.remplace_le = maintenant.toISOString();
    resultat = { slide_id: membre.slide_id, nom: membre.nom, email, jeton: nouveauJeton(), designe_le: maintenant.toISOString(), remplace_le: null };
    liste.unshift(resultat);
    const cle = cleSemaine(vendrediCible(maintenant));
    const semaine = await lire(env, cle, null);
    if (semaine?.brouillon) {
      await supprimerTout(env, semaine.brouillon, semaine.depot);
      semaine.brouillon = null;
      await ecrire(env, cle, semaine);
    }
  }
  await ecrire(env, 'reseaux_responsables', liste.slice(0, 40));
  const { jeton, ...sansJeton } = resultat;
  return json({ ...sansJeton, lien: `${origine}/reseaux?r=${jeton}` });
}

// efface les morceaux d'un lot de fichiers, sauf ceux encore utilisés par « garder »
async function supprimerTout(env, lot, garder) {
  const gardes = new Set((garder?.fichiers ?? []).map((f) => f.envoi));
  for (const f of lot?.fichiers ?? []) {
    if (gardes.has(f.envoi)) continue;
    await supprimerFichiers(env, f.envoi, f.morceaux, PREFIXE);
    await supprimerFichiers(env, f.envoi, f.morceaux, PREFIXE_TEMOIN);
  }
}

// ---------- page publique (lien perso du responsable) ----------

const resumeFichiers = (lot) => lot.fichiers.map((f) => ({ nom: f.nom, type: f.type, taille: f.taille }));
const cleApplique = (vendredi) => `reseaux_applique:${vendredi}`;
const estPose = (s, applique) => Boolean(s?.depot && applique?.ok && applique.valide_le === s.depot.valide_le);

export async function routesReseaux(request, env, url, maintenant = new Date()) {
  const p = url.pathname;
  const m = request.method;
  const jeton = url.searchParams.get('r');
  const resp = await responsableActuel(env);
  // le jeton doit être celui du responsable en cours (un ancien lien est refusé)
  if (!jeton || !resp || resp.jeton !== jeton) return erreur('Lien invalide : la mission réseaux sociaux a peut-être été confiée à un autre membre. Demande ton lien à Wassim.', 403);
  const vendredi = vendrediCible(maintenant);
  const cle = cleSemaine(vendredi);
  const ferme = depotFerme(vendredi, maintenant);
  const semaine = await lire(env, cle, null) ?? { vendredi, brouillon: null, depot: null };

  if (p === '/api/reseaux/moi' && m === 'GET') {
    const d = semaine.depot;
    const applique = await lire(env, cleApplique(vendredi), null);
    return json({
      prenom: prenomDe(resp.nom), vendredi, vendredi_libelle: libelleJour(vendredi),
      limite: libelleLimite(vendredi), ferme,
      depot: d && !d.fichier_efface ? { fichiers: resumeFichiers(d), valide_le: d.valide_le } : null,
      sur_la_presentation: estPose(semaine, applique) ? { slides: applique.slides, le: applique.le } : null,
      taille_morceau: TAILLE_MORCEAU, taille_max: TAILLE_MAX, fichiers_max: FICHIERS_MAX,
    });
  }
  if (ferme) return erreur(`Dépôt fermé depuis ${libelleLimite(vendredi)} pour la réunion du ${libelleJour(vendredi)}. Tu pourras déposer pour la réunion suivante dès vendredi midi.`, 409);

  if (p === '/api/reseaux/envoi' && m === 'POST') {
    let corps;
    try { corps = await request.json(); } catch { return erreur('Requête illisible.'); }
    const liste = Array.isArray(corps?.fichiers) ? corps.fichiers : [];
    if (liste.length < 1 || liste.length > FICHIERS_MAX) return erreur(`Choisis 1 à ${FICHIERS_MAX} fichiers.`);
    const fichiers = [];
    let total = 0;
    for (const f of liste) {
      const nom = nomPropre(f?.nom);
      const type = typeDe(nom);
      const taille = Number(f?.taille);
      if (!type) return erreur('Formats acceptés : PowerPoint (.pptx), PDF, images JPG ou PNG.');
      if (!Number.isInteger(taille) || taille <= 0) return erreur('Fichier vide.');
      total += taille;
      fichiers.push({ envoi: nouveauJeton(), nom, type, taille, morceaux: Math.ceil(taille / TAILLE_MORCEAU) });
    }
    if (total > TAILLE_MAX) return erreur(`Trop lourd (${Math.round(TAILLE_MAX / 1024 / 1024)} Mo max au total). Exporte en PDF ou réduis les images.`, 413);
    if (fichiers.reduce((t, f) => t + f.morceaux, 0) > MORCEAUX_MAX) return erreur('Trop de morceaux : recommence.', 413);
    // un nouvel envoi abandonne l'envoi commencé et non validé
    if (semaine.brouillon) await supprimerTout(env, semaine.brouillon, semaine.depot);
    semaine.brouillon = { id: nouveauJeton(), fichiers, debut: maintenant.toISOString(), par: resp.slide_id };
    await ecrire(env, cle, semaine);
    return json({ brouillon: semaine.brouillon.id, fichiers: fichiers.map((f) => ({ envoi: f.envoi, morceaux: f.morceaux })), taille_morceau: TAILLE_MORCEAU });
  }
  if (p === '/api/reseaux/morceau' && m === 'PUT') {
    const f = semaine.brouillon?.fichiers.find((x) => x.envoi === url.searchParams.get('envoi'));
    const n = Number(url.searchParams.get('n'));
    if (!f) return erreur('Envoi inconnu : recommence.', 409);
    if (!Number.isInteger(n) || n < 0 || n >= f.morceaux) return erreur('Morceau inattendu.');
    const attendu = n < f.morceaux - 1 ? TAILLE_MORCEAU : f.taille - TAILLE_MORCEAU * (f.morceaux - 1);
    if (Number(request.headers.get('Content-Length') || 0) > attendu) return erreur('Morceau trop gros : recommence.', 413);
    const corps = new Uint8Array(await request.arrayBuffer());
    if (corps.byteLength !== attendu) return erreur('Morceau incomplet : recommence.', 400);
    if (n === 0 && !signatureValide(f.type, corps)) {
      return erreur(`« ${f.nom} » n'est pas un vrai fichier ${TYPES[f.type].libelle}. Formats acceptés : PowerPoint (.pptx), PDF, JPG, PNG.`);
    }
    await env.KV.put(`${PREFIXE}:${f.envoi}:${n}`, corps, { expirationTtl: DUREE_MORCEAUX });
    await env.KV.put(`${PREFIXE_TEMOIN}:${f.envoi}:${n}`, '1', { expirationTtl: DUREE_MORCEAUX });
    return json({ ok: true, n });
  }
  if (p === '/api/reseaux/valider' && m === 'POST') {
    let corps;
    try { corps = await request.json(); } catch { return erreur('Requête illisible.'); }
    const b = semaine.brouillon;
    if (!b || !corps?.brouillon || b.id !== corps.brouillon) return erreur('Envoi inconnu : redépose tes fichiers.', 409);
    for (const f of b.fichiers) {
      for (let n = 0; n < f.morceaux; n += 1) {
        if ((await env.KV.get(`${PREFIXE_TEMOIN}:${f.envoi}:${n}`)) === null) return erreur(`« ${f.nom} » est incomplet : redépose tes fichiers.`, 409);
      }
    }
    // « Valider » remplace intégralement le dépôt précédent de la semaine
    if (semaine.depot) await supprimerTout(env, semaine.depot, b);
    semaine.depot = { fichiers: b.fichiers, valide_le: maintenant.toISOString(), par: resp.slide_id, par_nom: resp.nom };
    semaine.brouillon = null;
    await ecrire(env, cle, semaine);
    return json({ ok: true, valide_le: semaine.depot.valide_le, fichiers: b.fichiers.length });
  }
  return erreur('Introuvable.', 404);
}

// ---------- mails (envoyés par le script Google Apps Script) ----------

function texteMercredi(resp, vendredi, lien, depot) {
  const jour = libelleJour(vendredi);
  const lignes = [
    `Bonjour ${prenomDe(resp.nom)},`, '',
    `Pour la réunion du ${jour}, dépose tes contenus réseaux sociaux sur ta page avant ${libelleLimite(vendredi)} : ils seront ajoutés à la présentation, juste après la slide « Réseaux sociaux ».`,
    '',
    '- Formats acceptés : PowerPoint (.pptx), PDF, images (JPG, PNG).',
    `- Tu peux déposer plusieurs fichiers en une fois (${FICHIERS_MAX} au maximum), dans l'ordre où ils doivent passer.`,
    '- Un nouvel envoi remplace entièrement le précédent.',
    ...(depot ? ['', `J'ai déjà reçu ${depot.fichiers.length} fichier(s) pour cette réunion : tu peux encore les remplacer jusqu'à ${libelleLimite(vendredi)}.`] : []),
    '',
    'Ta page :',
    lien, '',
    'Une question ? Réponds simplement à ce mail.', '',
    'Merci,',
    'Wassim',
  ];
  return { sujet: `BNI : tes contenus réseaux sociaux pour le ${jour}`, texte: lignes.join('\n') };
}

function texteJeudi(resp, vendredi, lien) {
  const lignes = [
    `Bonjour ${prenomDe(resp.nom)},`, '',
    `Je n'ai encore rien reçu pour la partie réseaux sociaux de la réunion du ${libelleJour(vendredi)}. Limite : aujourd'hui, jeudi 12h.`,
    '',
    'Ta page (PowerPoint, PDF ou images) :',
    lien, '',
    'Merci,',
    'Wassim',
  ];
  return { sujet: 'Rappel BNI : tes contenus réseaux sociaux avant 12h', texte: lignes.join('\n') };
}

// Même forme de réponse que les autres rappels : { type, vendredi, recap, mails }.
export async function listeRappelsReseaux(env, origine, type, maintenant) {
  const vendredi = vendrediCible(maintenant);
  const [resp, semaine] = await Promise.all([responsableActuel(env), lire(env, cleSemaine(vendredi), null)]);
  const depot = semaine?.depot && !semaine.depot.fichier_efface ? semaine.depot : null;
  const recap = {
    vendredi, responsable: resp ? (resp.email ? 'ok' : 'sans email') : 'aucun responsable désigné',
    depose: Boolean(depot), a_envoyer: 0,
  };
  const mails = [];
  if (resp?.email) {
    const lien = `${origine}/reseaux?r=${resp.jeton}`;
    if (type === 'reseaux_mercredi') mails.push({ nom: resp.nom, email: resp.email, ...texteMercredi(resp, vendredi, lien, depot) });
    // jeudi : relance seulement si rien n'est validé pour ce vendredi
    else if (type === 'reseaux_jeudi' && !depot) mails.push({ nom: resp.nom, email: resp.email, ...texteJeudi(resp, vendredi, lien) });
  }
  recap.a_envoyer = mails.length;
  return { type, vendredi, recap, mails };
}

// ---------- admin ----------

async function semainesRecentes(env, maintenant, nombre = 4) {
  const { keys } = await env.KV.list({ prefix: 'reseaux:' });
  const cible = vendrediCible(maintenant);
  const vendredis = keys.map((k) => k.name.slice('reseaux:'.length)).filter((v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && v >= decaler(cible, -7 * nombre))
    .sort().reverse().slice(0, nombre);
  return (await Promise.all(vendredis.map((v) => lire(env, cleSemaine(v), null)))).filter(Boolean);
}

export async function etatReseaux(env, origine, maintenant) {
  const liste = await lire(env, 'reseaux_responsables', []);
  const resp = liste.find((r) => !r.remplace_le) ?? null;
  const vendredi = vendrediCible(maintenant);
  const semaines = await Promise.all((await semainesRecentes(env, maintenant)).map(async (s) => {
    const applique = await lire(env, cleApplique(s.vendredi), null);
    return {
      vendredi: s.vendredi, vendredi_libelle: libelleJour(s.vendredi),
      depot: s.depot, envoi_en_cours: Boolean(s.brouillon), applique, pose: estPose(s, applique),
    };
  }));
  return {
    vendredi, vendredi_libelle: libelleJour(vendredi), limite: libelleLimite(vendredi), ferme: depotFerme(vendredi, maintenant),
    responsable: resp ? { slide_id: resp.slide_id, nom: resp.nom, email: resp.email, designe_le: resp.designe_le, lien: `${origine}/reseaux?r=${resp.jeton}` } : null,
    responsables: liste.map(({ jeton, ...r }) => r),
    semaines,
  };
}

export async function fichierReseaux(env, vendredi, envoi) {
  const s = await lire(env, cleSemaine(vendredi), null);
  const f = s?.depot && !s.depot.fichier_efface ? s.depot.fichiers.find((x) => x.envoi === envoi) : null;
  if (!f) return erreur('Pas de fichier déposé (ou effacé après la réunion).', 404);
  return reponseMorceaux(env, PREFIXE, f, TYPES[f.type].mime, f.nom);
}

// ---------- job ----------

// Dépôt à poser : celui de la prochaine réunion, validé et pas encore posé dans cette version.
export async function reseauxAPoser(env, maintenant) {
  const vendredi = vendrediCible(maintenant);
  const s = await lire(env, cleSemaine(vendredi), null);
  const d = s?.depot;
  if (!d || d.fichier_efface || estPose(s, await lire(env, cleApplique(vendredi), null))) return null;
  return {
    vendredi: s.vendredi, valide_le: d.valide_le,
    fichiers: d.fichiers.map((f) => ({ envoi: f.envoi, morceaux: f.morceaux, taille: f.taille, type: f.type, nom: f.nom })),
  };
}

export const morceauReseauxPourJob = (env, envoi, n) => morceauPourJob(env, envoi, n, PREFIXE);

export async function enregistrerPoseReseaux(env, resultat, maintenant) {
  if (!resultat || typeof resultat !== 'object' || !/^\d{4}-\d{2}-\d{2}$/.test(String(resultat.vendredi))) return;
  // dépôt remplacé pendant le job : le prochain passage posera le nouveau.
  // Lecture seule du dépôt : le résultat va dans sa propre clé, sans jamais
  // réécrire reseaux:<vendredi> (un dépôt validé entre-temps reste intact,
  // et estPose compare les deux valide_le).
  const s = await lire(env, cleSemaine(resultat.vendredi), null);
  if (!s?.depot || s.depot.valide_le !== resultat.valide_le) return;
  await ecrire(env, cleApplique(resultat.vendredi), {
    valide_le: String(resultat.valide_le), ok: Boolean(resultat.ok), slides: Number(resultat.slides) || 0,
    message: String(resultat.message ?? '').slice(0, 300), le: maintenant.toISOString(),
  });
}

// ---------- nettoyage du samedi ----------

// seulement le samedi 28/11/2026 (date de Paris), plus jamais ensuite
export function retraitUnique(maintenant) {
  return heureParis(maintenant).slice(0, 10) === RETRAIT_UNIQUE.jour ? [...RETRAIT_UNIQUE.slides] : [];
}

// Efface les fichiers des dépôts des vendredis <= jusquAu (la fiche reste pour l'admin).
export async function purgerReseauxPasses(env, jusquAu) {
  const { keys } = await env.KV.list({ prefix: 'reseaux:' });
  let purges = 0;
  for (const { name } of keys) {
    const vendredi = name.slice('reseaux:'.length);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(vendredi) || vendredi > jusquAu) continue;
    const s = await lire(env, name, null);
    if (!s || (!s.brouillon && (!s.depot || s.depot.fichier_efface))) continue;
    await supprimerTout(env, s.brouillon, null);
    if (s.depot && !s.depot.fichier_efface) {
      await supprimerTout(env, s.depot, null);
      s.depot = { ...s.depot, fichier_efface: true };
    }
    s.brouillon = null;
    await ecrire(env, name, s);
    purges += 1;
  }
  return purges;
}
