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
//
// Aucune dépendance : le résolveur DNS de Node, interrogé en direct (on ne
// passe pas par le cache du système, sinon on relit l'ancienne zone).

import { Resolver } from 'node:dns/promises';

const SERVEUR = process.argv[2] || '8.8.8.8';
const IP = '109.234.164.216';
const RACINE = 'papaparfait.fr';

const resolveur = new Resolver({ timeout: 5000, tries: 2 });
resolveur.setServers([SERVEUR]);

/** Hôtes servis par o2switch, en A direct. Aucun ne doit passer par Cloudflare. */
const HOTES_A = [
  'webmail', 'autodiscover', 'autoconfig', 'webdisk',
  'whm', 'cpanel', 'cpcontacts', 'cpcalendars',
];

/** La zone attendue. `attendu` est une sous-chaîne cherchée dans la réponse. */
const ZONE = [
  { nom: RACINE, type: 'A', attendu: IP, role: 'le site' },
  { nom: `www.${RACINE}`, type: 'A', attendu: IP, role: 'le site (www)' },
  ...HOTES_A.map((h) => ({ nom: `${h}.${RACINE}`, type: 'A', attendu: IP, role: 'service cPanel' })),
  { nom: `mail.${RACINE}`, type: 'A', attendu: IP, role: 'E-MAIL — doit rester sur o2switch' },
  { nom: RACINE, type: 'MX', attendu: RACINE, role: 'E-MAIL — la cible ne doit JAMAIS être proxifiée' },
  { nom: RACINE, type: 'TXT', attendu: 'v=spf1', role: 'E-MAIL — SPF' },
  { nom: `_dmarc.${RACINE}`, type: 'TXT', attendu: 'v=DMARC1', role: 'E-MAIL — DMARC' },
  { nom: `default._domainkey.${RACINE}`, type: 'TXT', attendu: 'v=DKIM1', role: 'E-MAIL — DKIM (sans lui : spam)' },
  { nom: `_caldavs._tcp.${RACINE}`, type: 'SRV', attendu: '2080', role: 'agenda (TLS)' },
  { nom: `_carddavs._tcp.${RACINE}`, type: 'SRV', attendu: '2080', role: 'contacts (TLS)' },
  { nom: `_caldav._tcp.${RACINE}`, type: 'SRV', attendu: '2079', role: 'agenda' },
  { nom: `_carddav._tcp.${RACINE}`, type: 'SRV', attendu: '2079', role: 'contacts' },
  { nom: `_autodiscover._tcp.${RACINE}`, type: 'SRV', attendu: 'cpanelemaildiscovery', role: 'config auto des clients mail' },
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
    case 'MX': return (await resolveur.resolveMx(nom)).map((m) => `${m.exchange} (prio ${m.priority})`);
    case 'TXT': return (await resolveur.resolveTxt(nom)).map((morceaux) => morceaux.join(''));
    case 'SRV': return (await resolveur.resolveSrv(nom)).map((s) => `${s.name}:${s.port} (prio ${s.priority}, poids ${s.weight})`);
    default: throw new Error(`type ${type} non géré`);
  }
}

const SYMBOLE = { ok: '  OK  ', ko: ' ÉCHEC', alerte: 'ALERTE' };

async function main() {
  console.log(`\nZone ${RACINE} — résolveur ${SERVEUR}\n${'─'.repeat(78)}`);
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
    const proxifie = role.startsWith('E-MAIL') && reponses.some((r) => estCloudflare(String(r)));

    const etat = proxifie ? 'alerte' : (trouve ? 'ok' : 'ko');
    if (etat === 'ko') echecs += 1;
    if (etat === 'alerte') alertes += 1;

    const valeur = erreur ? `pas de réponse (${erreur})` : (reponses.join(' | ') || '(aucune réponse)');
    console.log(`[${SYMBOLE[etat]}] ${type.padEnd(3)} ${nom.padEnd(38)} ${role}`);
    console.log(`           ${valeur.slice(0, 120)}${valeur.length > 120 ? '…' : ''}`);
    if (proxifie) console.log('           ⚠ IP Cloudflare sur un enregistrement e-mail : repasser cet hôte en DNS only (nuage gris).');
  }

  const dkim = (await interroger(`default._domainkey.${RACINE}`, 'TXT').catch(() => [])).join('');
  const dkimOk = dkim.includes(DKIM_DEBUT) && dkim.includes(DKIM_FIN);
  if (!dkimOk) echecs += 1;
  console.log(`[${SYMBOLE[dkimOk ? 'ok' : 'ko']}] TXT clé DKIM entière (début ET fin de la clé publique)`);
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
