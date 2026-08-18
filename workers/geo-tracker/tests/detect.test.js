import { describe, it, expect } from 'vitest';
import { hostOf, hostMatches, analyzeAnswer, summarize } from '../src/detect.js';

const CLIENT = { domain: 'acme.fr', aliases: ['ACME Conseil'] };

describe('hostOf / hostMatches', () => {
  it('extrait le hostname sans www', () => {
    expect(hostOf('https://www.acme.fr/page?x=1')).toBe('acme.fr');
    expect(hostOf('https://blog.acme.fr/article')).toBe('blog.acme.fr');
    expect(hostOf('pas une url')).toBe('');
  });

  it('matche le domaine exact et les sous-domaines, pas les look-alikes', () => {
    expect(hostMatches('acme.fr', 'acme.fr')).toBe(true);
    expect(hostMatches('blog.acme.fr', 'acme.fr')).toBe(true);
    expect(hostMatches('notacme.fr', 'acme.fr')).toBe(false);
    expect(hostMatches('acme.fr.evil.com', 'acme.fr')).toBe(false);
  });
});

describe('analyzeAnswer', () => {
  it('cité quand le domaine est dans les sources', () => {
    const r = analyzeAnswer(
      { text: 'Voici des références utiles.', sources: ['https://www.acme.fr/expertise', 'https://autre.com/a'] },
      CLIENT,
    );
    expect(r.cited).toBe(true);
    expect(r.mentioned).toBe(true); // cité implique mentionné
    expect(r.sourceDomains).toEqual(['acme.fr', 'autre.com']);
  });

  it('mentionné (sans citation) via le texte ou un alias', () => {
    const byDomain = analyzeAnswer({ text: 'Le site acme.fr propose…', sources: ['https://autre.com'] }, CLIENT);
    expect(byDomain.mentioned).toBe(true);
    expect(byDomain.cited).toBe(false);

    const byAlias = analyzeAnswer({ text: 'ACME Conseil est reconnu.', sources: [] }, CLIENT);
    expect(byAlias.mentioned).toBe(true);
    expect(byAlias.cited).toBe(false);
  });

  it('ni cité ni mentionné sinon', () => {
    const r = analyzeAnswer({ text: 'Rien à voir.', sources: ['https://autre.com'] }, CLIENT);
    expect(r.mentioned).toBe(false);
    expect(r.cited).toBe(false);
  });

  it('client sans site (fiche Google) : mention par alias, jamais cité', () => {
    const noSite = { aliases: ['Nicolas Fournials'] };
    const mention = analyzeAnswer(
      { text: 'Nicolas Fournials est un ostéopathe recommandé à Bruz.', sources: ['https://google.com/maps/x'] },
      noSite,
    );
    expect(mention.mentioned).toBe(true);
    expect(mention.cited).toBe(false);

    const silent = analyzeAnswer({ text: 'Autre réponse.', sources: [] }, noSite);
    expect(silent.mentioned).toBe(false);
  });
});

describe('summarize', () => {
  it('agrège taux, détail par moteur et concurrents', () => {
    const engines = {
      perplexity: {
        ok: true,
        results: [
          { mentioned: true, cited: true, sourceDomains: ['acme.fr', 'semrush.com'] },
          { mentioned: true, cited: false, sourceDomains: ['semrush.com'] },
        ],
      },
      gemini: {
        ok: true,
        results: [
          { mentioned: false, cited: false, sourceDomains: ['ahrefs.com', 'semrush.com'] },
          { mentioned: false, cited: false, sourceDomains: [] },
        ],
      },
      openai: { ok: false },
    };
    const s = summarize(engines, { domain: 'acme.fr' });
    expect(s.answers).toBe(4);
    expect(s.cited).toBe(1);
    expect(s.citationRate).toBe(25);
    expect(s.mentionRate).toBe(50);
    expect(s.perEngine.perplexity).toEqual({ ok: true, total: 2, cited: 1, mentioned: 2 });
    expect(s.perEngine.openai).toEqual({ ok: false });
    expect(s.topCompetitors[0]).toEqual({ domain: 'semrush.com', count: 3 });
    // le domaine du client n'apparaît jamais en concurrent
    expect(s.topCompetitors.find((c) => c.domain === 'acme.fr')).toBeUndefined();
  });

  it('taux à zéro sans réponse (pas de division par zéro)', () => {
    const s = summarize({ openai: { ok: false } }, { domain: 'acme.fr' });
    expect(s.answers).toBe(0);
    expect(s.citationRate).toBe(0);
  });
});
