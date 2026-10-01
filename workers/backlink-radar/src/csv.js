// Lecteur CSV générique (RFC 4180) : BOM UTF-8, séparateur détecté sur la
// ligne d'en-tête (« , », « ; » ou tabulation), champs entre guillemets avec
// retours à la ligne et guillemets doublés. Il ne sait rien des formats
// Semrush / Ahrefs : c'est le rôle des parsers de src/imports.js.

const DELIMITERS = [',', ';', '\t'];

/** Compte un caractère hors guillemets sur la première ligne. */
function countOutsideQuotes(line, ch) {
  let n = 0;
  let quoted = false;
  for (const c of line) {
    if (c === '"') quoted = !quoted;
    else if (c === ch && !quoted) n += 1;
  }
  return n;
}

export function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  let best = ',';
  let bestCount = 0;
  for (const d of DELIMITERS) {
    const n = countOutsideQuotes(firstLine, d);
    if (n > bestCount) {
      best = d;
      bestCount = n;
    }
  }
  return best;
}

/**
 * @param {string} input
 * @returns {{ delimiter: string, headers: string[], rows: Record<string,string>[] }}
 */
export function parseCsv(input) {
  const text = String(input || '').replace(/^﻿/, '');
  const delimiter = detectDelimiter(text);
  const records = [];
  let field = '';
  let record = [];
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === delimiter) {
      record.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field !== '' || record.length) {
    record.push(field);
    records.push(record);
  }

  const nonEmpty = records.filter((r) => r.some((v) => v.trim() !== ''));
  if (!nonEmpty.length) return { delimiter, headers: [], rows: [] };
  const headers = nonEmpty[0].map((h) => h.trim());
  const rows = nonEmpty.slice(1).map((r) => {
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = (r[idx] ?? '').trim();
    });
    return row;
  });
  return { delimiter, headers, rows };
}
