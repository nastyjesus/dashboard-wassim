// Alerte du week-end — le vendredi, le top du samedi part par e-mail.
//
// C'est la deuxième raison de créer un compte (la première étant de retrouver
// ses sorties gardées ailleurs). Trois règles tenues ici :
//   1. opt-in strict — seul un papa qui a coché la case reçoit quoi que ce soit ;
//   2. silence si rien — pas d'e-mail « rien près de chez toi », c'est le
//      meilleur moyen de faire désabonner ;
//   3. désabonnement en un clic, sans mot de passe, depuis n'importe quel
//      e-mail reçu.
//
// Secrets attendus (Cloudflare → Worker → Settings → Variables, chiffrés) :
//   SUPABASE_URL          l'URL du projet Supabase
//   SUPABASE_SERVICE_KEY  la clé « service_role » (lit auth.users, écrit profils)
//   RESEND_KEY            la clé d'envoi Resend
// Sans eux, le cron ne fait rien et le dit dans les logs — il n'échoue pas.

import { villeParId } from './villes.js';

const EXPEDITEUR = 'Papa Parfait <bonjour@papaparfait.fr>';
const LIEN_APP = 'https://papa-parfait-web.loumiwassim.workers.dev';

/** Le samedi qui vient (ou aujourd'hui si on est samedi), en AAAA-MM-JJ. */
export function prochainSamedi(maintenant = new Date()) {
  const d = new Date(maintenant);
  d.setUTCDate(d.getUTCDate() + ((6 - d.getUTCDay() + 7) % 7));
  return d.toISOString().slice(0, 10);
}

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** « samedi 26 septembre » — pour l'objet et le corps de l'e-mail. */
export function libelleDate(dateISO) {
  const d = new Date(`${dateISO}T12:00:00Z`);
  return `${JOURS[d.getUTCDay()]} ${d.getUTCDate()} ${MOIS[d.getUTCMonth()]}`;
}

const labelAge = (a) => (a === 0 ? 'moins d’un an' : `${a} an${a > 1 ? 's' : ''}`);

/** Échappe le HTML : les titres viennent d'agendas publics, pas de nous. */
export function echapper(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * L'objet : concret et daté. Pas de « Votre newsletter » — on annonce ce qu'il
 * y a dedans, sinon personne n'ouvre.
 */
export function sujetAlerte(top, ville, dateISO) {
  const premier = top[0];
  const quand = libelleDate(dateISO);
  return top.length === 1
    ? `${quand} à ${ville.nom} : ${premier.titre}`
    : `${quand} à ${ville.nom} : ${top.length} sorties pour toi`;
}

/** Les détails d'une sortie sur une ligne : horaires, ville, distance. */
function details(ev) {
  return [ev.horaires, ev.ville, ev.distanceKm != null ? `${ev.distanceKm} km` : null]
    .filter(Boolean).join(' · ');
}

/** Une sortie du reste du top, en panneau numéroté (charte « Cockpit clair »). */
function ligneSortie(ev, rang) {
  const d = details(ev);
  return `
            <tr><td style="padding:14px 16px;border-top:2px solid #1B1815;">
              <div style="font:600 12px/14px 'Helvetica Neue',Arial,sans-serif;letter-spacing:.06em;color:#8B8375;">${String(rang).padStart(2, '0')}</div>
              <div style="font:700 16px/21px 'Helvetica Neue',Arial,sans-serif;color:#1B1815;margin-top:4px;">${echapper(ev.titre)}</div>
              ${d ? `<div style="font:400 14px/20px 'Helvetica Neue',Arial,sans-serif;color:#5C554B;margin-top:3px;">${echapper(d)}</div>` : ''}
            </td></tr>`;
}

/**
 * Le corps, en HTML et en texte. Charte « Cockpit clair » transposée à
 * l'e-mail : fond sable, panneau blanc cadré à l'encre, un seul accent ambre
 * sur le bouton. Tableaux et styles en ligne — les clients mail ne savent rien
 * faire d'autre.
 */
export function corpsAlerte({ prenom, top, ville, age, dateISO, lienDesabo }) {
  const quand = libelleDate(dateISO);
  // Abonné sans compte (concours) : âge inconnu, pas de pré-remplissage ni de libellé d'âge.
  const lienTop = `${LIEN_APP}/?ville=${encodeURIComponent(ville.id)}${age != null ? `&age=${age}` : ''}`;
  const entete = [quand, ville.nom, age != null ? labelAge(age) : null].filter(Boolean).join(' · ').toUpperCase();
  const bonjour = prenom ? `Salut ${prenom},` : 'Salut,';

  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#ECE6DA;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ECE6DA;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;">
        <tr><td style="background:#1B1815;padding:18px 20px;border-radius:10px;">
          <div style="font:800 30px/30px 'Helvetica Neue',Arial,sans-serif;color:#F4EFE6;letter-spacing:-.5px;">ON SORT ?</div>
          <div style="font:600 12px/14px 'Helvetica Neue',Arial,sans-serif;color:#FF8A00;letter-spacing:.08em;margin-top:6px;">${echapper(entete)}</div>
        </td></tr>

        <tr><td style="font:400 15px/23px 'Helvetica Neue',Arial,sans-serif;color:#5C554B;padding:18px 4px 6px;">
          ${echapper(bonjour)} voilà ce qui t’attend ${echapper(quand)} près de ${echapper(ville.nom)}.
        </td></tr>

        <tr><td>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBFAF7;border:2px solid #1B1815;border-radius:10px;border-collapse:separate;overflow:hidden;">
            <tr><td style="padding:14px 16px;background:#FF8A00;">
              <div style="font:600 12px/14px 'Helvetica Neue',Arial,sans-serif;letter-spacing:.08em;color:#1B1815;">STATUT : ON SORT</div>
              <div style="font:700 20px/25px 'Helvetica Neue',Arial,sans-serif;color:#1B1815;margin-top:5px;">${echapper(top[0].titre)}</div>
              ${top[0].horaires ? `<div style="font:400 14px/20px 'Helvetica Neue',Arial,sans-serif;color:#1B1815;margin-top:3px;">${echapper(top[0].horaires)}</div>` : ''}
            </td></tr>
            ${top.slice(1).map((ev, i) => ligneSortie(ev, i + 2)).join('')}
          </table>
        </td></tr>

        <tr><td align="left" style="padding:20px 4px;">
          <a href="${lienTop}" style="display:inline-block;background:#FF8A00;color:#1B1815;text-decoration:none;font:700 16px/1 'Helvetica Neue',Arial,sans-serif;padding:14px 22px;border:2px solid #1B1815;border-radius:999px;">Voir le top du jour</a>
        </td></tr>

        <tr><td style="font:400 12px/18px 'Helvetica Neue',Arial,sans-serif;color:#8B8375;padding:8px 4px 0;border-top:1px solid #D7CFC0;">
          Tu reçois cet e-mail parce que tu as demandé l’alerte du week-end dans Papa Parfait.
          <a href="${lienDesabo}" style="color:#8B8375;">Me désabonner en un clic</a> · Papa Parfait, édité par Wassim Loumi.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const texte = [
    `${bonjour}`,
    '',
    `Voilà ce qui t'attend ${quand} près de ${ville.nom} :`,
    '',
    ...top.map((ev, i) => {
      const d = details(ev);
      return `${i + 1}. ${ev.titre}${d ? `\n   ${d}` : ''}`;
    }),
    '',
    `Le top complet : ${lienTop}`,
    '',
    'Tu reçois cet e-mail parce que tu as demandé l’alerte du week-end.',
    `Me désabonner : ${lienDesabo}`,
  ].join('\n');

  return { html, texte };
}

/** Appelle notre propre /top : même scoring, même cache que l'app. */
async function topPour(base, ville, age, dateISO) {
  const url = `${base}/top?date=${dateISO}&lat=${ville.lat}&lon=${ville.lon}&age=${age}`
    + `&rayon=40&dept=${encodeURIComponent(ville.dept)}&code=${ville.code}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`/top a répondu ${res.status}`);
  const data = await res.json();
  return Array.isArray(data.top) ? data.top : [];
}

/** Les papas qui ont demandé l'alerte et qui n'ont rien reçu aujourd'hui. */
async function profilsAAlerter(env, jour) {
  const url = `${env.SUPABASE_URL}/rest/v1/profils`
    + '?select=id,prenom,age,ville_id,alerte_jeton,alerte_envoyee_le'
    + '&alerte_weekend=is.true'
    + `&or=(alerte_envoyee_le.is.null,alerte_envoyee_le.neq.${jour})`
    + '&limit=500';
  const res = await fetch(url, {
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` },
  });
  if (!res.ok) throw new Error(`profils : ${res.status}`);
  return res.json();
}

/** L'e-mail vit dans auth.users, pas dans profils : on le lit à l'unité. */
async function emailDuPapa(env, id) {
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${id}`, {
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` },
  });
  if (!res.ok) return null;
  const user = await res.json();
  return user?.email || null;
}

async function marquerEnvoye(env, id, jour) {
  await fetch(`${env.SUPABASE_URL}/rest/v1/profils?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ alerte_envoyee_le: jour }),
  });
}

export async function envoyerEmail(env, { to, subject, html, text, replyTo }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: EXPEDITEUR, to: [to], subject, html, text, ...(replyTo ? { reply_to: replyTo } : {}) }),
  });
  if (!res.ok) throw new Error(`Resend : ${res.status} ${(await res.text()).slice(0, 120)}`);
  return true;
}

/** Compteur d'usage — mêmes clés que /mesure (cpt:<jour>:<étape>). */
async function compter(env, evt, combien = 1) {
  if (!env.VOTES || combien <= 0) return;
  const cle = `cpt:${new Date().toISOString().slice(0, 10)}:${evt}`;
  const actuel = Number.parseInt((await env.VOTES.get(cle)) || '0', 10) || 0;
  await env.VOTES.put(cle, String(actuel + combien));
}

/**
 * Le travail du vendredi. Renvoie un résumé (lu dans les logs Cloudflare).
 * Ne jette jamais : une adresse en erreur ne doit pas priver les autres.
 */
export async function envoyerAlertes(env, maintenant = new Date()) {
  const manquants = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'RESEND_KEY'].filter((k) => !env[k]);
  // Sans Resend, rien ne part. Sans Supabase, seuls les abonnés sans compte
  // (KV, inscrits via un concours) sont servis.
  if (!env.RESEND_KEY) return { ignore: `secrets manquants : ${manquants.join(', ')}` };
  const avecComptes = Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY);

  const jour = maintenant.toISOString().slice(0, 10);
  const dateISO = prochainSamedi(maintenant);
  const base = env.BASE_URL || 'https://on-sort-poc.loumiwassim.workers.dev';

  let profils = [];
  if (avecComptes) {
    try {
      profils = await profilsAAlerter(env, jour);
    } catch (e) {
      return { erreur: String(e.message || e) };
    }
  }

  const resume = { destinataires: profils.length, envoyes: 0, silences: 0, erreurs: [] };
  const cacheTop = new Map(); // une requête /top par couple (ville, âge)

  for (const p of profils) {
    try {
      const ville = villeParId(p.ville_id);
      if (!ville) { resume.silences += 1; continue; } // zone fermée depuis l'inscription

      const cle = `${ville.id}:${p.age}`;
      if (!cacheTop.has(cle)) cacheTop.set(cle, await topPour(base, ville, p.age, dateISO));
      const top = (cacheTop.get(cle) || []).slice(0, 3);

      // Règle 2 : rien à proposer, rien à envoyer.
      if (top.length === 0) { resume.silences += 1; continue; }

      const email = await emailDuPapa(env, p.id);
      if (!email) { resume.silences += 1; continue; }

      const lienDesabo = `${base}/desabonnement?jeton=${p.alerte_jeton}`;
      const { html, texte } = corpsAlerte({
        prenom: p.prenom, top, ville, age: p.age, dateISO, lienDesabo,
      });
      await envoyerEmail(env, { to: email, subject: sujetAlerte(top, ville, dateISO), html, text: texte });
      await marquerEnvoye(env, p.id, jour);
      resume.envoyes += 1;
    } catch (e) {
      resume.erreurs.push(String(e.message || e).slice(0, 140));
    }
  }

  // Abonnés sans compte (KV) : même e-mail, âge inconnu → top d'un enfant de 3 ans.
  for (const a of await abonnesSansCompte(env, jour)) {
    resume.destinataires += 1;
    try {
      const ville = villeParId(a.villeId);
      if (!ville) { resume.silences += 1; continue; }
      const cle = `${ville.id}:${AGE_SANS_COMPTE}`;
      if (!cacheTop.has(cle)) cacheTop.set(cle, await topPour(base, ville, AGE_SANS_COMPTE, dateISO));
      const top = (cacheTop.get(cle) || []).slice(0, 3);
      if (top.length === 0) { resume.silences += 1; continue; }
      const lienDesabo = `${base}/desabonnement?jeton=${a.jeton}`;
      const { html, texte } = corpsAlerte({ prenom: a.prenom, top, ville, age: null, dateISO, lienDesabo });
      await envoyerEmail(env, { to: a.email, subject: sujetAlerte(top, ville, dateISO), html, text: texte });
      await env.VOTES.put(CLE_ABONNE + a.jeton, JSON.stringify({ ...a, envoyeLe: jour }));
      resume.envoyes += 1;
    } catch (e) {
      resume.erreurs.push(String(e.message || e).slice(0, 140));
    }
  }

  await compter(env, 'alerte-envoyee', resume.envoyes);
  return resume;
}

// ---------------------------------------------------------------------------
// Abonnés sans compte — inscrits en cochant « Recevoir l'alerte du week-end »
// en participant à un concours (src/concours.js). Une clé par abonné
// (alerte:abonne:<jeton>) et un index par e-mail pour ne pas inscrire deux fois.

const CLE_ABONNE = 'alerte:abonne:';
const CLE_ABONNE_EMAIL = 'alerte:email:';
const AGE_SANS_COMPTE = 3;

async function empreinte(texte) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texte));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

/** Inscrit (ou laisse inscrit) un abonné sans compte. Renvoie son jeton. */
export async function abonnerSansCompte(env, { email, prenom, villeId, source }) {
  if (!env.VOTES) return null;
  const cleEmail = CLE_ABONNE_EMAIL + await empreinte(email.trim().toLowerCase());
  const existant = await env.VOTES.get(cleEmail);
  if (existant) return existant;
  const jeton = crypto.randomUUID();
  await env.VOTES.put(CLE_ABONNE + jeton, JSON.stringify({
    jeton, email: email.trim().toLowerCase(), prenom: prenom || null, villeId, source: source || null,
    inscritLe: new Date().toISOString(), envoyeLe: null,
  }));
  await env.VOTES.put(cleEmail, jeton);
  return jeton;
}

async function abonnesSansCompte(env, jour) {
  if (!env.VOTES || typeof env.VOTES.list !== 'function') return [];
  const { keys } = await env.VOTES.list({ prefix: CLE_ABONNE, limit: 1000 });
  const abonnes = await Promise.all(keys.map((k) => env.VOTES.get(k.name, 'json')));
  return abonnes.filter((a) => a && a.envoyeLe !== jour);
}

/** Désabonnement d'un abonné sans compte : efface sa fiche et son index. */
async function desabonnerSansCompte(env, jeton) {
  if (!env.VOTES) return false;
  const a = await env.VOTES.get(CLE_ABONNE + jeton, 'json');
  if (!a) return false;
  await env.VOTES.delete(CLE_ABONNE + jeton);
  await env.VOTES.delete(CLE_ABONNE_EMAIL + await empreinte(a.email));
  return true;
}

/**
 * Désabonnement en un clic, sans mot de passe : le jeton du lien suffit.
 * Une page, pas un JSON — c'est un humain qui clique.
 */
export async function desabonner(env, jeton) {
  if (!/^[0-9a-f-]{36}$/i.test(jeton || '')) return { ok: false, motif: 'lien-invalide' };
  if (await desabonnerSansCompte(env, jeton)) return { ok: true };
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return { ok: false, motif: 'panne' };

  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/profils?alerte_jeton=eq.${jeton}`, {
    method: 'PATCH',
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ alerte_weekend: false }),
  });
  if (!res.ok) return { ok: false, motif: 'panne' };
  const lignes = await res.json();
  return { ok: Array.isArray(lignes) && lignes.length > 0, motif: 'lien-inconnu' };
}

/** La page rendue après un clic sur « me désabonner ». Charte, sobre, sans compte.
 *  Trois cas bien distincts : une panne de notre côté n'est pas un lien mort, et
 *  ne doit pas laisser croire au papa qu'il est désabonné alors qu'il ne l'est
 *  pas. Se désabonner doit toujours finir par marcher. */
const MESSAGES = {
  'lien-invalide': 'Ce lien est incomplet — il a sans doute été coupé par ton logiciel de messagerie. Réessaie en cliquant directement dans l’e-mail, ou réponds-y : on te désabonne à la main.',
  'lien-inconnu': 'Aucune inscription ne correspond à ce lien. Soit tu es déjà désabonné, soit le lien vient d’un très vieil e-mail. Si tu en reçois encore, réponds à l’un d’eux, on s’en occupe.',
  panne: 'Notre service ne répond pas à cet instant — tu n’es donc PAS désabonné. Réessaie dans quelques minutes, ou réponds à l’e-mail que tu as reçu : on le fera à la main.',
};

export function pageDesabonnement({ ok, motif }) {
  const titre = ok ? 'C’est fait.' : (motif === 'panne' ? 'Ça n’a pas marché.' : 'Rien à désabonner.');
  const texte = ok
    ? 'Tu ne recevras plus l’alerte du week-end. Tes sorties gardées et ton compte ne bougent pas — tu peux la réactiver quand tu veux depuis l’app.'
    : (MESSAGES[motif] || MESSAGES['lien-inconnu']);
  return `<!doctype html><html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Alerte du week-end — Papa Parfait</title>
<meta name="robots" content="noindex">
<style>
  body{margin:0;background:#ECE6DA;color:#1B1815;font:400 16px/24px 'Helvetica Neue',Arial,sans-serif;padding:40px 18px}
  .p{max-width:520px;margin:0 auto;background:#FBFAF7;border:2px solid #1B1815;border-radius:10px;padding:24px}
  h1{font-size:28px;line-height:32px;margin:0 0 10px}
  p{color:#5C554B;margin:0 0 14px}
  a{display:inline-block;background:#FF8A00;color:#1B1815;text-decoration:none;font-weight:700;padding:12px 20px;border:2px solid #1B1815;border-radius:999px}
</style></head>
<body><div class="p">
  <h1>${titre}</h1>
  <p>${texte}</p>
  <a href="${LIEN_APP}">Ouvrir Papa Parfait</a>
</div></body></html>`;
}
