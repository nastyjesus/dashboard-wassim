// Rappels infomerciales BNI Bruz Envol — Google Apps Script (compte Gmail de Wassim).
//
// Lundi 9h : tous les membres. Mercredi 14h : ceux qui n'ont rien envoyé depuis lundi.
// (Le serveur exclut aussi du lundi ceux qui ont déjà envoyé cette semaine.)
//
// Conférence de la semaine :
//   vendredi 14h  secrétaire trésorier : désigner le membre qui fera la conférence
//                 du vendredi suivant ;
//   lundi 9h      secrétaire trésorier : rappel, seulement si personne n'est désigné ;
//   mercredi 14h  conférencier : relance s'il n'a pas encore déposé ses slides ;
//   toutes les 15 min : mail au conférencier dès sa désignation, et mail à toi
//                 (adresse de ce compte Gmail) dès qu'il a validé son dépôt.
//
// Après toute modification de ce fichier : le recoller à la main dans Apps Script.
// La liste, les liens perso et le texte viennent du serveur (/api/admin/rappels,
// /api/admin/conference/notifications) : ce script ne fait qu'envoyer.
//
// Mise en place (une fois) :
//   1. script.google.com > Nouveau projet > coller ce fichier.
//   2. Paramètres du projet > Propriétés du script : BNI_ADMIN_TOKEN = jeton admin.
//   3. Exécuter installerDeclencheurs une fois et autoriser le script.

const ZONE = 'Europe/Paris';
const WORKER_URL = 'https://bni-infomerciales.loumiwassim.workers.dev';

function rappelLundi() { envoyer_('lundi'); }
function rappelMercredi() { envoyer_('mercredi'); }
// Les rappels de conférence tombent à la même heure que ceux des infomerciales :
// ils attendent la fin de l'autre envoi au lieu d'abandonner.
const ATTENTE_LONGUE = 5 * 60 * 1000;
function rappelSecretaireVendredi() { envoyer_('secretaire_vendredi', ATTENTE_LONGUE); }
function rappelSecretaireLundi() { envoyer_('secretaire_lundi', ATTENTE_LONGUE); }
function rappelConferencierMercredi() { envoyer_('conferencier_mercredi', ATTENTE_LONGUE); }

// Aperçus sans envoi : affichent dans le journal qui recevrait quoi.
// (n'envoient rien : à utiliser plutôt que les fonctions rappel… pour vérifier)
function apercuLundi() { Logger.log(JSON.stringify(liste_('lundi'), null, 1)); }
function apercuMercredi() { Logger.log(JSON.stringify(liste_('mercredi'), null, 1)); }
function apercuSecretaireVendredi() { Logger.log(JSON.stringify(liste_('secretaire_vendredi'), null, 1)); }
function apercuSecretaireLundi() { Logger.log(JSON.stringify(liste_('secretaire_lundi'), null, 1)); }
function apercuConferencierMercredi() { Logger.log(JSON.stringify(liste_('conferencier_mercredi'), null, 1)); }
function apercuNotificationsConference() { Logger.log(JSON.stringify(appel_('get', '/api/admin/conference/notifications'), null, 1)); }

function appel_(methode, chemin, corps) {
  const p = PropertiesService.getScriptProperties();
  const options = { method: methode, headers: { 'X-Wassim-Auth': p.getProperty('BNI_ADMIN_TOKEN') }, muteHttpExceptions: true };
  if (corps) { options.contentType = 'application/json'; options.payload = JSON.stringify(corps); }
  const r = UrlFetchApp.fetch(`${WORKER_URL}${chemin}`, options);
  if (r.getResponseCode() !== 200) throw new Error(`Serveur : ${r.getResponseCode()} ${r.getContentText()}`);
  const rep = JSON.parse(r.getContentText());
  if (methode === 'get' && !Array.isArray(rep.mails)) throw new Error('Serveur : réponse sans liste de mails');
  return rep;
}

function liste_(type) {
  return appel_('get', `/api/admin/rappels?type=${type}`); // { type, recap, mails }
}

function envoyer_(type, attente) {
  // une seule exécution à la fois (déclencheur + exécution manuelle simultanés)
  const verrou = LockService.getScriptLock();
  if (!verrou.tryLock(attente || 30000)) { console.log(`${type} : une autre exécution est en cours, rien à faire`); return; }
  try {
    // la liste est refaite au moment de l'envoi : un membre qui a envoyé son
    // infomerciale depuis lundi n'y figure pas (règle calculée par le serveur)
    const rep = liste_(type);
    const mails = rep.mails;
    if (rep.recap) console.log(`${type} : ${JSON.stringify(rep.recap)}`);
    if (!mails.length) { console.log(`${type} : personne à relancer`); return; }
    // Garde-fou 1 : si ce rappel est déjà parti aujourd'hui (changement d'heure
    // du déclencheur, exécution manuelle…), on n'envoie pas une seconde fois.
    const jour = Utilities.formatDate(new Date(), ZONE, 'yyyy-MM-dd');
    const minuit = Math.floor(Utilities.parseDate(jour, ZONE, 'yyyy-MM-dd').getTime() / 1000);
    if (GmailApp.search(`in:sent subject:"${mails[0].sujet}" after:${minuit}`, 0, 1).length) {
      console.log(`${type} : déjà envoyé aujourd'hui, rien à faire`);
      return;
    }
    // Garde-fou 2, par destinataire : jamais deux fois le même type de rappel
    // au même email le même jour (journal du jour + recherche dans Gmail).
    const journal = journal_(type, jour);
    let envoyes = 0;
    let ignores = 0;
    mails.forEach((m) => {
      const email = String(m.email).trim().toLowerCase();
      if (journal.deja[email] || GmailApp.search(`in:sent to:${email} subject:"${m.sujet}" after:${minuit}`, 0, 1).length) {
        ignores += 1;
        return;
      }
      GmailApp.sendEmail(m.email, m.sujet, m.texte, { name: 'Wassim Loumi' });
      journal.deja[email] = true;
      journal.enregistrer();
      envoyes += 1;
    });
    console.log(`${type} : ${envoyes} mail(s) envoyé(s), ${ignores} déjà reçu(s) aujourd'hui`);
  } finally {
    verrou.releaseLock();
  }
}

// Journal des destinataires du jour, dans les propriétés du script (compte
// Google de Wassim, jamais dans le dépôt). Les jours précédents sont effacés.
function journal_(type, jour) {
  const p = PropertiesService.getScriptProperties();
  const cle = `envoyes_${type}_${jour}`;
  Object.keys(p.getProperties())
    .filter((k) => k.indexOf(`envoyes_${type}_`) === 0 && k !== cle)
    .forEach((k) => p.deleteProperty(k));
  const journal = { deja: JSON.parse(p.getProperty(cle) || '{}') };
  journal.enregistrer = () => p.setProperty(cle, JSON.stringify(journal.deja));
  return journal;
}

// Mails de conférence déclenchés par un événement (désignation, dépôt validé),
// relevés tous les quarts d'heure. Garde-fou anti-doublon : chaque mail a un
// identifiant, noté ici juste après l'envoi et avant l'accusé de réception au
// serveur ; un identifiant déjà noté n'est jamais renvoyé, même si l'accusé
// s'est perdu (il est simplement renvoyé au serveur).
function notificationsConference() {
  const verrou = LockService.getScriptLock();
  if (!verrou.tryLock(10000)) { console.log('conférence : une autre exécution est en cours, au prochain quart d\'heure'); return; }
  try {
    const rep = appel_('get', '/api/admin/conference/notifications');
    if (rep.sans_email && rep.sans_email.length) console.log(`conférence : ${rep.sans_email.length} conférencier(s) sans email (voir l'admin)`);
    if (!rep.mails.length) return;
    // « moi » : l'adresse du compte qui exécute ce script, jamais écrite dans le dépôt
    const moi = Session.getEffectiveUser().getEmail();
    const p = PropertiesService.getScriptProperties();
    const deja = JSON.parse(p.getProperty('notifications_conference') || '{}');
    const limite = Date.now() - 60 * 24 * 3600 * 1000;
    Object.keys(deja).forEach((id) => { if (deja[id] < limite) delete deja[id]; });
    const faits = [];
    rep.mails.forEach((m) => {
      if (!deja[m.id]) {
        const a = m.a === 'moi' ? moi : m.email;
        if (!a) return;
        GmailApp.sendEmail(a, m.sujet, m.texte, { name: 'Wassim Loumi' });
        deja[m.id] = Date.now();
        p.setProperty('notifications_conference', JSON.stringify(deja));
      }
      faits.push(m.id);
    });
    if (faits.length) appel_('post', '/api/admin/conference/notifications', { ids: faits });
    console.log(`conférence : ${faits.length} mail(s) traité(s)`);
  } finally {
    verrou.releaseLock();
  }
}

function installerDeclencheurs() {
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('rappelLundi').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(9).nearMinute(0).inTimezone(ZONE).create();
  ScriptApp.newTrigger('rappelMercredi').timeBased().onWeekDay(ScriptApp.WeekDay.WEDNESDAY).atHour(14).nearMinute(0).inTimezone(ZONE).create();
  ScriptApp.newTrigger('rappelSecretaireVendredi').timeBased().onWeekDay(ScriptApp.WeekDay.FRIDAY).atHour(14).nearMinute(0).inTimezone(ZONE).create();
  ScriptApp.newTrigger('rappelSecretaireLundi').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(9).nearMinute(0).inTimezone(ZONE).create();
  ScriptApp.newTrigger('rappelConferencierMercredi').timeBased().onWeekDay(ScriptApp.WeekDay.WEDNESDAY).atHour(14).nearMinute(0).inTimezone(ZONE).create();
  ScriptApp.newTrigger('notificationsConference').timeBased().everyMinutes(15).create();
  console.log('Déclencheurs installés : lundi vers 9h, mercredi vers 14h, vendredi vers 14h (heure de Paris), et toutes les 15 minutes.');
}
