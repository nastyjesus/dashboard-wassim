import { describe, it, expect } from 'vitest';
import { noterLieu, lieuxDuJour } from '../src/lieux.js';
import { LIEUX } from '../src/lieux-data.js';
import { selectionner } from '../src/scoring.js';

const BRUZ = { lat: 48.024, lon: -1.745 };
const CTX = { ...BRUZ, age: 3, rayonKm: 20, dateISO: '2026-11-14', meteo: { pluie: false } };

const parc = (extra = {}) => ({
  id: 'parc-test', titre: 'Parc test', description: 'Aire de jeux et pelouses.',
  ville: 'Bruz', adresse: '1 rue du Parc, 35170 Bruz', lat: 48.03, lon: -1.75,
  lieuType: 'exterieur', ageMin: null, ageMax: null, gratuit: true, fermeJours: [], saison: null,
  url: 'https://example.org/parc',
  ...extra,
});
const ludo = (extra = {}) => parc({ id: 'ludo-test', titre: 'Ludothèque test', lieuType: 'interieur', gratuit: null, ...extra });

describe('noterLieu', () => {
  it('note un parc proche par beau temps, avec des raisons lisibles', () => {
    const l = noterLieu(parc(), CTX);
    expect(l.genre).toBe('lieu');
    expect(l.permanent).toBe(true);
    expect(l.cle).toBe('lieux:parc-test');
    expect(l.raisons).toEqual(expect.arrayContaining(['Valeur sûre', 'Tout près', 'Profite du beau temps', 'Gratuit']));
    expect(l.score).toBeGreaterThanOrEqual(6);
  });

  it('écarte un lieu extérieur sous la pluie, garde l’intérieur', () => {
    const pluie = { ...CTX, meteo: { pluie: true } };
    expect(noterLieu(parc(), pluie)).toBeNull();
    expect(noterLieu(ludo(), pluie).raisons).toContain('À l’abri s’il pleut');
  });

  it('écarte hors rayon, hors âge, jour de fermeture, hors saison', () => {
    expect(noterLieu(parc({ lat: 48.65, lon: -2.02 }), CTX)).toBeNull(); // Saint-Malo
    expect(noterLieu(parc({ ageMin: 6 }), CTX)).toBeNull();
    expect(noterLieu(parc({ ageMax: 2 }), CTX)).toBeNull();
    expect(noterLieu(parc({ fermeJours: [6] }), CTX)).toBeNull(); // 14 nov. 2026 = samedi
    expect(noterLieu(parc({ saison: { debut: '04-01', fin: '10-31' } }), CTX)).toBeNull();
    expect(noterLieu(parc({ saison: { debut: '10-01', fin: '03-31' } }), CTX)).not.toBeNull();
  });

  it('affiche la tranche d’âge quand elle est connue', () => {
    expect(noterLieu(ludo({ ageMin: 0, ageMax: 6 }), CTX).raisons).toContain('0-6 ans');
  });

  it('même jour, même note (le cache de /top en dépend)', () => {
    expect(noterLieu(parc(), CTX).score).toBe(noterLieu(parc(), CTX).score);
  });
});

describe('lieux dans le top', () => {
  const evenement = (score, i) => ({ titre: `Événement ${i}`, description: '', score, dureeJours: 0, genre: 'autre' });
  const lieux = (n) => Array.from({ length: n }, (_, i) => noterLieu(parc({ id: `parc-${i}`, titre: `Parc ${i}` }), CTX));

  it('deux lieux au plus quand l’agenda a de quoi remplir', () => {
    const t = selectionner([...[12, 10, 9, 7, 6, 5.5].map(evenement), ...lieux(4)]);
    expect(t).toHaveLength(5);
    expect(t.filter((e) => e.genre === 'lieu')).toHaveLength(2);
  });

  it('les lieux complètent un agenda vide', () => {
    const t = selectionner([evenement(9, 0), ...lieux(6)]);
    expect(t).toHaveLength(5);
    expect(t.filter((e) => e.genre === 'lieu')).toHaveLength(4);
  });

  it('un bon événement du jour reste devant un lieu', () => {
    const t = selectionner([evenement(12, 0), ...lieux(1)]);
    expect(t[0].titre).toBe('Événement 0');
  });
});

describe('données des lieux', () => {
  it('chaque lieu est complet et cohérent', () => {
    const ids = new Set();
    for (const l of LIEUX) {
      expect(l.id, 'id').toMatch(/^[a-z0-9-]+$/);
      expect(ids.has(l.id), `doublon ${l.id}`).toBe(false);
      ids.add(l.id);
      expect(l.titre.length, l.id).toBeGreaterThan(2);
      expect(l.description.length, l.id).toBeGreaterThan(20);
      expect(['interieur', 'exterieur'], l.id).toContain(l.lieuType);
      // Ille-et-Vilaine : une coordonnée inversée ou tronquée se voit ici.
      expect(l.lat, l.id).toBeGreaterThan(47.6);
      expect(l.lat, l.id).toBeLessThan(48.75);
      expect(l.lon, l.id).toBeGreaterThan(-2.3);
      expect(l.lon, l.id).toBeLessThan(-1.0);
      expect(l.url, l.id).toMatch(/^https:\/\//);
      expect(Array.isArray(l.fermeJours), l.id).toBe(true);
    }
  });

  it('les lieux conviennent tous à au moins un jour de l’année pour un enfant de 3 ans à Rennes', () => {
    const rennes = { lat: 48.1173, lon: -1.6778, age: 3, rayonKm: 40, meteo: null };
    for (const l of LIEUX) {
      const jours = ['2026-07-14', '2026-07-15', '2026-01-14', '2026-01-17', '2026-01-18']
        .filter((dateISO) => lieuxDuJour([{ ...l, ageMin: null, ageMax: null }], { ...rennes, dateISO }).length);
      expect(jours.length, l.id).toBeGreaterThan(0);
    }
  });
});
