// Tests des modules purs : domaines, CSV, score, pipeline, import.
import { describe, it, expect } from 'vitest';
import { normalizeDomain, belongsTo, slugify } from '../src/domain.js';
import { parseCsv, detectDelimiter } from '../src/csv.js';
import { computeScore, validateWeights } from '../src/score.js';
import { planTransition, canTransition, addDays } from '../src/pipeline.js';
import { importCsv, toNumber } from '../src/imports.js';

describe('normalizeDomain', () => {
  it.each([
    ['https://www.Exemple.fr/page?x=1', 'exemple.fr'],
    ['exemple.fr', 'exemple.fr'],
    ['WWW.exemple.fr.', 'exemple.fr'],
    ['http://blog.exemple.fr:8080/', 'blog.exemple.fr'],
    ['  exemple.co.uk  ', 'exemple.co.uk'],
  ])('%s → %s', (input, out) => expect(normalizeDomain(input)).toBe(out));

  it.each([null, '', 'localhost', 'pas un domaine', 'http://'])('refuse %s', (input) => {
    expect(normalizeDomain(input)).toBeNull();
  });

  it('rattache les sous-domaines au client', () => {
    expect(belongsTo('blog.client.fr', 'client.fr')).toBe(true);
    expect(belongsTo('www.client.fr', 'https://client.fr')).toBe(true);
    expect(belongsTo('fauxclient.fr', 'client.fr')).toBe(false);
  });

  it('slugify', () => expect(slugify('Cabinet Dupont & Fils — Rennes')).toBe('cabinet-dupont-fils-rennes'));
});

describe('parseCsv', () => {
  it('gère BOM, point-virgule, guillemets et retours à la ligne', () => {
    const csv = '﻿Domaine;Note;Commentaire\r\nexemple.fr;12,5;"avec ; et ""guillemets"""\r\nautre.fr;3;"sur\ndeux lignes"\r\n\r\n';
    const { delimiter, headers, rows } = parseCsv(csv);
    expect(delimiter).toBe(';');
    expect(headers).toEqual(['Domaine', 'Note', 'Commentaire']);
    expect(rows).toHaveLength(2);
    expect(rows[0].Commentaire).toBe('avec ; et "guillemets"');
    expect(rows[1].Commentaire).toBe('sur\ndeux lignes');
  });

  it('détecte la virgule et la tabulation', () => {
    expect(detectDelimiter('a,b,c\n1,2,3')).toBe(',');
    expect(detectDelimiter('a\tb\tc')).toBe('\t');
    expect(detectDelimiter('"a;b",c,d')).toBe(',');
  });

  it('fichier vide', () => expect(parseCsv('')).toMatchObject({ headers: [], rows: [] }));
});

describe('computeScore', () => {
  it('moyenne pondérée des composantes connues', () => {
    const { score, detail } = computeScore({ semrush_as: 40, competitors_linked: 3, competitors_total: 4 });
    expect(score).toBe(57.5); // (0.40 + 0.75) / 2
    expect(detail.components.authority).toMatchObject({ raw: 40, source: 'semrush' });
  });

  it('exclut une composante inconnue au lieu de compter zéro', () => {
    const { score, detail } = computeScore({ semrush_as: null, competitors_linked: 1, competitors_total: 2 });
    expect(score).toBe(50);
    expect(detail.components.authority.missing).toBe(true);
  });

  it('ne se replie pas sur l\'autre échelle d\'autorité', () => {
    const { detail } = computeScore({ ahrefs_dr: 70 }, { authoritySource: 'semrush' });
    expect(detail.components.authority.missing).toBe(true);
    expect(computeScore({ ahrefs_dr: 70 }, { authoritySource: 'ahrefs' }).score).toBe(70);
  });

  it('score null sans aucune donnée', () => {
    expect(computeScore({}).score).toBeNull();
    expect(computeScore({ competitors_linked: 1, competitors_total: 0 }).score).toBeNull();
  });

  it('respecte la pondération', () => {
    const opp = { semrush_as: 100, competitors_linked: 0, competitors_total: 4 };
    expect(computeScore(opp, { weights: { authority: 3, ease: 1 } }).score).toBe(75);
    expect(computeScore(opp, { weights: { authority: 0, ease: 1 } }).score).toBe(0);
  });

  it('valide les poids', () => {
    expect(validateWeights({ authority: 2 })).toEqual({ authority: 2 });
    expect(validateWeights({ authority: -1 })).toBeNull();
    expect(validateWeights({ inconnu: 1 })).toBeNull();
    expect(validateWeights([1])).toBeNull();
  });
});

describe('pipeline', () => {
  const now = new Date('2026-10-01T10:00:00Z');

  it('transitions autorisées et interdites', () => {
    expect(canTransition('a_contacter', 'contacte')).toBe(true);
    expect(canTransition('a_contacter', 'relance')).toBe(false);
    expect(canTransition('obtenu', 'contacte')).toBe(false);
    expect(planTransition({ status: 'obtenu' }, 'a_contacter').error).toMatch(/interdite/);
    expect(planTransition({ status: 'a_contacter' }, 'nimporte').error).toMatch(/inconnu/);
  });

  it('relance par défaut à J+7', () => {
    expect(addDays(now, 7)).toBe('2026-10-08');
    expect(planTransition({ status: 'a_contacter' }, 'contacte', {}, now).fields)
      .toEqual({ status: 'contacte', next_followup_at: '2026-10-08' });
    expect(planTransition({ status: 'contacte' }, 'relance', { next_followup_at: '2026-10-20' }, now).fields.next_followup_at)
      .toBe('2026-10-20');
    expect(planTransition({ status: 'contacte' }, 'relance', { next_followup_at: '20/10' }, now).error).toBeTruthy();
  });

  it('« obtenu » exige une URL de lien', () => {
    expect(planTransition({ status: 'contacte' }, 'obtenu', {}).error).toMatch(/link_url/);
    expect(planTransition({ status: 'contacte' }, 'obtenu', { link_url: 'javascript:alert(1)' }).error).toBeTruthy();
    expect(planTransition({ status: 'contacte' }, 'obtenu', { link_url: 'https://site.fr/p' }).fields)
      .toEqual({ status: 'obtenu', next_followup_at: null, link_url: 'https://site.fr/p' });
  });
});

describe('importCsv', () => {
  // Parser factice : les vrais parsers Semrush / Ahrefs seront écrits à partir
  // d'exports réels. Ici on teste la mécanique commune (détection, exclusions,
  // doublons).
  const fakeParser = {
    source: 'test_source',
    method: 'link_gap',
    detect: (h) => h.includes('Domaine test') && h.includes('Score test'),
    map: (row) => ({ domain: row['Domaine test'], semrush_as: toNumber(row['Score test']) }),
  };
  const ctx = { clientDomain: 'client.fr', competitors: ['concurrent.fr'] };

  it('refuse un format inconnu en listant les colonnes lues', () => {
    const out = importCsv('Colonne A,Colonne B\n1,2', ctx, [fakeParser]);
    expect(out.error).toBe('unknown_format');
    expect(out.headers).toEqual(['Colonne A', 'Colonne B']);
  });

  it('aucun parser enregistré → tout fichier refusé', () => {
    expect(importCsv('Domaine test,Score test\na.fr,1', ctx).error).toBe('unknown_format');
  });

  it('normalise, exclut client et concurrents, dédoublonne', () => {
    const csv = [
      'Domaine test,Score test',
      'https://www.A.fr/x,45',
      'a.fr,50',
      'client.fr,90',
      'www.concurrent.fr,80',
      ',12',
      'b.fr,n/a',
    ].join('\n');
    const out = importCsv(csv, ctx, [fakeParser]);
    expect(out.source).toBe('test_source');
    expect(out.rowCount).toBe(6);
    expect(out.records).toEqual([
      { domain: 'a.fr', semrush_as: 45 },
      { domain: 'b.fr', semrush_as: null },
    ]);
    expect(out.skipped.map((s) => s.reason)).toEqual([
      'doublon dans le fichier',
      "domaine du client ou d'un concurrent",
      "domaine du client ou d'un concurrent",
      'domaine absent ou invalide',
    ]);
  });

  it('toNumber', () => {
    expect(toNumber('1 234')).toBe(1234);
    expect(toNumber('12,5')).toBe(12.5);
    expect(toNumber('45%')).toBe(45);
    expect(toNumber('n/a')).toBeNull();
    expect(toNumber('')).toBeNull();
  });
});
