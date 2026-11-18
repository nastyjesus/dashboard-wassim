// Rappels infomerciales BNI Bruz Envol — Google Apps Script (compte Gmail de Wassim).
//
// Lundi 9h : tous les membres. Mercredi 14h : ceux qui n'ont rien envoyé depuis lundi.
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
function apercuLundi() { Logger.log(JSON.stringify(liste_('lundi'), null, 1)); }
function apercuMercredi() { Logger.log(JSON.stringify(liste_('mercredi'), null, 1)); }

function liste_(type) {
  const p = PropertiesService.getScriptProperties();
  const r = UrlFetchApp.fetch(`${WORKER_URL}/api/admin/rappels?type=${type}`, {
    headers: { 'X-Wassim-Auth': p.getProperty('BNI_ADMIN_TOKEN') },
    muteHttpExceptions: true,
  });
  if (r.getResponseCode() !== 200) throw new Error(`Serveur : ${r.getResponseCode()} ${r.getContentText()}`);
  return JSON.parse(r.getContentText()).mails;
}

function envoyer_(type) {
  const mails = liste_(type);
  mails.forEach((m) => GmailApp.sendEmail(m.email, m.sujet, m.texte, { name: 'Wassim Loumi' }));
  console.log(`${type} : ${mails.length} mail(s) envoyé(s)`);
}

function installerDeclencheurs() {
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('rappelLundi').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(9).nearMinute(0).inTimezone(ZONE).create();
  ScriptApp.newTrigger('rappelMercredi').timeBased().onWeekDay(ScriptApp.WeekDay.WEDNESDAY).atHour(14).nearMinute(0).inTimezone(ZONE).create();
  console.log('Déclencheurs installés : lundi vers 9h et mercredi vers 14h (heure de Paris).');
}
