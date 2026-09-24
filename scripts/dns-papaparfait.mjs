// Vérificateur de zone DNS — papaparfait.fr
//
// À quoi ça sert : avant et après la migration des serveurs de noms vers
// Cloudflare, comparer ce que le DNS public répond avec la zone attendue.
// Une migration DNS se rate en silence : le site répond, et trois jours plus
// tard on découvre que les e-mails ne sont jamais arrivés.
//
// Usage :
//   node scripts/dns-papaparfait.mjs              # résolveur Google (8.8.8.8)
//   node scripts/dns-papaparfait.mjs 1.1.1.1      # un autre résolveur public
//   node scripts/dns-papaparfait.mjs hadlee.ns.cloudflare.com
//        ↑ interroge directement un serveur de noms, même avant la bascule :
//          c'est le seul moyen de contrôler la zone Cloudflare pendant que le
//          domaine répond encore chez o2switch.
//
// Aucune dépendance : le résolveur DNS de Node, interrogé en direct (on ne
// passe pas par le cache du système, sinon on relit l'ancienne zone).

import { Resolver } from 'node:dns/promises';

const SERVEUR = process.argv[2] || '8.8.8.8';
const IP = '109.234.164.216';
const RACINE = 'papaparfait.fr';

const resolveur = new Resolver({ timeout: 5000, tries: 2 });

/** Le résolveur veut une IP : on accepte quand même un nom de serveur DNS. */
async function adresseDuServeur(nomOuIp) {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(nomOuIp)) return nomOuIp;
  const { Resolver: R } = await import('node:dns/promises');
  const r = new R();
  r.setServers(['8.8.8.8']);
  const [ip] = await r.resolve4(nomOuIp);
  return ip;
}

/** Hôtes servis par o2switch, en A direct. Aucun ne doit passer par Cloudflare. */
const HOTES_A = [
  'webmail', 'autodiscover', 'autoconfig', 'webdisk',
  'whm', 'cpanel', 'cpcontacts', 'cpcalendars',
];

/** La zone attendue. `attendu` est une sous-chaîne cherchée dans la réponse. */
const ZONE = [
  { nom: RACINE, type: 'A', attendu: IP, role: 'le site' },
  { nom: `www.${RACINE}`, type: 'CNAME', attendu: RACINE, role: 'le site (www)' },
  ...HOTES_A.map((h) => ({ nom: `${h}.${RACINE}`, type: 'A', attendu: IP, role: 'service cPanel' })),
  { nom: `mail.${RACINE}`, type: 'CNAME', attendu: RACINE, role: 'E-MAIL — doit rester sur o2switch' },
  { nom: RACINE, type: 'MX', attendu: RACINE, role: 'E-MAIL — la cible ne doit JAMAIS être proxifiée' },
  { nom: RACINE, type: 'TXT', attendu: 'v=spf1', role: 'E-MAIL — SPF' },
  { nom: `_dmarc.${RACINE}`, type: 'TXT', attendu: 'v=DMARC1', role: 'E-MAIL — DMARC' },
  { nom: `default._domainkey.${RACINE}`, type: 'TXT', attendu: 'v=DKIM1', role: 'E-MAIL — DKIM (sans lui : spam)' },
  { nom: `_caldavs._tcp.${RACINE}`, type: 'SRV', attendu: '2080', role: 'agenda (TLS)' },
  { nom: `_carddavs._tcp.${RACINE}`, type: 'SRV', attendu: '2080', role: 'contacts (TLS)' },
  { nom: `_caldav._tcp.${RACINE}`, type: 'SRV', attendu: '2079', role: 'agenda' },
  { nom: `_carddav._tcp.${RACINE}`, type: 'SRV', attendu: '2079', role: 'contacts' },
  { nom: `_autodiscover._tcp.${RACINE}`, type: 'SRV', attendu: 'cpanelemaildiscovery', role: 'config auto des clients mail' },
  { nom: `ftp.${RACINE}`, type: 'CNAME', attendu: RACINE, role: 'transfert de fichiers' },
  // Les quatre TXT « path=/ » accompagnent les SRV caldav/carddav : sans eux,
  // certains clients (iOS, macOS) ne trouvent pas le chemin de synchro.
  { nom: `_carddavs._tcp.${RACINE}`, type: 'TXT', attendu: 'path=/', role: 'chemin contacts (TLS)' },
  { nom: `_caldavs._tcp.${RACINE}`, type: 'TXT', attendu: 'path=/', role: 'chemin agenda (TLS)' },
  { nom: `_carddav._tcp.${RACINE}`, type: 'TXT', attendu: 'path=/', role: 'chemin contacts' },
  { nom: `_caldav._tcp.${RACINE}`, type: 'TXT', attendu: 'path=/', role: 'chemin agenda' },
];

/** Empreinte DKIM : on compare le début et la fin de la clé publique. Une clé
 *  tronquée à la recopie passerait le test « v=DKIM1 » sans plus rien signer. */
const DKIM_DEBUT = 'p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA06MqiGA6rQai3KV';
const DKIM_FIN = 'DKT1SqzCmQIDAQAB';

/** Plages proxy de Cloudflare : si un enregistrement e-mail tombe là, c'est cassé. */
const PLAGES_CLOUDFLARE = ['104.16.', '104.17.', '104.18.', '104.19.', '104.20.', '104.21.',
  '104.22.', '104.23.', '104.24.', '104.25.', '104.26.', '104.27.',
  '172.64.', '172.65.', '172.66.', '172.67.', '188.114.'];
const estCloudflare = (v) => PLAGES_CLOUDFLARE.some((p) => v.startsWith(p));

async function interroger(nom, type) {
  switch (type) {
    case 'A': return resolveur.resolve4(nom);
    // On vérifie le type réel, pas seulement l'adresse au bout : un CNAME
    // remplacé par un A donnerait la même IP et passerait inaperçu.
    case 'CNAME': return resolveur.resolveCname(nom);
    case 'MX': return (await resolveur.resolveMx(nom)).map((m) => `${m.exchange} (prio ${m.priority})`);
    case 'TXT': return (await resolveur.resolveTxt(nom)).map((morceaux) => morceaux.join(''));
    case 'SRV': return (await resolveur.resolveSrv(nom)).map((s) => `${s.name}:${s.port} (prio ${s.priority}, poids ${s.weight})`);
    default: throw new Error(`type ${type} non géré`);
  }
}

const SYMBOLE = { ok: '  OK  ', ko: ' ÉCHEC', alerte: 'ALERTE' };

async function main() {
  const ip = await adresseDuServeur(SERVEUR);
  resolveur.setServers([ip]);
  const cible = ip === SERVEUR ? SERVEUR : `${SERVEUR} (${ip})`;
  console.log(`\nZone ${RACINE} — interrogée sur ${cible}`);
  console.log(`${ZONE.length} enregistrements attendus (9 A, 3 CNAME, 1 MX, 7 TXT, 5 SRV),`);
  console.log('plus un contrôle d’intégrité de la clé DKIM.');
  console.log('─'.repeat(78));
  let echecs = 0;
  let alertes = 0;

  for (const { nom, type, attendu, role } of ZONE) {
    let reponses = [];
    let erreur = null;
    try {
      reponses = await interroger(nom, type);
    } catch (e) {
      erreur = e.code || e.message;
    }

    const trouve = reponses.some((r) => String(r).includes(attendu));

    // Un enregistrement e-mail qui atterrit sur une IP Cloudflare = mail coupé.
    // Pour un CNAME ou un MX, l'IP est au bout de la cible : on la résout.
    let adresses = reponses;
    if (role.startsWith('E-MAIL') && (type === 'CNAME' || type === 'MX')) {
      const cible = String(reponses[0] || '').split(' ')[0];
      adresses = cible ? await resolveur.resolve4(cible).catch(() => []) : [];
    }
    const proxifie = role.startsWith('E-MAIL') && adresses.some((r) => estCloudflare(String(r)));

    const etat = proxifie ? 'alerte' : (trouve ? 'ok' : 'ko');
    if (etat === 'ko') echecs += 1;
    if (etat === 'alerte') alertes += 1;

    const valeur = erreur ? `pas de réponse (${erreur})` : (reponses.join(' | ') || '(aucune réponse)');
    console.log(`[${SYMBOLE[etat]}] ${type.padEnd(5)} ${nom.padEnd(38)} ${role}`);
    console.log(`           ${valeur.slice(0, 120)}${valeur.length > 120 ? '…' : ''}`);
    if (proxifie) console.log('           ⚠ IP Cloudflare sur un enregistrement e-mail : repasser cet hôte en DNS only (nuage gris).');
  }

  const dkim = (await interroger(`default._domainkey.${RACINE}`, 'TXT').catch(() => [])).join('');
  const dkimOk = dkim.includes(DKIM_DEBUT) && dkim.includes(DKIM_FIN);
  if (!dkimOk) echecs += 1;
  console.log(`[${SYMBOLE[dkimOk ? 'ok' : 'ko']}] ——  clé DKIM entière (contrôle d’intégrité, pas un 26e enregistrement)`);
  console.log(`           ${dkim ? `${dkim.length} caractères lus` : 'rien lu'}`);

  console.log('─'.repeat(78));
  if (echecs === 0 && alertes === 0) {
    console.log('Zone conforme : site et e-mail servis par o2switch.\n');
  } else {
    console.log(`${echecs} échec(s), ${alertes} alerte(s) — migration à ne pas considérer comme terminée.\n`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(`Vérification impossible : ${e.message}`);
  process.exitCode = 1;
});
