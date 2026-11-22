// Conférencier de la semaine : le secrétaire trésorier désigne, chaque
// semaine, le membre qui fera la conférence du vendredi suivant ; ce membre
// dépose ses slides (PDF ou PowerPoint) et 1 à 3 contacts spécifiques ; le job
// pose les slides dans la partie « Conférence » du deck (mercredi soir, jeudi
// midi) et le nettoyage du samedi les retire.
//
// Clés KV :
//   secretaires         [{ slide_id, nom, email, debut, fin, jeton, designe_le, remplace_le }]
//                       mandats, le plus récent d'abord (données perso)
//   genres              { <slide_id>: 'f' | 'm' } accord des mails (sinon tournure neutre)
//   conference:<vendredi>  { vendredi, slide_id, nom, email, jeton, designe_le, designe_par,
//                       brouillon, depot, applique, mail_designation, mail_depot }
//   jetons_conference   { <jeton>: <vendredi> } (lien perso du conférencier)
//   conf_morceau:<envoi>:<n>  morceau du fichier déposé (le KV limite une valeur à 25 Mio)
//
// Les contacts spécifiques ne sont servis qu'à l'admin et dans le mail à
// Wassim : jamais au job (donc jamais sur le deck), ni aux pages membres.

import { lundiParis, normaliserNom } from './index.js';
import { heureParis } from './nettoyage.js';

export const TAILLE_MORCEAU = 8 * 1024 * 1024;
export const TAILLE_MAX = 80 * 1024 * 1024;
const CONTACT_MAX = 200;
const CONTACTS_MAX = 3;
const NOM_FICHIER_MAX = 120;

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});
const erreur = (message, status = 400) => json({ erreur: message }, status);
const lire = async (env, cle, defaut) => (await env.KV.get(cle, 'json')) ?? defaut;
const ecrire = (env, cle, valeur) => env.KV.put(cle, JSON.stringify(valeur));

export function nouveauJeton() {
  const octets = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...octets)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export const decaler = (jour, n) => {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const aujourdhui = (maintenant) => heureParis(maintenant).slice(0, 10);

// Vendredi de la prochaine réunion : celui de la semaine tant que la réunion
// n'est pas terminée (vendredi 12:00, heure de Paris), sinon le suivant.
export function vendrediCible(maintenant) {
  const vendredi = decaler(lundiParis(maintenant), 4);
  return heureParis(maintenant) < `${vendredi} 12:00` ? vendredi : decaler(vendredi, 7);
}

export const libelleJour = (jour) => new Date(`${jour}T12:00:00Z`).toLocaleDateString('fr-FR', {
  weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
});

// Fin de mandat proposée : le prochain 30 mars ou 30 septembre.
export function finMandatParDefaut(maintenant) {
  const jour = aujourdhui(maintenant);
  const annee = Number(jour.slice(0, 4));
  return [`${annee}-03-30`, `${annee}-09-30`, `${annee + 1}-03-30`].find((d) => d >= jour);
}

const prenomDe = (nom) => String(nom ?? '').split(/\s+/)[0];
// accord selon le membre ; sans genre connu, une tournure neutre (jamais d'écriture inclusive)
const accord = (genre, masculin, feminin, neutre) => (genre === 'f' ? feminin : genre === 'm' ? masculin : neutre);

// ---------- secrétaire trésorier ----------

export async function secretaireActuel(env, maintenant) {
  const jour = aujourdhui(maintenant);
  const liste = await lire(env, 'secretaires', []);
  return liste.find((s) => !s.remplace_le && s.debut <= jour && s.fin >= jour) ?? null;
}

export async function nommerSecretaire(env, corps, maintenant, origine) {
  const membres = await lire(env, 'membres', []);
  const membre = membres.find((m) => m.slide_id === Number(corps.slide_id));
  if (!membre) return erreur('Membre inconnu.');
  const fin = String(corps.fin ?? '');
  const jour = aujourdhui(maintenant);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fin) || fin < jour) return erreur('Date de fin de mandat : une date à venir (AAAA-MM-JJ).');
  const emails = await lire(env, 'emails', {});
  const email = String(corps.email ?? '').trim() || emails[membre.slide_id] || '';
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return erreur('Email invalide.');
  const liste = await lire(env, 'secretaires', []);
  for (const s of liste) if (!s.remplace_le && s.fin >= jour) s.remplace_le = maintenant.toISOString();
  const nouveau = {
    slide_id: membre.slide_id, nom: membre.nom, email, debut: jour, fin,
    jeton: nouveauJeton(), designe_le: maintenant.toISOString(), remplace_le: null,
  };
  liste.unshift(nouveau);
  await ecrire(env, 'secretaires', liste.slice(0, 40));
  return json({ ...nouveau, lien: `${origine}/secretaire?s=${nouveau.jeton}` });
}

// ---------- désignation du conférencier ----------

async function supprimerFichiers(env, envoi, morceaux) {
  if (!envoi) return;
  for (let n = 0; n < (morceaux || 0); n += 1) await env.KV.delete(`conf_morceau:${envoi}:${n}`);
}

export async function designer(env, vendredi, slideId, par, maintenant) {
  const membres = await lire(env, 'membres', []);
  const membre = membres.find((m) => m.slide_id === Number(slideId));
  if (!membre) return erreur('Membre inconnu.');
  const cle = `conference:${vendredi}`;
  const avant = await lire(env, cle, null);
  if (avant && avant.slide_id === membre.slide_id) return json(resumeDesignation(avant));
  const jetons = await lire(env, 'jetons_conference', {});
  if (avant) {
    // changement de conférencier : l'ancien lien ne sert plus, son dépôt part
    delete jetons[avant.jeton];
    for (const f of [avant.brouillon, avant.depot]) if (f) await supprimerFichiers(env, f.envoi, f.morceaux);
  }
  const emails = await lire(env, 'emails', {});
  const conf = {
    vendredi, slide_id: membre.slide_id, nom: membre.nom, email: emails[membre.slide_id] || '',
    jeton: nouveauJeton(), designe_le: maintenant.toISOString(), designe_par: par,
    brouillon: null, depot: null, applique: null, mail_designation: null, mail_depot: null,
  };
  jetons[conf.jeton] = vendredi;
  await ecrire(env, cle, conf);
  await ecrire(env, 'jetons_conference', jetons);
  return json(resumeDesignation(conf));
}

const resumeDesignation = (c) => ({ vendredi: c.vendredi, slide_id: c.slide_id, nom: c.nom, designe_le: c.designe_le, a_depose: Boolean(c.depot) });

// ---------- pages publiques (liens perso) ----------

async function confParJeton(env, jeton) {
  if (!jeton) return null;
  const vendredi = (await lire(env, 'jetons_conference', {}))[jeton];
  if (!vendredi) return null;
  const conf = await lire(env, `conference:${vendredi}`, null);
  return conf && conf.jeton === jeton ? conf : null;
}

const typeDe = (nom) => (/\.pdf$/i.test(nom) ? 'pdf' : /\.pptx$/i.test(nom) ? 'pptx' : null);

export async function routesPubliques(request, env, url, maintenant = new Date()) {
  const p = url.pathname;
  const m = request.method;

  if (p.startsWith('/api/secretaire/')) {
    const jeton = url.searchParams.get('s');
    const sec = await secretaireActuel(env, maintenant);
    if (!jeton || !sec || sec.jeton !== jeton) return erreur('Lien invalide ou mandat terminé. Demande ton lien à Wassim.', 403);
    const vendredi = vendrediCible(maintenant);
    if (p === '/api/secretaire/etat' && m === 'GET') {
      const membres = (await lire(env, 'membres', [])).map((x) => ({ slide_id: x.slide_id, nom: x.nom, metier: x.metier }))
        .sort((a, b) => normaliserNom(a.nom).localeCompare(normaliserNom(b.nom)));
      const conf = await lire(env, `conference:${vendredi}`, null);
      return json({
        prenom: prenomDe(sec.nom), fin_mandat: sec.fin, vendredi, vendredi_libelle: libelleJour(vendredi),
        membres, designe: conf ? resumeDesignation(conf) : null,
      });
    }
    if (p === '/api/secretaire/designer' && m === 'POST') {
      let corps;
      try { corps = await request.json(); } catch { return erreur('Requête illisible.'); }
      return designer(env, vendredi, corps.slide_id, 'secretaire', maintenant);
    }
    return erreur('Introuvable.', 404);
  }

  // /api/conference/*
  const conf = await confParJeton(env, url.searchParams.get('c'));
  if (!conf) return erreur("Lien invalide : la conférence a peut-être été confiée à un autre membre. Demande ton lien à Wassim.", 403);
  const cle = `conference:${conf.vendredi}`;
  const passee = heureParis(maintenant) >= `${conf.vendredi} 12:00`;

  if (p === '/api/conference/moi' && m === 'GET') {
    const genre = (await lire(env, 'genres', {}))[conf.slide_id] ?? null;
    const d = conf.depot;
    return json({
      prenom: prenomDe(conf.nom), nom: conf.nom, genre, vendredi: conf.vendredi, vendredi_libelle: libelleJour(conf.vendredi),
      limite: `${libelleJour(decaler(conf.vendredi, -2))} 19h`, passee,
      // les contacts eux-mêmes ne sont jamais renvoyés : seulement leur nombre
      depot: d ? { nom_fichier: d.nom_fichier, type: d.type, taille: d.taille, valide_le: d.valide_le, nb_contacts: d.contacts.length } : null,
      sur_la_presentation: conf.applique?.ok && conf.applique.valide_le === d?.valide_le ? { slides: conf.applique.slides, le: conf.applique.date } : null,
      taille_morceau: TAILLE_MORCEAU, taille_max: TAILLE_MAX,
    });
  }
  if (passee) return erreur('Cette conférence est passée : plus de dépôt possible.', 409);

  if (p === '/api/conference/envoi' && m === 'POST') {
    let corps;
    try { corps = await request.json(); } catch { return erreur('Requête illisible.'); }
    const nom = String(corps.nom_fichier ?? '').replace(/[\\/\r\n]/g, ' ').trim().slice(-NOM_FICHIER_MAX);
    const type = typeDe(nom);
    const taille = Number(corps.taille);
    if (!type) return erreur('Fichier attendu : PowerPoint (.pptx) ou PDF (.pdf).');
    if (!Number.isInteger(taille) || taille <= 0) return erreur('Fichier vide.');
    if (taille > TAILLE_MAX) return erreur(`Fichier trop lourd (${Math.round(TAILLE_MAX / 1024 / 1024)} Mo max). Exporte-le en PDF ou réduis les images.`, 413);
    if (conf.brouillon) await supprimerFichiers(env, conf.brouillon.envoi, conf.brouillon.morceaux);
    conf.brouillon = { envoi: nouveauJeton(), nom_fichier: nom, type, taille, morceaux: Math.ceil(taille / TAILLE_MORCEAU), debut: maintenant.toISOString() };
    await ecrire(env, cle, conf);
    return json({ envoi: conf.brouillon.envoi, morceaux: conf.brouillon.morceaux, taille_morceau: TAILLE_MORCEAU });
  }
  if (p === '/api/conference/morceau' && m === 'PUT') {
    const b = conf.brouillon;
    const n = Number(url.searchParams.get('n'));
    if (!b || url.searchParams.get('envoi') !== b.envoi) return erreur('Envoi inconnu : recommence.', 409);
    if (!Number.isInteger(n) || n < 0 || n >= b.morceaux) return erreur('Morceau inattendu.');
    const corps = new Uint8Array(await request.arrayBuffer());
    const attendu = n < b.morceaux - 1 ? TAILLE_MORCEAU : b.taille - TAILLE_MORCEAU * (b.morceaux - 1);
    if (corps.byteLength !== attendu) return erreur('Morceau incomplet : recommence.', 400);
    if (n === 0) {
      const debut = String.fromCharCode(...corps.slice(0, 4));
      if ((b.type === 'pdf' && debut !== '%PDF') || (b.type === 'pptx' && debut.slice(0, 2) !== 'PK')) {
        return erreur(b.type === 'pdf' ? "Ce fichier n'est pas un vrai PDF." : "Ce fichier n'est pas un vrai PowerPoint (.pptx).");
      }
    }
    await env.KV.put(`conf_morceau:${b.envoi}:${n}`, corps);
    return json({ ok: true, n });
  }
  if (p === '/api/conference/valider' && m === 'POST') {
    let corps;
    try { corps = await request.json(); } catch { return erreur('Requête illisible.'); }
    const contacts = (Array.isArray(corps.contacts) ? corps.contacts : [])
      .map((c) => String(c ?? '').split(/\s+/).filter(Boolean).join(' ').slice(0, CONTACT_MAX)).filter(Boolean);
    if (contacts.length < 1 || contacts.length > CONTACTS_MAX) return erreur('Indique 1 à 3 contacts spécifiques.');
    let fichier = conf.depot;
    if (corps.envoi) {
      const b = conf.brouillon;
      if (!b || b.envoi !== corps.envoi) return erreur('Envoi inconnu : redépose ton fichier.', 409);
      for (let n = 0; n < b.morceaux; n += 1) {
        if ((await env.KV.get(`conf_morceau:${b.envoi}:${n}`, 'arrayBuffer')) === null) return erreur('Fichier incomplet : redépose-le.', 409);
      }
      if (conf.depot && conf.depot.envoi !== b.envoi) await supprimerFichiers(env, conf.depot.envoi, conf.depot.morceaux);
      fichier = { envoi: b.envoi, nom_fichier: b.nom_fichier, type: b.type, taille: b.taille, morceaux: b.morceaux };
      conf.brouillon = null;
    }
    if (!fichier) return erreur("Dépose d'abord tes slides (PowerPoint ou PDF).");
    conf.depot = { ...fichier, contacts, valide_le: maintenant.toISOString() };
    await ecrire(env, cle, conf);
    return json({ ok: true, valide_le: conf.depot.valide_le, nb_contacts: contacts.length });
  }
  return erreur('Introuvable.', 404);
}

// ---------- mails (envoyés par le script Google Apps Script) ----------

function texteSecretaire(type, sec, genre, conf, vendredi, lien) {
  const jour = libelleJour(vendredi);
  const role = accord(genre, 'En tant que secrétaire trésorier, ', 'En tant que secrétaire trésorière, ', '');
  const lundi = type === 'secretaire_lundi';
  const sujet = lundi
    ? `Rappel BNI : qui fait la conférence du ${jour} ?`
    : `BNI : qui fait la conférence du ${jour} ?`;
  const corps = conf
    ? [`Le membre désigné pour la conférence du ${jour} est ${conf.nom}. Tu peux encore modifier ce choix sur ta page :`]
    : [lundi
      ? `Petit rappel : le membre qui fera la conférence du ${jour} n'est pas encore désigné.`
      : `${role ? `${role}c'est` : "C'est"} à toi de désigner le membre qui fera la conférence du ${jour}.`,
    '', 'Choisis-le sur ta page :'];
  const lignes = [
    `Bonjour ${prenomDe(sec.nom)},`, '',
    ...corps,
    lien, '',
    'En cas de conférence de sphère, choisis un seul membre de la sphère pour éviter les doublons : c\'est ce membre qui gère ensuite.', '',
    'Dès ton choix validé, le membre reçoit un mail avec son lien pour déposer ses slides.', '',
    'Merci,',
    'Wassim',
  ];
  return { sujet, texte: lignes.join('\n') };
}

function texteDesignation(conf, genre, lien, relance) {
  const jour = libelleJour(conf.vendredi);
  const limite = `${libelleJour(decaler(conf.vendredi, -2))} 19h`;
  const qui = accord(genre, `c'est toi le conférencier`, `c'est toi la conférencière`, `c'est toi qui fais la conférence`);
  const cadeau = accord(genre, 'ton cadeau du conférencier', 'ton cadeau de la conférencière', 'ton cadeau du membre à l\'honneur');
  const sujet = relance
    ? `Rappel BNI : tes slides de conférence avant ce soir 19h`
    : `BNI : ${jour}, ${qui}`;
  const lignes = [
    `Bonjour ${prenomDe(conf.nom)},`, '',
    relance
      ? `Je n'ai pas encore reçu tes slides pour ta conférence du ${jour}. Limite : ce soir, mercredi 19h.`
      : `Bonne nouvelle : ${jour}, ${qui} du groupe.`,
    '',
    `- Pense à préparer ${cadeau}.`,
    `- Dépose tes slides (PowerPoint ou PDF) sur ta page, avant ${limite} : elles seront ajoutées à la présentation de la réunion.`,
    `- Indique-moi aussi 1 à 3 contacts spécifiques que tu aimerais rencontrer (Prénom NOM – Fonction – Entreprise). À la fin de ta conférence, je t'aiderai à les rencontrer grâce aux personnes présentes, pour développer ton business. Tu travailles avec des particuliers ? Vise plutôt des prescripteurs de ton activité : des professionnels qui conseillent tes futurs clients. Ces contacts restent entre nous : ils n'apparaissent pas sur la présentation.`,
    '',
    'Ta page :',
    lien, '',
    'Une question ? Réponds simplement à ce mail.', '',
    relance ? 'Merci,' : 'Belle préparation,',
    'Wassim',
  ];
  return { sujet, texte: lignes.join('\n') };
}

const octetsLisibles = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} Mo` : `${Math.max(1, Math.round(n / 1024))} Ko`);

function texteDepot(conf, genre, origine) {
  const jour = libelleJour(conf.vendredi);
  const d = conf.depot;
  const qui = accord(genre, 'Le conférencier', 'La conférencière', 'Le membre qui fait la conférence');
  const sujet = `BNI : ${conf.nom} a déposé ses slides de conférence (${jour})`;
  const lignes = [
    `${qui} du ${jour}, ${conf.nom}, a déposé ses slides : voici ses demandes spécifiques.`, '',
    ...d.contacts.map((c, i) => `${i + 1}. ${c}`), '',
    `Fichier : ${d.nom_fichier} (${d.type === 'pdf' ? 'PDF' : 'PowerPoint'}, ${octetsLisibles(d.taille)}).`,
    'Les slides seront ajoutées à la partie conférence de la présentation au prochain passage (mercredi soir, rattrapage jeudi midi).',
    'Ces demandes ne figurent pas sur la présentation.', '',
    `Admin : ${origine}/admin`,
  ];
  return { sujet, texte: lignes.join('\n') };
}

// Rappels programmés : même forme de réponse que les rappels infomerciales.
export async function listeRappelsConference(env, origine, type, maintenant) {
  const vendredi = vendrediCible(maintenant);
  const [sec, conf, genres] = await Promise.all([
    secretaireActuel(env, maintenant), lire(env, `conference:${vendredi}`, null), lire(env, 'genres', {}),
  ]);
  const recap = { vendredi, a_envoyer: 0 };
  const mails = [];
  if (type === 'secretaire_vendredi' || type === 'secretaire_lundi') {
    recap.secretaire = sec ? (sec.email ? 'ok' : 'sans email') : 'aucun mandat en cours';
    recap.deja_designe = Boolean(conf);
    // le lundi, seulement si personne n'est encore désigné
    if (sec?.email && !(type === 'secretaire_lundi' && conf)) {
      mails.push({ nom: sec.nom, email: sec.email, ...texteSecretaire(type, sec, genres[sec.slide_id], conf, vendredi, `${origine}/secretaire?s=${sec.jeton}`) });
    }
  } else if (type === 'conferencier_mercredi') {
    recap.designe = Boolean(conf);
    recap.depose = Boolean(conf?.depot);
    if (conf && !conf.depot && conf.email) {
      mails.push({ nom: conf.nom, email: conf.email, ...texteDesignation(conf, genres[conf.slide_id], `${origine}/conference?c=${conf.jeton}`, true) });
    }
  }
  recap.a_envoyer = mails.length;
  return { type, vendredi, recap, mails };
}

async function conferencesRecentes(env, maintenant, nombre = 6) {
  const { keys } = await env.KV.list({ prefix: 'conference:' });
  const cible = vendrediCible(maintenant);
  const vendredis = keys.map((k) => k.name.slice('conference:'.length)).filter((v) => v >= decaler(cible, -7 * nombre))
    .sort().reverse().slice(0, nombre);
  return (await Promise.all(vendredis.map((v) => lire(env, `conference:${v}`, null)))).filter(Boolean);
}

// Mails déclenchés par un événement (désignation, dépôt validé), relevés tous
// les quarts d'heure par le script. « a: moi » = le compte Gmail qui exécute
// le script (Wassim) : son adresse n'est jamais stockée ici.
export async function notificationsAEnvoyer(env, origine, maintenant) {
  const genres = await lire(env, 'genres', {});
  const mails = [];
  const sansEmail = [];
  for (const conf of await conferencesRecentes(env, maintenant, 2)) {
    if (heureParis(maintenant) >= `${conf.vendredi} 12:00`) continue; // réunion passée
    const genre = genres[conf.slide_id];
    if (!conf.mail_designation) {
      const id = `designation:${conf.vendredi}:${conf.designe_le}`;
      if (conf.email) mails.push({ id, a: 'email', email: conf.email, ...texteDesignation(conf, genre, `${origine}/conference?c=${conf.jeton}`, false) });
      else sansEmail.push(conf.nom);
    }
    if (conf.depot && conf.mail_depot !== conf.depot.valide_le) {
      mails.push({ id: `depot:${conf.vendredi}:${conf.depot.valide_le}`, a: 'moi', ...texteDepot(conf, genre, origine) });
    }
  }
  return { mails, sans_email: sansEmail };
}

export async function accuserNotifications(env, ids, maintenant) {
  let faits = 0;
  for (const id of Array.isArray(ids) ? ids : []) {
    const m = String(id).match(/^(designation|depot):(\d{4}-\d{2}-\d{2}):(.+)$/);
    if (!m) continue;
    const cle = `conference:${m[2]}`;
    const conf = await lire(env, cle, null);
    if (!conf) continue;
    if (m[1] === 'designation' && conf.designe_le === m[3] && !conf.mail_designation) conf.mail_designation = maintenant.toISOString();
    else if (m[1] === 'depot' && conf.depot?.valide_le === m[3]) conf.mail_depot = m[3];
    else continue;
    await ecrire(env, cle, conf);
    faits += 1;
  }
  return { ok: true, faits };
}

// ---------- admin ----------

export async function etatConference(env, origine, maintenant) {
  const [secretaires, genres, emails] = await Promise.all([lire(env, 'secretaires', []), lire(env, 'genres', {}), lire(env, 'emails', {})]);
  const sec = await secretaireActuel(env, maintenant);
  const vendredi = vendrediCible(maintenant);
  const lienConf = (c) => `${origine}/conference?c=${c.jeton}`;
  const conferences = (await conferencesRecentes(env, maintenant)).map((c) => ({
    vendredi: c.vendredi, vendredi_libelle: libelleJour(c.vendredi), slide_id: c.slide_id, nom: c.nom,
    email: c.email || emails[c.slide_id] || '', lien: lienConf(c), designe_le: c.designe_le, designe_par: c.designe_par,
    mail_designation: c.mail_designation, depot: c.depot, envoi_en_cours: Boolean(c.brouillon), applique: c.applique,
  }));
  return {
    vendredi, vendredi_libelle: libelleJour(vendredi),
    secretaire: sec ? { ...sec, jeton: undefined, lien: `${origine}/secretaire?s=${sec.jeton}` } : null,
    secretaires: secretaires.map(({ jeton, ...s }) => s),
    fin_mandat_defaut: finMandatParDefaut(maintenant),
    conferences,
    genres,
  };
}

// Fichier déposé, morceau par morceau (admin : téléchargement ; job : pose).
export async function fichierConference(env, vendredi) {
  const conf = await lire(env, `conference:${vendredi}`, null);
  const d = conf?.depot;
  if (!d || d.fichier_efface) return erreur('Pas de fichier déposé (ou effacé après la réunion).', 404);
  let n = 0;
  const flux = new ReadableStream({
    async pull(controleur) {
      if (n >= d.morceaux) { controleur.close(); return; }
      const morceau = await env.KV.get(`conf_morceau:${d.envoi}:${n}`, 'arrayBuffer');
      n += 1;
      if (morceau === null) { controleur.error(new Error('morceau manquant')); return; }
      controleur.enqueue(new Uint8Array(morceau));
    },
  });
  const type = d.type === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  const nom = encodeURIComponent(d.nom_fichier);
  return new Response(flux, { headers: { 'Content-Type': type, 'Content-Length': String(d.taille), 'Content-Disposition': `attachment; filename*=UTF-8''${nom}`, 'Cache-Control': 'no-store' } });
}

// ---------- job ----------

// Conférence à poser par le job : celle de la prochaine réunion, validée et
// pas encore posée dans cette version. Sans les contacts (jamais sur le deck).
export async function conferenceAPoser(env, maintenant) {
  const conf = await lire(env, `conference:${vendrediCible(maintenant)}`, null);
  const d = conf?.depot;
  if (!d || (conf.applique?.ok && conf.applique.valide_le === d.valide_le)) return null;
  return { vendredi: conf.vendredi, type: d.type, taille: d.taille, morceaux: d.morceaux, envoi: d.envoi, valide_le: d.valide_le };
}

export async function morceauPourJob(env, envoi, n) {
  const morceau = await env.KV.get(`conf_morceau:${envoi}:${n}`, 'arrayBuffer');
  return morceau ? new Response(morceau, { headers: { 'Content-Type': 'application/octet-stream' } }) : erreur('Morceau introuvable.', 404);
}

export async function enregistrerPose(env, resultat, maintenant) {
  if (!resultat || typeof resultat !== 'object' || !resultat.vendredi) return;
  const cle = `conference:${resultat.vendredi}`;
  const conf = await lire(env, cle, null);
  // dépôt remplacé pendant le job : le prochain passage posera le nouveau
  if (!conf?.depot || conf.depot.valide_le !== resultat.valide_le) return;
  conf.applique = {
    ok: Boolean(resultat.ok), valide_le: resultat.valide_le, date: maintenant.toISOString(),
    slides: Number(resultat.slides) || 0, message: String(resultat.message ?? '').slice(0, 300),
  };
  await ecrire(env, cle, conf);
}

// Nettoyage du samedi : les fichiers des conférences passées sont effacés du
// KV (la fiche reste, pour l'historique de l'admin).
export async function purgerConferencesPassees(env, jusquAu) {
  const { keys } = await env.KV.list({ prefix: 'conference:' });
  const jetons = await lire(env, 'jetons_conference', {});
  let purgees = 0;
  for (const { name } of keys) {
    const vendredi = name.slice('conference:'.length);
    if (vendredi > jusquAu) continue;
    const conf = await lire(env, name, null);
    if (!conf) continue;
    for (const f of [conf.brouillon, conf.depot]) if (f) await supprimerFichiers(env, f.envoi, f.morceaux);
    if (conf.depot || conf.brouillon || jetons[conf.jeton]) {
      delete jetons[conf.jeton];
      conf.brouillon = null;
      if (conf.depot) conf.depot = { ...conf.depot, fichier_efface: true };
      await ecrire(env, name, conf);
      purgees += 1;
    }
  }
  await ecrire(env, 'jetons_conference', jetons);
  return purgees;
}
