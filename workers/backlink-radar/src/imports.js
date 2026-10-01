// Import des exports CSV (spec § 5).
//
// Chaque source (Semrush Backlink Gap, Ahrefs Link Intersect, …) est un parser
// de PARSERS : `detect(headers)` reconnaît le fichier à ses colonnes, `map(row)`
// en tire une opportunité. Les parsers sont écrits à partir d'un export RÉEL,
// conservé anonymisé en fixture de test — jamais d'après des noms de colonnes
// supposés. Tant qu'aucun n'est enregistré, tout fichier est refusé avec la
// liste des colonnes lues.

import { parseCsv } from './csv.js';
import { normalizeDomain } from './domain.js';

/**
 * @typedef {{ domain: string, sample_url?: string|null, semrush_as?: number|null,
 *             ahrefs_dr?: number|null, competitors_linked?: number|null,
 *             competitors_total?: number|null }} ImportedRecord
 * @typedef {{ source: string, method: string, label: string,
 *             detect: (headers: string[]) => boolean,
 *             map: (row: Record<string,string>, ctx: object) => ImportedRecord|null }} Parser
 */

/** @type {Parser[]} */
export const PARSERS = [];

/** Nombre tolérant : « 1 234 », « 12,5 », « 45% » ; vide ou « n/a » → null. */
export function toNumber(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/[\s %]/g, '').replace(',', '.');
  if (!s || !/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

/**
 * @param {string} text  contenu du fichier
 * @param {{ clientDomain: string, competitors: string[] }} ctx
 * @param {Parser[]} [parsers]
 */
export function importCsv(text, ctx, parsers = PARSERS) {
  const { headers, rows, delimiter } = parseCsv(text);
  const parser = parsers.find((p) => p.detect(headers));
  if (!parser) {
    return {
      error: 'unknown_format',
      message: 'Format de fichier non reconnu. Envoie cet export à Claude pour ajouter son parser.',
      headers,
      delimiter,
    };
  }
  const excluded = new Set([ctx.clientDomain, ...(ctx.competitors || [])].map(normalizeDomain).filter(Boolean));
  const byDomain = new Map();
  const skipped = [];
  rows.forEach((row, i) => {
    const line = i + 2;
    let rec;
    try {
      rec = parser.map(row, ctx);
    } catch (e) {
      skipped.push({ line, reason: `ligne illisible : ${e.message}` });
      return;
    }
    const domain = normalizeDomain(rec?.domain);
    if (!domain) return skipped.push({ line, reason: 'domaine absent ou invalide' });
    if (excluded.has(domain)) return skipped.push({ line, reason: 'domaine du client ou d\'un concurrent' });
    if (byDomain.has(domain)) return skipped.push({ line, reason: 'doublon dans le fichier' });
    byDomain.set(domain, { ...rec, domain });
  });
  return {
    source: parser.source,
    method: parser.method,
    rowCount: rows.length,
    records: [...byDomain.values()],
    skipped,
  };
}
