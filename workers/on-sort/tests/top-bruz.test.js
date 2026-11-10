// Cas réels : le top servi à Bruz (enfant de 3 ans) les 11, 14 et 15 novembre
// 2026 comptait 8 mauvaises sorties sur 15. Chacune est rejouée ici telle que
// les agendas l'ont fournie — le correctif doit tenir sur le vrai texte.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { evaluer, selectionner, SCORE_PLANCHER } from '../src/scoring.js';

const CAS = JSON.parse(readFileSync(new URL('./fixtures/top-bruz-2026-11.json', import.meta.url), 'utf8'));
const BRUZ = { lat: 48.024, lon: -1.745 };
const cas = (debutTitre) => CAS.find((e) => e.titre.startsWith(debutTitre));
const juger = (debutTitre, rayonKm = 40) => {
  const ev = cas(debutTitre);
  return evaluer(ev, { ...BRUZ, age: 3, rayonKm, dateISO: ev.date, meteo: null });
};

describe('top de Bruz, novembre 2026 — les mauvaises sorties', () => {
  it('« Âge minimal : 7 ans » écarte la sortie oiseaux pour un enfant de 3 ans', () => {
    expect(juger('À la découverte des oiseaux').exclu).toBe('trop-jeune');
  });

  it('un spectacle du 13 mai n’est pas proposé le 11 novembre', () => {
    expect(juger('Bob et Casquette').exclu).toBe('autre-date');
  });

  it('un temps « aux parents souhaitant… » n’est pas une sortie enfant', () => {
    expect(juger('Café Manette').exclu).toBe('anti-famille');
  });

  it('« une ambiance de fête foraine » ne fait pas une expo pour enfants', () => {
    expect(juger('Incroyable cerveau').exclu).toBeTruthy();
  });

  it('une course à pied est écartée', () => {
    expect(juger('Les Foulées').exclu).toBe('anti-famille');
  });

  it('La Gacilly : hors du rayon par défaut de 20 km', () => {
    expect(juger('Spectacle équestre', 20).exclu).toBe('hors-rayon');
    expect(juger('Le Père Noël', 20).exclu).toBe('hors-rayon');
  });

  it('La Gacilly à 40 km : loin et sans séance datée, sous le plancher du top', () => {
    for (const titre of ['Spectacle équestre', 'Le Père Noël']) {
      const r = juger(titre, 40);
      if (!r.exclu) {
        expect(r.score).toBeLessThan(SCORE_PLANCHER);
        expect(selectionner([r])).toEqual([]);
      }
    }
  });
});

describe('plancher du top', () => {
  const sortie = (score, extra = {}) => ({ titre: `s${score}`, description: '', score, dureeJours: 0, genre: 'autre', ...extra });

  it('ne remplit pas les cinq places avec des sorties faibles', () => {
    const t = selectionner([sortie(11), sortie(9), sortie(4.5), sortie(2.5)]);
    expect(t.map((e) => e.score)).toEqual([11, 9]);
  });

  it('garde une sortie épinglée ou ajoutée à la main, même faible', () => {
    const t = selectionner([sortie(9), sortie(2, { epingle: true }), sortie(3, { force: true })]);
    expect(t).toHaveLength(3);
  });

  it('plancher réglable par l’appelant', () => {
    expect(selectionner([sortie(3)], 5, 0)).toHaveLength(1);
  });
});

describe('retours « pas pour nous »', () => {
  function kvMemoire() {
    const m = new Map();
    return {
      put: async (cle, valeur, options = {}) => { m.set(cle, { valeur, metadata: options.metadata }); },
      list: async ({ prefix }) => ({
        keys: [...m.entries()].filter(([c]) => c.startsWith(prefix)).map(([name, v]) => ({ name, metadata: v.metadata })),
      }),
    };
  }

  it('range un retour valide et le rend, compté par motif', async () => {
    const { enregistrerRetour, listerRetours } = await import('../src/retours.js');
    const env = { VOTES: kvMemoire() };
    expect((await enregistrerRetour(env, { motif: 'loin', titre: 'Spectacle équestre', ville: 'Bruz', age: 3, km: 37.9, date: '2026-11-15' })).ok).toBe(true);
    expect((await enregistrerRetour(env, { motif: 'age', titre: 'Sortie oiseaux' })).ok).toBe(true);
    const r = await listerRetours(env);
    expect(r.total).toBe(2);
    expect(r.parMotif).toEqual({ loin: 1, age: 1 });
    expect(r.recents.find((x) => x.motif === 'loin')).toMatchObject({ ville: 'Bruz', age: 3, km: 37.9 });
  });

  it('refuse un motif inconnu ou un titre vide', async () => {
    const { enregistrerRetour } = await import('../src/retours.js');
    const env = { VOTES: kvMemoire() };
    expect((await enregistrerRetour(env, { motif: 'nul', titre: 'Sortie' })).ok).toBe(false);
    expect((await enregistrerRetour(env, { motif: 'loin', titre: '' })).ok).toBe(false);
  });
});
