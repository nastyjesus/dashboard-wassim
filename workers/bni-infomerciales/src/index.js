// Worker bni-infomerciales : dépôt des photos d'infomerciales par lien perso,
// admin, et API du job hebdo qui met à jour le deck OneDrive.
//
// Clés KV :
//   membres          [{ slide_id, nom, metier, recherche, a_une_photo }] (écrit par le job)
//   jetons           { <jeton>: slide_id }                                (liens perso)
//   depot:<id>       { slide_id, recherche, a_photo, date }
//   photo:<id>       JPEG (déjà réduit par le téléphone)
//   ms               { rclone_token | refresh_token+client_id, drive_id, item_id } (jamais servi aux membres)
//   dernier_run      { date, ok, message, mis_a_jour }
//   passages         [{ date, ok, message, mis_a_jour, source: job|complement, creneau }] (20 derniers, récent d'abord)
//   applique:<id>    dernier dépôt traité { ...dépôt, statut: pose|introuvable, applique_le }
//   photo_appliquee:<id>  JPEG de la dernière photo posée sur la slide
//   emails           { <slide_id>: email } (rappels ; données perso, chargées par l'admin)
//   objectifs:<id>   { ca_ht, recos, metiers, date } (objectif annuel BNI + métiers prescripteurs/recherchés)
//   envois:<lundi>   { <slide_id>: { photo, demande, date } } (suivi hebdo, lundi = AAAA-MM-JJ Paris)
//   nettoyage:<lundi>, dernier_nettoyage  nettoyage hebdo du samedi (voir nettoyage.js)
//   suppleants       [{ nom, prenom, email, tel }] (visiteurs possibles ; données
//                    perso : jamais dans le dépôt public, chargées par l'admin)
//   secretaires, genres, conference:<vendredi>, jetons_conference, conf_morceau:*
//                    conférencier de la semaine (voir conference.js)
//   reseaux_responsables, reseaux:<vendredi>, reseaux_morceau:*
//                    contenus réseaux sociaux de la semaine (voir reseaux.js)

import { lancerWorkflow, declencherSiDu } from './declenchement.js';
import PAGE_MEMBRE from './membre.html';
import PAGE_ADMIN from './admin.html';
import PAGE_ADDIN from './addin.html';
import PAGE_SECRETAIRE from './secretaire.html';
import PAGE_CONFERENCE from './conference.html';
import PAGE_RESEAUX from './reseaux.html';
import ICONE_ADDIN from './icone.js';
import { routesNettoyage } from './nettoyage.js';
import {
  routesPubliques, etatConference, nommerSecretaire, designer, vendrediCible, listeRappelsConference,
  notificationsAEnvoyer, accuserNotifications, fichierConference, conferenceAPoser, morceauPourJob, enregistrerPose,
} from './conference.js';
import {
  routesReseaux, nommerResponsable, listeRappelsReseaux, etatReseaux, fichierReseaux, reseauxAPoser,
  morceauReseauxPourJob, enregistrerPoseReseaux,
} from './reseaux.js';

const PHOTO_MAX = 5 * 1024 * 1024;
const RECHERCHE_MAX = 160;
const METIERS_MAX = 600;

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});
const html = (corps) => new Response(corps, {
  headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
});
const erreur = (message, status = 400) => json({ erreur: message }, status);

// Complément PowerPoint : écrit dans la présentation ouverte (co-édition),
// là où le job, qui remplace le fichier entier, est bloqué par le verrou.
const ADDIN_ID = '6f1d2c3b-8a47-4e2f-9b1a-5c0d7e3f4a21';
export function manifesteAddin(origine) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<OfficeApp xmlns="http://schemas.microsoft.com/office/appforoffice/1.1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="TaskPaneApp">
  <Id>${ADDIN_ID}</Id>
  <Version>1.0.0.0</Version>
  <ProviderName>BNI Bruz Envol</ProviderName>
  <DefaultLocale>fr-FR</DefaultLocale>
  <DisplayName DefaultValue="Infomerciales BNI"/>
  <Description DefaultValue="Pose les photos et demandes des membres sur leur slide."/>
  <IconUrl DefaultValue="${origine}/addin/icone.png"/>
  <HighResolutionIconUrl DefaultValue="${origine}/addin/icone.png"/>
  <SupportUrl DefaultValue="${origine}/admin"/>
  <AppDomains><AppDomain>${origine}</AppDomain></AppDomains>
  <Hosts><Host Name="Presentation"/></Hosts>
  <DefaultSettings><SourceLocation DefaultValue="${origine}/addin"/></DefaultSettings>
  <Permissions>ReadWriteDocument</Permissions>
</OfficeApp>
`;
}

const lire = async (env, cle, defaut) => (await env.KV.get(cle, 'json')) ?? defaut;

export function nouveauJeton() {
  const octets = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...octets)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// WASSIM_AUTH_TOKEN (partagé avec les autres workers, utilisé par le job) ou
// BNI_ADMIN_TOKEN (propre à ce module, pour l'admin et connexion_microsoft.py).
function estAdmin(request, env) {
  const recu = request.headers.get('X-Wassim-Auth');
  return Boolean(recu) && [env.WASSIM_AUTH_TOKEN, env.BNI_ADMIN_TOKEN].some((t) => Boolean(t) && recu === t);
}

async function membreParJeton(env, jeton) {
  if (!jeton) return null;
  const jetons = await lire(env, 'jetons', {});
  const id = jetons[jeton];
  if (id === undefined) return null;
  const membres = await lire(env, 'membres', []);
  return membres.find((m) => m.slide_id === id) ?? null;
}

async function enregistrerDepot(env, slideId, modif, rechercheActuelle = '') {
  const precedent = await lire(env, `depot:${slideId}`, { slide_id: slideId, recherche: '', a_photo: false });
  const maintenant = new Date();
  const depot = { ...precedent, ...modif, date: maintenant.toISOString() };
  await env.KV.put(`depot:${slideId}`, JSON.stringify(depot));
  // suivi hebdo : la page pré-remplit la demande avec le texte déjà sur la
  // slide, on ne compte donc une demande que si elle est nouvelle
  const cle = `envois:${lundiParis(maintenant)}`;
  const semaine = await lire(env, cle, {});
  const avant = semaine[slideId] ?? { photo: false, demande: false };
  const demandeNeuve = Boolean(modif.recherche) && normaliserNom(modif.recherche) !== normaliserNom(rechercheActuelle);
  semaine[slideId] = { photo: avant.photo || Boolean(modif.a_photo), demande: avant.demande || demandeNeuve, date: depot.date };
  await env.KV.put(cle, JSON.stringify(semaine));
  return depot;
}

// Suivi des dernières semaines : nombre de membres ayant envoyé une photo /
// une demande. Les semaines d'avant le journal sont reconstituées à partir
// des derniers dépôts connus (incomplet pour ces semaines-là).
async function suiviHebdo(env, membres) {
  const semaines = {};
  const { keys } = await env.KV.list({ prefix: 'envois:' });
  for (const { name } of keys) semaines[name.slice('envois:'.length)] = { ...(await lire(env, name, {})) };
  const journal = new Set(Object.keys(semaines));
  for (const m of membres) {
    for (const d of [m.depot, m.applique]) {
      if (!d?.date || (m.applique && d === m.applique && m.applique.statut !== 'pose')) continue;
      const lundi = lundiParis(new Date(d.date));
      if (journal.has(lundi)) continue; // semaine déjà suivie par le journal
      const s = (semaines[lundi] ??= {});
      const avant = s[m.slide_id] ?? { photo: false, demande: false };
      s[m.slide_id] = { photo: avant.photo || Boolean(d.a_photo), demande: avant.demande || Boolean(d.recherche) };
    }
  }
  return Object.entries(semaines)
    .map(([lundi, s]) => ({ lundi, infomerciales: Object.values(s).filter((x) => x.photo).length, demandes: Object.values(s).filter((x) => x.demande).length }))
    .sort((a, b) => b.lundi.localeCompare(a.lundi))
    .slice(0, 26);
}

// ---------- membres ----------

async function routesMembre(request, env, url) {
  const membre = await membreParJeton(env, url.searchParams.get('m'));
  if (!membre) return erreur('Lien invalide. Demande ton lien perso à Wassim.', 403);
  const id = membre.slide_id;

  if (url.pathname === '/api/moi' && request.method === 'GET') {
    const depot = await lire(env, `depot:${id}`, null);
    const objectifs = await lire(env, `objectifs:${id}`, null);
    return json({ nom: membre.nom, metier: membre.metier, recherche: membre.recherche, depot, objectifs });
  }
  if (url.pathname === '/api/objectifs' && request.method === 'POST') {
    let corps;
    try { corps = await request.json(); } catch { return erreur('Requête illisible.'); }
    const entier = (v, max) => {
      const n = Number(String(v ?? '').replace(/[\s ]/g, '').replace(',', '.'));
      return Number.isFinite(n) && n > 0 && n <= max ? Math.round(n) : null;
    };
    // chaque champ est facultatif, mais un nombre saisi doit être valide
    const vide = (v) => String(v ?? '').trim() === '';
    const ca = vide(corps.ca_ht) ? null : entier(corps.ca_ht, 100_000_000);
    const recos = vide(corps.recos) ? null : entier(corps.recos, 10_000);
    if (!vide(corps.ca_ht) && ca === null) return erreur("Objectif de chiffre d'affaires HT : indique un nombre en euros.");
    if (!vide(corps.recos) && recos === null) return erreur('Recommandations transformées : indique un nombre.');
    const metiers = String(corps.metiers ?? '').split(/\r?\n/)
      .map((l) => l.split(/\s+/).filter(Boolean).join(' ')).filter(Boolean).join('\n').slice(0, METIERS_MAX);
    if (ca === null && recos === null && !metiers) return erreur('Remplis au moins un champ.');
    const objectifs = { ca_ht: ca, recos, metiers, date: new Date().toISOString() };
    await env.KV.put(`objectifs:${id}`, JSON.stringify(objectifs));
    return json(objectifs);
  }
  if (url.pathname === '/api/suppleants' && request.method === 'GET') {
    return json({ suppleants: await lire(env, 'suppleants', []) });
  }
  if (url.pathname === '/api/photo' && request.method === 'GET') {
    const photo = await env.KV.get(`photo:${id}`, 'arrayBuffer');
    return photo ? new Response(photo, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' } }) : erreur('Pas de photo.', 404);
  }
  if (url.pathname === '/api/photo' && request.method === 'PUT') {
    if (!(request.headers.get('Content-Type') || '').startsWith('image/jpeg')) return erreur('Photo attendue en JPEG.');
    const corps = await request.arrayBuffer();
    if (corps.byteLength === 0) return erreur('Photo vide.');
    if (corps.byteLength > PHOTO_MAX) return erreur('Photo trop lourde (5 Mo max).', 413);
    await env.KV.put(`photo:${id}`, corps);
    return json(await enregistrerDepot(env, id, { a_photo: true }));
  }
  if (url.pathname === '/api/depot' && request.method === 'POST') {
    let corps;
    try { corps = await request.json(); } catch { return erreur('Requête illisible.'); }
    const recherche = String(corps.recherche ?? '').split(/\s+/).filter(Boolean).join(' ').slice(0, RECHERCHE_MAX);
    return json(await enregistrerDepot(env, id, { recherche }, membre.recherche));
  }
  return erreur('Introuvable.', 404);
}

// ---------- admin + job (X-Wassim-Auth) ----------

async function etatAdmin(env, origine, maintenant = new Date()) {
  const [membres, jetons, ms, dernierRun] = await Promise.all([
    lire(env, 'membres', []), lire(env, 'jetons', {}), lire(env, 'ms', null), lire(env, 'dernier_run', null),
  ]);
  const dernierNettoyage = await lire(env, 'dernier_nettoyage', null);
  const jetonDe = Object.fromEntries(Object.entries(jetons).map(([j, id]) => [id, j]));
  const liste = await Promise.all(membres.map(async (m) => ({
    ...m,
    lien: jetonDe[m.slide_id] ? `${origine}/?m=${jetonDe[m.slide_id]}` : null,
    depot: await lire(env, `depot:${m.slide_id}`, null),
    applique: await lire(env, `applique:${m.slide_id}`, null),
    objectifs: await lire(env, `objectifs:${m.slide_id}`, null),
  })));
  // même règle que la relance du mercredi
  const semaineEnCours = lundiParis(new Date());
  const journal = await lire(env, `envois:${semaineEnCours}`, {});
  for (const m of liste) m.envoye_cette_semaine = aEnvoyeCetteSemaine({ depot: m.depot, applique: m.applique, trace: journal[m.slide_id] }, semaineEnCours);
  return {
    membres: liste,
    semaine_en_cours: semaineEnCours,
    suivi: await suiviHebdo(env, liste),
    microsoft_connecte: Boolean(ms?.refresh_token || ms?.rclone_token),
    bouton_dispo: Boolean(env.GH_DISPATCH_TOKEN),
    dernier_run: dernierRun,
    passages_job: (await lire(env, 'passages', [])).filter((x) => x.source === 'job').slice(0, 2),
    dernier_nettoyage: dernierNettoyage,
    declenchements: (await lire(env, 'declenchements', [])).slice(0, 5),
    conference: await etatConference(env, origine, maintenant),
    reseaux: await etatReseaux(env, origine, maintenant),
  };
}

async function declencherJob(env) {
  if (!env.GH_DISPATCH_TOKEN) return erreur('Bouton non configuré : lance le workflow « BNI infomerciales » depuis GitHub.', 501);
  const r = await lancerWorkflow(env, 'job');
  if (!r.ok) return erreur(`GitHub a refusé le lancement (${r.statut}).`, 502);
  return json({ ok: true });
}

export const normaliserNom = (nom) => String(nom).normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().split(/\s+/).filter(Boolean).join(' ');

// Une slide supprimée puis recréée (ou recopiée) change d'identifiant : on
// retrouve le membre par son nom pour que son lien perso et son dépôt suivent.
async function suivreSlidesRecreees(env, anciens, membres, jetons) {
  const nouveauxIds = new Set(membres.map((m) => m.slide_id));
  const anciensIds = new Set(anciens.map((m) => m.slide_id));
  // l'email (rappels) et la trace de la semaine suivent aussi, sinon le membre
  // ne reçoit plus de rappel, ou est relancé alors qu'il a envoyé
  const cleSemaine = `envois:${lundiParis(new Date())}`;
  const [emails, semaine, genres] = await Promise.all([lire(env, 'emails', {}), lire(env, cleSemaine, {}), lire(env, 'genres', {})]);
  let emailsModifies = false;
  let genresModifies = false;
  let semaineModifiee = false;
  for (const ancien of anciens) {
    if (nouveauxIds.has(ancien.slide_id)) continue;
    const cible = membres.find((m) => !anciensIds.has(m.slide_id) && normaliserNom(m.nom) === normaliserNom(ancien.nom));
    if (!cible) continue;
    if (emails[ancien.slide_id] && !emails[cible.slide_id]) {
      emails[cible.slide_id] = emails[ancien.slide_id];
      delete emails[ancien.slide_id];
      emailsModifies = true;
    }
    if (genres[ancien.slide_id] && !genres[cible.slide_id]) {
      genres[cible.slide_id] = genres[ancien.slide_id];
      delete genres[ancien.slide_id];
      genresModifies = true;
    }
    if (semaine[ancien.slide_id]) {
      const avant = semaine[cible.slide_id] ?? { photo: false, demande: false };
      const trace = semaine[ancien.slide_id];
      semaine[cible.slide_id] = { ...trace, photo: avant.photo || trace.photo, demande: avant.demande || trace.demande };
      delete semaine[ancien.slide_id];
      semaineModifiee = true;
    }
    for (const [jeton, id] of Object.entries(jetons)) if (id === ancien.slide_id) jetons[jeton] = cible.slide_id;
    const objectifs = await lire(env, `objectifs:${ancien.slide_id}`, null);
    if (objectifs) {
      await env.KV.put(`objectifs:${cible.slide_id}`, JSON.stringify(objectifs));
      await env.KV.delete(`objectifs:${ancien.slide_id}`);
    }
    for (const [cleDepot, clePhoto] of [['depot', 'photo'], ['applique', 'photo_appliquee']]) {
      const depot = await lire(env, `${cleDepot}:${ancien.slide_id}`, null);
      if (!depot) continue;
      await env.KV.put(`${cleDepot}:${cible.slide_id}`, JSON.stringify({ ...depot, slide_id: cible.slide_id }));
      const photo = await env.KV.get(`${clePhoto}:${ancien.slide_id}`, 'arrayBuffer');
      if (photo) await env.KV.put(`${clePhoto}:${cible.slide_id}`, photo);
      await env.KV.delete(`${cleDepot}:${ancien.slide_id}`);
      await env.KV.delete(`${clePhoto}:${ancien.slide_id}`);
    }
  }
  if (emailsModifies) await env.KV.put('emails', JSON.stringify(emails));
  if (genresModifies) await env.KV.put('genres', JSON.stringify(genres));
  if (semaineModifiee) await env.KV.put(cleSemaine, JSON.stringify(semaine));
}

// Le job envoie la liste des membres lue dans le deck et les dépôts appliqués.
async function recevoirResultat(env, corps) {
  // un dépôt n'est effacé que s'il n'a pas été modifié pendant le job
  // (identifiants d'origine : traité avant le suivi des slides recréées)
  // Le complément PowerPoint n'envoie pas la liste des membres : on reporte
  // le dépôt appliqué dans la fiche, sinon la page membre réafficherait
  // l'ancienne demande jusqu'au prochain passage du job.
  const fiches = await lire(env, 'membres', []);
  let fichesModifiees = false;
  const maintenant = new Date().toISOString();
  for (const { slide_id: id, date, orphelin } of corps.appliques ?? []) {
    const depot = await lire(env, `depot:${id}`, null);
    if (depot && depot.date === date) {
      // historique : ce qui est sur la présentation (ou n'a pas trouvé de slide)
      const statut = orphelin ? 'introuvable' : 'pose';
      await env.KV.put(`applique:${id}`, JSON.stringify({ ...depot, statut, applique_le: maintenant }));
      if (statut === 'pose' && depot.a_photo) {
        const photo = await env.KV.get(`photo:${id}`, 'arrayBuffer');
        if (photo) await env.KV.put(`photo_appliquee:${id}`, photo);
      }
      const fiche = orphelin ? null : fiches.find((m) => m.slide_id === id);
      if (fiche) {
        if (depot.recherche) fiche.recherche = depot.recherche;
        if (depot.a_photo) fiche.a_une_photo = true;
        fichesModifiees = true;
      }
      await env.KV.delete(`depot:${id}`);
      await env.KV.delete(`photo:${id}`);
    }
  }
  if (fichesModifiees && !Array.isArray(corps.membres)) await env.KV.put('membres', JSON.stringify(fiches));
  if (Array.isArray(corps.membres)) {
    const membres = corps.membres.map((m) => ({
      slide_id: Number(m.slide_id), nom: String(m.nom), metier: String(m.metier ?? ''),
      recherche: String(m.recherche ?? ''), a_une_photo: Boolean(m.a_une_photo),
    }));
    const jetons = await lire(env, 'jetons', {});
    await suivreSlidesRecreees(env, await lire(env, 'membres', []), membres, jetons);
    const dejaLies = new Set(Object.values(jetons));
    for (const m of membres) if (!dejaLies.has(m.slide_id)) jetons[nouveauJeton()] = m.slide_id;
    await env.KV.put('membres', JSON.stringify(membres));
    await env.KV.put('jetons', JSON.stringify(jetons));
  }
  if (corps.conference) await enregistrerPose(env, corps.conference, new Date());
  if (corps.reseaux) await enregistrerPoseReseaux(env, corps.reseaux, new Date());
  const run = { date: new Date().toISOString(), ok: Boolean(corps.ok), message: String(corps.message ?? ''), mis_a_jour: (corps.appliques ?? []).filter((a) => !a.orphelin).length };
  await env.KV.put('dernier_run', JSON.stringify(run));
  await noterPassage(env, run, corps);
  return json(run);
}

// Historique des passages (job programmé, lancement manuel, complément) : le
// job y lit si le créneau du mercredi soir / jeudi midi est déjà fait, l'admin
// y affiche les deux derniers passages du job.
const PASSAGES_MAX = 20;
async function noterPassage(env, run, corps) {
  const source = corps.source === 'job' ? 'job' : 'complement';
  const creneau = typeof corps.creneau === 'string' && corps.creneau ? corps.creneau.slice(0, 40) : null;
  const passages = await lire(env, 'passages', []);
  passages.unshift({ ...run, source, creneau });
  await env.KV.put('passages', JSON.stringify(passages.slice(0, PASSAGES_MAX)));
}

// ---------- rappels hebdo (envoyés par le script Google Apps Script) ----------

const ZONE_PARIS = 'Europe/Paris';
const jourParis = (date) => new Intl.DateTimeFormat('sv-SE', { timeZone: ZONE_PARIS }).format(date); // AAAA-MM-JJ

// Lundi (heure de Paris) de la semaine de « maintenant », au format AAAA-MM-JJ.
export function lundiParis(maintenant) {
  const jour = jourParis(maintenant);
  const nom = new Intl.DateTimeFormat('en-US', { timeZone: ZONE_PARIS, weekday: 'short' }).format(maintenant);
  const ecart = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(nom);
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ecart);
  return d.toISOString().slice(0, 10);
}

function texteRappel(type, prenom, lien, objectifsARemplir = false) {
  const lundi = type === 'lundi';
  const sujet = lundi
    ? 'Infomerciale BNI : ta photo et ta demande pour cette semaine'
    : 'Rappel : ton infomerciale BNI avant ce soir 19h';
  const intro = lundi
    ? "Petit rappel pour la réunion de cette semaine : pense à envoyer la photo de ton infomerciale et ta demande « Qui peut m'aider à rencontrer »."
    : "Je n'ai pas encore reçu ta photo ni ta demande « Qui peut m'aider à rencontrer » pour la réunion de cette semaine.";
  const limite = lundi ? 'Limite : mercredi 19h, au plus tard.' : 'Limite : ce soir, mercredi 19h, au plus tard.';
  const lignes = [
    `Bonjour ${prenom},`,
    '',
    intro,
    '',
    limite,
    '',
    'Ton lien perso :',
    lien,
    '',
    'Pour la demande : une seule personne, le plus précis possible (Prénom NOM – Fonction – Entreprise (Localité)).',
    "Tu travailles avec des particuliers ? Vise plutôt un prescripteur de ton activité : un professionnel qui conseille tes futurs clients (ex. notaire, agent immobilier, expert-comptable).",
    '',
    ...(lundi && objectifsARemplir ? [
      "Pense aussi à remplir ton objectif BNI de l'année (chiffre d'affaires HT et nombre de recommandations transformées) ainsi que les métiers prescripteurs ou dont tu as besoin dans le groupe : c'est en bas de la même page, une seule fois.",
      '',
    ] : []),
    "Tu ne peux pas venir ? En haut de la page, le bouton « Je ne peux pas venir : me faire suppléer » t'aide à trouver quelqu'un pour te remplacer.",
    '',
    'Une question ou un doute ? Réponds simplement à ce mail.',
    '',
    'Belle semaine,',
    'Wassim',
  ];
  return { sujet, texte: lignes.join('\n') };
}

// Une date ISO tombe-t-elle dans la semaine (lundi 00:00 → dimanche 23:59,
// heure de Paris) qui commence le jour « lundi » (AAAA-MM-JJ) ? Une date
// absente ou illisible ne compte pas (et ne fait pas planter la liste).
export function dansLaSemaine(iso, lundi) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return false;
  const fin = new Date(`${lundi}T12:00:00Z`);
  fin.setUTCDate(fin.getUTCDate() + 7);
  const jour = jourParis(d);
  return jour >= lundi && jour < fin.toISOString().slice(0, 10);
}

// Règle unique « a envoyé cette semaine », partagée par la relance du
// mercredi et l'admin : dépôt en attente, dépôt appliqué (même slide
// introuvable) ou trace dans le journal envois:<lundi> (photo ou demande).
export function aEnvoyeCetteSemaine({ depot, applique, trace }, lundi) {
  return dansLaSemaine(depot?.date, lundi)
    || dansLaSemaine(applique?.date, lundi)
    || Boolean(trace && (trace.photo || trace.demande));
}

// Lit, pour une liste de slide_id, ce qu'il faut pour appliquer la règle.
async function envoisDeLaSemaine(env, ids, lundi) {
  const journal = await lire(env, `envois:${lundi}`, {});
  const resultat = new Map();
  for (const id of ids) {
    const [depot, applique] = await Promise.all([lire(env, `depot:${id}`, null), lire(env, `applique:${id}`, null)]);
    resultat.set(id, aEnvoyeCetteSemaine({ depot, applique, trace: journal[id] }, lundi));
  }
  return resultat;
}

// Liste des mails à envoyer : les membres avec un email et un lien perso,
// sauf ceux qui ont déjà envoyé leur infomerciale cette semaine. Le mercredi
// c'est la relance ; le lundi (9h) personne n'a en général encore envoyé,
// mais l'exclusion évite de relancer un membre en cas d'envoi tardif ou
// manuel du rappel du lundi.
export async function listeRappels(env, origine, type, maintenant) {
  const [membres, jetons, emails] = await Promise.all([lire(env, 'membres', []), lire(env, 'jetons', {}), lire(env, 'emails', {})]);
  const jetonDe = Object.fromEntries(Object.entries(jetons).map(([j, id]) => [id, j]));
  const lundi = lundiParis(maintenant);
  const envoye = await envoisDeLaSemaine(env, membres.map((m) => m.slide_id), lundi);
  const recap = { membres: membres.length, sans_email_ou_lien: 0, exclus_deja_envoye: 0, a_envoyer: 0 };
  const mails = [];
  for (const m of membres) {
    const email = emails[m.slide_id];
    if (!email || !jetonDe[m.slide_id]) { recap.sans_email_ou_lien += 1; continue; }
    if (envoye.get(m.slide_id)) { recap.exclus_deja_envoye += 1; continue; }
    const prenom = String(m.nom).split(/\s+/)[0];
    const objectifsARemplir = !(await lire(env, `objectifs:${m.slide_id}`, null));
    mails.push({ nom: m.nom, email, ...texteRappel(type, prenom, `${origine}/?m=${jetonDe[m.slide_id]}`, objectifsARemplir) });
  }
  recap.a_envoyer = mails.length;
  return { type, semaine_du: lundi, recap, mails };
}

async function routesAdmin(request, env, url) {
  if (!estAdmin(request, env)) return erreur('Accès refusé.', 401);
  const p = url.pathname;
  const m = request.method;

  // ?maintenant= (date ISO) : simulation d'une date, pour vérifier les rappels
  const maintenant = url.searchParams.get('maintenant') ? new Date(url.searchParams.get('maintenant')) : new Date();
  if (Number.isNaN(maintenant.getTime())) return erreur('maintenant : date ISO attendue.');
  const corpsJson = async () => { try { return await request.json(); } catch { return null; } };

  if (p === '/api/admin/etat' && m === 'GET') return json(await etatAdmin(env, url.origin, maintenant));
  if (p === '/api/admin/appliquer' && m === 'POST') return declencherJob(env);
  // vérifie le jeton GitHub sans toucher au deck : nettoyage à blanc (liste, n'écrit rien)
  if (p === '/api/admin/essai-jeton' && m === 'POST') {
    if (!env.GH_DISPATCH_TOKEN) return erreur('Jeton GitHub absent (GH_DISPATCH_TOKEN).', 501);
    const r = await lancerWorkflow(env, 'nettoyage', { mode: 'essai' });
    return r.ok ? json({ ok: true }) : erreur(`GitHub a refusé le lancement (${r.statut}).`, 502);
  }
  if (p === '/api/admin/emails' && m === 'PUT') {
    let corps;
    try { corps = await request.json(); } catch { return erreur('Requête illisible.'); }
    if (!corps.emails || typeof corps.emails !== 'object') return erreur('emails ({ slide_id: email }) requis.');
    const propres = Object.fromEntries(Object.entries(corps.emails)
      .map(([id, e]) => [Number(id), String(e ?? '').trim()])
      .filter(([id, e]) => id && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)));
    await env.KV.put('emails', JSON.stringify(propres));
    return json({ ok: true, nombre: Object.keys(propres).length });
  }
  if (p === '/api/admin/rappels' && m === 'GET') {
    const type = url.searchParams.get('type');
    if (['secretaire_vendredi', 'secretaire_lundi', 'conferencier_mercredi'].includes(type)) {
      return json(await listeRappelsConference(env, url.origin, type, maintenant));
    }
    if (['reseaux_mercredi', 'reseaux_jeudi'].includes(type)) return json(await listeRappelsReseaux(env, url.origin, type, maintenant));
    if (!['lundi', 'mercredi'].includes(type)) return erreur('type=lundi, mercredi, secretaire_vendredi, secretaire_lundi, conferencier_mercredi, reseaux_mercredi ou reseaux_jeudi requis.');
    return json(await listeRappels(env, url.origin, type, maintenant));
  }
  if (p === '/api/admin/secretaire' && m === 'PUT') {
    const corps = await corpsJson();
    if (!corps) return erreur('Requête illisible.');
    return nommerSecretaire(env, corps, maintenant, url.origin);
  }
  if (p === '/api/admin/genres' && m === 'PUT') {
    const corps = await corpsJson();
    if (!corps?.genres || typeof corps.genres !== 'object') return erreur('genres ({ slide_id: f | m | vide }) requis.');
    const genres = await lire(env, 'genres', {});
    for (const [id, g] of Object.entries(corps.genres)) {
      if (!Number(id)) continue;
      if (g === 'f' || g === 'm') genres[Number(id)] = g; else delete genres[Number(id)];
    }
    await env.KV.put('genres', JSON.stringify(genres));
    return json({ ok: true, genres });
  }
  if (p === '/api/admin/conference/designer' && m === 'POST') {
    const corps = await corpsJson();
    if (!corps) return erreur('Requête illisible.');
    return designer(env, vendrediCible(maintenant), corps.slide_id, 'admin', maintenant);
  }
  if (p === '/api/admin/conference/fichier' && m === 'GET') return fichierConference(env, String(url.searchParams.get('vendredi') ?? ''));
  if (p === '/api/admin/conference/notifications' && m === 'GET') {
    // appelé toutes les 15 min par le script Gmail, à l'heure : on en profite
    // pour lancer à temps le passage du deck dû (src/declenchement.js).
    // Heure réelle ; un essai daté (?maintenant=) ne lance jamais rien.
    if (!url.searchParams.has('maintenant')) await declencherSiDu(env, new Date());
    return json(await notificationsAEnvoyer(env, url.origin, maintenant));
  }
  if (p === '/api/admin/conference/notifications' && m === 'POST') {
    const corps = await corpsJson();
    if (!corps) return erreur('Requête illisible.');
    return json(await accuserNotifications(env, corps.ids, maintenant));
  }
  if (p === '/api/admin/reseaux/responsable' && m === 'PUT') {
    const corps = await corpsJson();
    if (!corps) return erreur('Requête illisible.');
    return nommerResponsable(env, corps, maintenant, url.origin);
  }
  if (p === '/api/admin/reseaux/fichier' && m === 'GET') {
    return fichierReseaux(env, String(url.searchParams.get('vendredi') ?? ''), String(url.searchParams.get('envoi') ?? ''));
  }
  if (p === '/api/admin/suppleants' && m === 'PUT') {
    let corps;
    try { corps = await request.json(); } catch { return erreur('Requête illisible.'); }
    if (!Array.isArray(corps.suppleants)) return erreur('suppleants (liste) requis.');
    const propre = (v) => String(v ?? '').split(/\s+/).filter(Boolean).join(' ');
    const liste = corps.suppleants
      .map((x) => ({ nom: propre(x.nom), prenom: propre(x.prenom), email: propre(x.email), tel: propre(x.tel) }))
      .filter((x) => x.nom || x.prenom);
    await env.KV.put('suppleants', JSON.stringify(liste));
    return json({ ok: true, nombre: liste.length });
  }

  const photo = p.match(/^\/api\/(?:admin|job)\/photo(-appliquee)?\/(\d+)$/);
  if (photo && m === 'GET') {
    const img = await env.KV.get(`${photo[1] ? 'photo_appliquee' : 'photo'}:${photo[2]}`, 'arrayBuffer');
    return img ? new Response(img, { headers: { 'Content-Type': 'image/jpeg' } }) : erreur('Pas de photo.', 404);
  }

  if (p === '/api/job/entree' && m === 'GET') {
    const membres = await lire(env, 'membres', []);
    const ms = await lire(env, 'ms', null);
    const { keys } = await env.KV.list({ prefix: 'depot:' });
    const depots = (await Promise.all(keys.map((k) => lire(env, k.name, null)))).filter(Boolean);
    return json({
      ms, depots, membres, passages: await lire(env, 'passages', []),
      conference: await conferenceAPoser(env, maintenant), reseaux: await reseauxAPoser(env, maintenant),
    });
  }
  const morceauRs = p.match(/^\/api\/job\/reseaux\/morceau\/([\w-]+)\/(\d+)$/);
  if (morceauRs && m === 'GET') return morceauReseauxPourJob(env, morceauRs[1], Number(morceauRs[2]));
  const morceau = p.match(/^\/api\/job\/conference\/morceau\/([\w-]+)\/(\d+)$/);
  if (morceau && m === 'GET') return morceauPourJob(env, morceau[1], Number(morceau[2]));
  if (p === '/api/job/ms' && m === 'PUT') {
    let corps;
    try { corps = await request.json(); } catch { return erreur('Requête illisible.'); }
    const actuel = await lire(env, 'ms', {});
    const suivant = { ...actuel, ...corps };
    // deux modes : jeton rclone (sans inscription Azure) ou appli Azure (refresh_token + client_id)
    if (!suivant.rclone_token && !(suivant.refresh_token && suivant.client_id)) return erreur('rclone_token, ou refresh_token et client_id, requis.');
    await env.KV.put('ms', JSON.stringify(suivant));
    return json({ ok: true });
  }
  if (p === '/api/job/nettoyage') {
    const r = await routesNettoyage(request, env, url);
    if (r) return r;
  }
  if (p === '/api/job/resultat' && m === 'POST') {
    let corps;
    try { corps = await request.json(); } catch { return erreur('Requête illisible.'); }
    return recevoirResultat(env, corps);
  }
  return erreur('Introuvable.', 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;
    try {
      if (p === '/' && request.method === 'GET') return html(PAGE_MEMBRE);
      if (p === '/admin' && request.method === 'GET') return html(PAGE_ADMIN);
      if (p === '/secretaire' && request.method === 'GET') return html(PAGE_SECRETAIRE);
      if (p === '/conference' && request.method === 'GET') return html(PAGE_CONFERENCE);
      if (p === '/reseaux' && request.method === 'GET') return html(PAGE_RESEAUX);
      if (p === '/health') return json({ ok: true });
      if (p === '/addin' && request.method === 'GET') return html(PAGE_ADDIN);
      if (p === '/addin/manifest.xml') {
        return new Response(manifesteAddin(url.origin), { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Content-Disposition': 'attachment; filename="infomerciales-bni.xml"' } });
      }
      if (p === '/addin/icone.png') {
        return new Response(Uint8Array.from(atob(ICONE_ADDIN), (c) => c.charCodeAt(0)), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' } });
      }
      if (p.startsWith('/api/admin/') || p.startsWith('/api/job/')) return await routesAdmin(request, env, url);
      if (p.startsWith('/api/secretaire/') || p.startsWith('/api/conference/')) return await routesPubliques(request, env, url);
      if (p.startsWith('/api/reseaux/')) return await routesReseaux(request, env, url);
      if (p.startsWith('/api/')) return await routesMembre(request, env, url);
      return erreur('Introuvable.', 404);
    } catch (e) {
      console.error('erreur', e && e.message);
      return erreur('Erreur interne.', 500);
    }
  },
};
