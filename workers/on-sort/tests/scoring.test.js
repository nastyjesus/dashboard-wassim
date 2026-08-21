import { describe, it, expect } from 'vitest';
import { distanceKm, scorer, dedoublonner, top } from '../src/scoring.js';

const RENNES = { lat: 48.1173, lon: -1.6778 };
const CTX = { ...RENNES, age: 3, rayonKm: 40, meteo: null };

const atelier = (extra = {}) => ({
  source: 'test', id: 'a',
  titre: 'Atelier marionnettes jeune public',
  description: 'Pour les enfants de 3 à 6 ans. Gratuit.',
  motsCles: [], lieuNom: 'Médiathèque',
  lat: 48.11, lon: -1.68,
  ...extra,
});

describe('distanceKm', () => {
  it('Rennes → Bruz ≈ 12 km', () => {
    const d = distanceKm(RENNES.lat, RENNES.lon, 48.024, -1.745);
    expect(d).toBeGreaterThan(9);
    expect(d).toBeLessThan(15);
  });
});

describe('scorer', () => {
  it('score un événement famille proche avec raisons lisibles', () => {
    const s = scorer(atelier(), CTX);
    expect(s).not.toBeNull();
    expect(s.score).toBeGreaterThan(4);
    expect(s.raisons).toContain('Pensé pour les enfants');
    expect(s.raisons).toContain('Gratuit');
    expect(s.raisons.some((r) => r.includes('3-6 ans'))).toBe(true);
  });

  it('exclut quand l’enfant est trop jeune pour la tranche annoncée', () => {
    const s = scorer(atelier({ description: 'à partir de 8 ans' }), CTX);
    expect(s).toBeNull();
  });

  it('exclut au-delà du rayon', () => {
    // Nantes, ~100 km de Rennes
    const s = scorer(atelier({ lat: 47.218, lon: -1.553 }), CTX);
    expect(s).toBeNull();
  });

  it('exclut les événements anti-famille', () => {
    const s = scorer(atelier({ titre: 'Afterwork', description: 'public adulte' }), CTX);
    expect(s).toBeNull();
  });

  it('sous la pluie, l’intérieur gagne sur l’extérieur', () => {
    const pluie = { ...CTX, meteo: { pluie: true } };
    const dedans = scorer(atelier(), pluie);
    const dehors = scorer(atelier({ titre: 'Balade en famille plein air', description: 'dès 3 ans', lieuNom: 'Parc' }), pluie);
    expect(dedans.score).toBeGreaterThan(dehors.score);
    expect(dedans.raisons).toContain('À l’abri s’il pleut');
  });

  it('garde un événement sans coordonnées ni âge (pas d’info ≠ exclusion)', () => {
    const s = scorer(atelier({ lat: null, lon: null, description: 'Spectacle pour toute la famille' }), CTX);
    expect(s).not.toBeNull();
    expect(s.distanceKm).toBeNull();
  });
});

describe('dedoublonner', () => {
  it('fusionne le même événement venu de deux sources', () => {
    const a = atelier({ source: 'openagenda', dateDebut: '2026-08-22' });
    const b = atelier({ source: 'datatourisme', dateDebut: '2026-08-22', id: 'autre' });
    expect(dedoublonner([a, b])).toHaveLength(1);
  });

  it('garde deux dates différentes du même événement', () => {
    const a = atelier({ dateDebut: '2026-08-22' });
    const b = atelier({ dateDebut: '2026-08-29' });
    expect(dedoublonner([a, b])).toHaveLength(2);
  });
});

describe('top', () => {
  it('trie par score décroissant et limite à 5', () => {
    const evenements = Array.from({ length: 8 }, (_, i) => atelier({
      id: String(i),
      titre: `Atelier enfants n°${i}`,
      description: i % 2 ? 'Pour les enfants. Gratuit.' : 'atelier',
    }));
    const r = top(evenements, CTX);
    expect(r.top).toHaveLength(5);
    const scores = r.top.map((e) => e.score);
    expect([...scores].sort((x, y) => y - x)).toEqual(scores);
    expect(r.retenus).toBeGreaterThanOrEqual(5);
  });
});
