// Vérification d'un lien obtenu (spec § 7) : la page répond-elle, contient-elle
// un lien vers le domaine du client, et ce lien est-il suivi (dofollow) ?
//
// Lecture du HTML par expressions régulières sur les balises <a> et <meta> :
// suffisant pour des attributs, et testable hors du runtime Workers (là où
// HTMLRewriter n'existe pas). Commentaires, <script> et <style> sont retirés
// avant l'analyse pour ne pas compter un lien mort dans du code.

import { belongsTo } from './domain.js';

export const RESULTS = ['live_dofollow', 'live_nofollow', 'missing', 'http_error', 'unverifiable'];
const NOFOLLOW_RELS = ['nofollow', 'sponsored', 'ugc'];
const USER_AGENT = 'BacklinkRadar/0.1 (+https://wassimloumicorporate.fr)';

/** Attributs d'une balise ouvrante, noms en minuscules. */
export function parseAttributes(tagInner) {
  const attrs = {};
  const re = /([^\s=/>"']+)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m;
  while ((m = re.exec(tagInner))) {
    const name = m[1].toLowerCase();
    if (!(name in attrs)) attrs[name] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return attrs;
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x2f;|&#47;/gi, '/');
}

function stripNonContent(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, '');
}

function hasNofollowDirective(value) {
  return /(^|[\s,:])(nofollow|none)([\s,]|$)/i.test(value || '');
}

/**
 * @param {string} html
 * @param {string} pageUrl     URL de la page (résolution des liens relatifs)
 * @param {string} clientDomain
 * @returns {{ links: {href:string, rel:string}[], pageNofollow: boolean, textLength: number, hasScripts: boolean }}
 */
export function analyzeHtml(html, pageUrl, clientDomain) {
  const source = String(html || '');
  const hasScripts = /<script\b/i.test(source);
  const clean = stripNonContent(source);
  const links = [];
  for (const m of clean.matchAll(/<a\b([^>]*)>/gi)) {
    const attrs = parseAttributes(m[1]);
    if (!attrs.href) continue;
    let url;
    try {
      url = new URL(attrs.href, pageUrl);
    } catch {
      continue;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') continue;
    if (belongsTo(url.hostname, clientDomain)) links.push({ href: url.href, rel: (attrs.rel || '').trim() });
  }
  let pageNofollow = false;
  for (const m of clean.matchAll(/<meta\b([^>]*)>/gi)) {
    const attrs = parseAttributes(m[1]);
    const name = (attrs.name || '').toLowerCase();
    if ((name === 'robots' || name === 'googlebot') && hasNofollowDirective(attrs.content)) pageNofollow = true;
  }
  const textLength = clean
    .replace(/<head\b[\s\S]*?<\/head\s*>/i, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim().length;
  return { links, pageNofollow, textLength, hasScripts };
}

function relIsNofollow(rel) {
  return rel.toLowerCase().split(/\s+/).some((t) => NOFOLLOW_RELS.includes(t));
}

/**
 * Classe une page déjà téléchargée.
 * @returns {{ result: string, rel: string|null, detail: string }}
 */
export function classify({ status, contentType, robotsHeader, html, pageUrl, clientDomain, blocked }) {
  if (blocked || status === 403 || status === 429) {
    return { result: 'unverifiable', rel: null, detail: `accès refusé au robot (HTTP ${status})` };
  }
  if (status >= 400) return { result: 'http_error', rel: null, detail: `HTTP ${status}` };
  if (contentType && !/html/i.test(contentType)) {
    return { result: 'unverifiable', rel: null, detail: `contenu non HTML (${contentType})` };
  }
  const a = analyzeHtml(html, pageUrl, clientDomain);
  const headerNofollow = hasNofollowDirective(robotsHeader);
  if (!a.links.length) {
    // Page quasi vide mais pleine de scripts : contenu rendu en JavaScript,
    // invisible sans navigateur. On ne conclut pas à un lien retiré.
    if (a.hasScripts && a.textLength < 200) {
      return { result: 'unverifiable', rel: null, detail: 'page rendue en JavaScript, lien invisible dans le HTML initial' };
    }
    return { result: 'missing', rel: null, detail: 'aucun lien vers le client dans la page' };
  }
  const followed = a.links.find((l) => !relIsNofollow(l.rel));
  if (followed && !a.pageNofollow && !headerNofollow) {
    return { result: 'live_dofollow', rel: followed.rel || null, detail: followed.href };
  }
  const why = a.pageNofollow ? 'meta robots nofollow'
    : headerNofollow ? 'en-tête X-Robots-Tag nofollow'
      : `rel="${a.links[0].rel}"`;
  return { result: 'live_nofollow', rel: (followed || a.links[0]).rel || null, detail: why };
}

/**
 * Télécharge la page et la classe. Une seule sous-requête (redirections
 * suivies par le runtime).
 */
export async function checkLink(linkUrl, clientDomain, fetchImpl = fetch) {
  let res;
  try {
    res = await fetchImpl(linkUrl, {
      redirect: 'follow',
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    return { http_status: null, result: 'http_error', rel: null, detail: `erreur réseau : ${String(e?.message || e).slice(0, 200)}` };
  }
  const status = res.status;
  const blocked = res.headers.get('cf-mitigated') === 'challenge';
  const html = status < 400 && !blocked ? await res.text() : '';
  const out = classify({
    status,
    contentType: res.headers.get('content-type'),
    robotsHeader: res.headers.get('x-robots-tag'),
    html,
    pageUrl: res.url || linkUrl,
    clientDomain,
    blocked,
  });
  return { http_status: status, ...out };
}

/** Deux échecs consécutifs (missing / http_error) → lien perdu. */
export function shouldMarkLost(lastResults) {
  const bad = ['missing', 'http_error'];
  return lastResults.length >= 2 && lastResults.slice(0, 2).every((r) => bad.includes(r));
}
