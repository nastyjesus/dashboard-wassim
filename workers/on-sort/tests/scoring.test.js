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

  it('exclut les événements emploi/pro même proches (cas réels remontés)', () => {
    const pro = (titre) => scorer({
      source: 'test', id: 'x', titre, description: '',
      lat: 48.11, lon: -1.68, dateDebut: '2026-08-22', dateFin: '2026-08-22',
    }, CTX);
    expect(pro('Rencontrez ACTUAL intérim !')).toBeNull();
    expect(pro('EMPLOIS RESERVISTES: cuisiner sur les bateaux de la Marine Nationale')).toBeNull();
    expect(pro('Emploi et Handicap : on vous accompagne')).toBeNull();
    expect(pro('Conseils pour bien se présenter, matinale des métiers du soin')).toBeNull();
  });

  it('exclut un événement neutre sans aucun signal enfant', () => {
    const s = scorer({
      source: 'test', id: 'n', titre: 'Réunion publique de quartier', description: 'ordre du jour',
      lat: 48.11, lon: -1.68, dateDebut: '2026-08-22', dateFin: '2026-08-22',
    }, CTX);
    expect(s).toBeNull();
  });

  it('sous la pluie, l’intérieur gagne sur l’extérieur', () => {
    const pluie = { ...CTX, meteo: { pluie: true } };
    const dedans = scorer(atelier(), pluie);
    const dehors = scorer(atelier({ titre: 'Balade en famille plein air', description: 'dès 3 ans', lieuNom: 'Parc' }), pluie);
    expect(dedans.score).toBeGreaterThan(dehors.score);
    expect(dedans.raisons).toContain('À l’abri s’il pleut');
  });

  it('exclut un récurrent qui n’a pas lieu le jour demandé', () => {
    // 2026-08-22 est un samedi ; l'événement n'a lieu que le dimanche.
    const s = scorer(atelier({ horaires: 'les dimanches de 14h à 17h' }), { ...CTX, dateISO: '2026-08-22' });
    expect(s).toBeNull();
  });

  it('un événement ponctuel passe devant l’animation permanente équivalente', () => {
    const ponctuel = scorer(atelier({ dateDebut: '2026-08-22', dateFin: '2026-08-22' }), CTX);
    const permanent = scorer(atelier({ dateDebut: '2026-01-01', dateFin: '2026-12-31' }), CTX);
    expect(ponctuel.score).toBeGreaterThan(permanent.score);
    expect(ponctuel.raisons).toContain('Événement ponctuel');
  });

  it('exclut une animation au long cours qui n’est pas explicitement jeune public', () => {
    // Expo d'art « tout public » de 6 mois : un seul signal famille faible.
    const s = scorer(atelier({
      titre: 'Exposition de peinture contemporaine',
      description: 'Atelier de médiation le mercredi.',
      dateDebut: '2026-06-01', dateFin: '2026-12-20',
    }), CTX);
    expect(s).toBeNull();
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

describe('scorer — distance et heure (cas réel du 18 septembre 2026)', () => {
  // Depuis Bruz (48.024, -1.745), un vendredi. Le GO était parti à
  // La Guerche-de-Bretagne (39,3 km, 09h30) devant Rennes (10,4 km).
  const BRUZ = { lat: 48.024, lon: -1.745, age: 3, rayonKm: 40, meteo: null };
  const VENDREDI = '2026-09-18';

  const toutPetitTuLis = {
    source: 'openagenda', id: 'tptl',
    titre: 'Tout Petit Tu Lis ! : « Au feu, les pompiers ! » (0-3 ans)',
    description: 'Lecture pour les tout-petits de 0 à 3 ans.',
    dateDebut: '2026-09-18', dateFin: '2026-09-18',
    horaires: 'Vendredi 18 septembre, 09h30, 10h15',
    creneaux: [
      { debut: '2026-09-18T09:30:00+02:00', fin: '2026-09-18T10:15:00+02:00' },
      { debut: '2026-09-18T10:15:00+02:00', fin: '2026-09-18T11:00:00+02:00' },
    ],
    lat: 47.94, lon: -1.23, // La Guerche-de-Bretagne, ~39 km
  };
  const spationaute = {
    source: 'openagenda', id: 'spatio',
    titre: 'Le petit spationaute',
    description: 'Parcours pour les enfants de 0 à 3 ans.',
    dateDebut: '2026-09-01', dateFin: '2026-10-31',
    horaires: 'Du mardi au dimanche, 10h - 18h',
    lat: 48.11, lon: -1.68, // Rennes, ~10 km
  };

  it('le proche gagne : 10 km bat 39 km même face à un ponctuel', () => {
    const loin = scorer(toutPetitTuLis, { ...BRUZ, dateISO: VENDREDI });
    const pres = scorer(spationaute, { ...BRUZ, dateISO: VENDREDI });
    expect(loin).not.toBeNull(); // toujours proposé, mais plus en GO
    expect(pres.score).toBeGreaterThan(loin.score);
    expect(pres.raisons).toContain('Tout près');
  });

  it('un vendredi matin en journée de garde coûte 3 points ; le samedi non', () => {
    const vendredi = scorer(toutPetitTuLis, { ...BRUZ, dateISO: VENDREDI });
    const samedi = scorer({
      ...toutPetitTuLis,
      dateDebut: '2026-09-19', dateFin: '2026-09-19',
      horaires: 'Samedi 19 septembre, 09h30, 10h15',
      creneaux: toutPetitTuLis.creneaux.map((c) => ({ debut: c.debut.replace('-18T', '-19T'), fin: c.fin.replace('-18T', '-19T') })),
    }, { ...BRUZ, dateISO: '2026-09-19' });
    expect(samedi.score - vendredi.score).toBeCloseTo(3, 5);
  });

  it('un créneau après l’école en semaine gagne « Après l’école »', () => {
    const s = scorer(atelier({
      dateDebut: '2026-09-18', dateFin: '2026-09-18',
      creneaux: [{ debut: '2026-09-18T17:00:00+02:00', fin: '2026-09-18T18:00:00+02:00' }],
    }), { ...CTX, dateISO: VENDREDI });
    expect(s.raisons).toContain('Après l’école');
  });

  it('l’étiquette dit ce qu’on sait : « Pensé pour » vs « Ouvert aux enfants »', () => {
    const pense = scorer(atelier(), CTX); // marionnettes + tranche d'âge
    expect(pense.raisons).toContain('Pensé pour les enfants');
    const ouvert = scorer({
      source: 'test', id: 's', titre: 'Solo de danse afro-contemporaine',
      description: 'Accessible à toutes et tous, enfants et parents.',
      lat: 48.11, lon: -1.68, dateDebut: '2026-09-26', dateFin: '2026-09-26',
    }, { ...CTX, dateISO: '2026-09-26' });
    expect(ouvert.raisons).toContain('Ouvert aux enfants');
    expect(ouvert.raisons).not.toContain('Pensé pour les enfants');
  });

  it('tout commence après 19h30 : −3, même un samedi', () => {
    const jour = scorer(atelier({
      dateDebut: '2026-09-19', dateFin: '2026-09-19',
      creneaux: [{ debut: '2026-09-19T15:00:00+02:00', fin: '2026-09-19T16:00:00+02:00' }],
    }), { ...CTX, dateISO: '2026-09-19' });
    const tard = scorer(atelier({
      dateDebut: '2026-09-19', dateFin: '2026-09-19',
      creneaux: [{ debut: '2026-09-19T20:00:00+02:00', fin: '2026-09-19T21:30:00+02:00' }],
    }), { ...CTX, dateISO: '2026-09-19' });
    expect(jour.score - tard.score).toBeCloseTo(3, 5);
  });

  it('les horaires ressortent lisibles, le texte brut en secours', () => {
    const s = scorer(toutPetitTuLis, { ...BRUZ, dateISO: VENDREDI });
    expect(s.horaires).toBe('09h30 et 10h15');
    const brut = scorer(atelier({ horaires: 'Toute la journée' }), { ...CTX, dateISO: '2026-09-19' });
    expect(brut.horaires).toBe('Toute la journée');
  });
});

describe('top', () => {
  it('jamais plus de 2 animations permanentes dans le top 5', () => {
    // 5 expos jeune public permanentes très bien scorées + 3 ponctuels.
    const permanents = Array.from({ length: 5 }, (_, i) => atelier({
      id: `perm-${i}`, titre: `Expo jeune public n°${i}`,
      description: 'Parcours pour les enfants de 3 à 6 ans. Gratuit.',
      dateDebut: '2026-01-01', dateFin: '2026-12-31',
    }));
    const ponctuels = Array.from({ length: 3 }, (_, i) => atelier({
      id: `ponc-${i}`, titre: `Atelier enfants du jour n°${i}`,
      description: 'atelier pour les enfants',
      dateDebut: '2026-08-29', dateFin: '2026-08-29',
    }));
    const r = top([...permanents, ...ponctuels], CTX);
    const nbPermanents = r.top.filter((e) => e.dureeJours > 90).length;
    expect(r.top).toHaveLength(5);
    expect(nbPermanents).toBeLessThanOrEqual(2);
    expect(r.top.filter((e) => e.id.startsWith('ponc-'))).toHaveLength(3);
  });

  it('trie par score décroissant et limite à 5', () => {
    const evenements = Array.from({ length: 8 }, (_, i) => atelier({
      id: String(i),
      titre: `Atelier enfants n°${i}`,
      description: i % 2 ? 'Pour les enfants. Gratuit.' : 'atelier dès 3 ans',
    }));
    const r = top(evenements, CTX);
    expect(r.top).toHaveLength(5);
    const scores = r.top.map((e) => e.score);
    expect([...scores].sort((x, y) => y - x)).toEqual(scores);
    expect(r.retenus).toBeGreaterThanOrEqual(5);
  });
});
