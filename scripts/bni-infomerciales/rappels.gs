// Rappels infomerciales BNI Bruz Envol — Google Apps Script (compte Gmail de Wassim).
//
// Lundi 9h : tous les membres. Mercredi 14h : ceux qui n'ont rien envoyé depuis lundi.
// (Le serveur exclut aussi du lundi ceux qui ont déjà envoyé cette semaine.)
// Après toute modification de ce fichier : le recoller à la main dans Apps Script.
// La liste, les liens perso et le texte viennent du serveur (/api/admin/rappels) :
// ce script ne fait qu'envoyer.
//
// Mise en place (une fois) :
//   1. script.google.com > Nouveau projet > coller ce fichier.
//   2. Paramètres du projet > Propriétés du script : BNI_ADMIN_TOKEN = jeton admin.
//   3. Exécuter installerDeclencheurs une fois et autoriser le script.

const ZONE = 'Europe/Paris';
const WORKER_URL = 'https://bni-infomerciales.loumiwassim.workers.dev';

function rappelLundi() { envoyer_('lundi'); }
function rappelMercredi() { envoyer_('mercredi'); }

// Aperçu sans envoi : affiche dans le journal qui recevrait quoi.
// (n'envoie rien : à utiliser plutôt que rappelLundi / rappelMercredi pour vérifier)
function apercuLundi() { Logger.log(JSON.stringify(liste_('lundi'), null, 1)); }
function apercuMercredi() { Logger.log(JSON.stringify(liste_('mercredi'), null, 1)); }

function liste_(type) {
  const p = PropertiesService.getScriptProperties();
  const r = UrlFetchApp.fetch(`${WORKER_URL}/api/admin/rappels?type=${type}`, {
    headers: { 'X-Wassim-Auth': p.getProperty('BNI_ADMIN_TOKEN') },
    muteHttpExceptions: true,
  });
  if (r.getResponseCode() !== 200) throw new Error(`Serveur : ${r.getResponseCode()} ${r.getContentText()}`);
  const rep = JSON.parse(r.getContentText());
  if (!Array.isArray(rep.mails)) throw new Error('Serveur : réponse sans liste de mails');
  return rep; // { type, semaine_du, recap, mails }
}

function envoyer_(type) {
  // une seule exécution à la fois (déclencheur + exécution manuelle simultanés)
  const verrou = LockService.getScriptLock();
  if (!verrou.tryLock(30000)) { console.log(`${type} : une autre exécution est en cours, rien à faire`); return; }
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

function installerDeclencheurs() {
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('rappelLundi').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(9).nearMinute(0).inTimezone(ZONE).create();
  ScriptApp.newTrigger('rappelMercredi').timeBased().onWeekDay(ScriptApp.WeekDay.WEDNESDAY).atHour(14).nearMinute(0).inTimezone(ZONE).create();
  console.log('Déclencheurs installés : lundi vers 9h et mercredi vers 14h (heure de Paris).');
}
