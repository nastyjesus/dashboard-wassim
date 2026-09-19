import { describe, it, expect } from 'vitest';
import { creneauxDuJour, verdictHoraire, libelleHoraires, jourDeGarde } from '../src/horaires.js';

// 2026-09-18 est un vendredi, 2026-09-19 un samedi, 2026-09-16 un mercredi.
const VENDREDI = '2026-09-18';
const SAMEDI = '2026-09-19';
const MERCREDI = '2026-09-16';

// Le cas réel qui a motivé le module : « Tout Petit Tu Lis ! » à La
// Guerche-de-Bretagne, deux créneaux un vendredi matin.
const toutPetitTuLis = {
  horaires: 'Vendredi 18 septembre, 09h30, 10h15',
  creneaux: [
    { debut: '2026-09-18T09:30:00+02:00', fin: '2026-09-18T10:15:00+02:00' },
    { debut: '2026-09-18T10:15:00+02:00', fin: '2026-09-18T11:00:00+02:00' },
  ],
};

describe('jourDeGarde', () => {
  it('lundi, mardi, jeudi, vendredi seulement', () => {
    expect(jourDeGarde(VENDREDI)).toBe(true);
    expect(jourDeGarde(SAMEDI)).toBe(false);
    expect(jourDeGarde(MERCREDI)).toBe(false);
    expect(jourDeGarde(null)).toBe(false);
  });
});

describe('creneauxDuJour', () => {
  it('lit les créneaux OpenAgenda du jour demandé, en heure locale', () => {
    const c = creneauxDuJour(toutPetitTuLis, VENDREDI);
    expect(c).toEqual([
      { debut: 9.5, fin: 10.25 },
      { debut: 10.25, fin: 11 },
    ]);
  });

  it('ignore les créneaux des autres jours', () => {
    expect(creneauxDuJour(toutPetitTuLis, SAMEDI)).toEqual([]);
  });

  it('se rabat sur le texte quand il n’y a pas de créneaux structurés', () => {
    expect(creneauxDuJour({ horaires: 'Vendredi 18 septembre, 09h30, 10h15' }, VENDREDI))
      .toEqual([{ debut: 9.5, fin: 10.5 }, { debut: 10.25, fin: 11.25 }]);
    expect(creneauxDuJour({ horaires: 'Samedi 10h-12h' }, SAMEDI))
      .toEqual([{ debut: 10, fin: 12 }]);
    expect(creneauxDuJour({ horaires: 'les dimanches de 14h à 17h' }, SAMEDI))
      .toEqual([{ debut: 14, fin: 17 }]);
  });

  it('rien d’exploitable → liste vide, pas d’erreur', () => {
    expect(creneauxDuJour({ horaires: 'Toute la journée' }, VENDREDI)).toEqual([]);
    expect(creneauxDuJour({}, VENDREDI)).toEqual([]);
  });
});

describe('verdictHoraire', () => {
  it('un vendredi matin en pleine journée de garde : « journee »', () => {
    expect(verdictHoraire(toutPetitTuLis, VENDREDI)).toBe('journee');
  });

  it('le même créneau un samedi ou un mercredi : pas de contrainte', () => {
    const samedi = { creneaux: [{ debut: '2026-09-19T09:30:00+02:00', fin: '2026-09-19T11:00:00+02:00' }] };
    const mercredi = { creneaux: [{ debut: '2026-09-16T09:30:00+02:00', fin: '2026-09-16T11:00:00+02:00' }] };
    expect(verdictHoraire(samedi, SAMEDI)).toBeNull();
    expect(verdictHoraire(mercredi, MERCREDI)).toBeNull();
  });

  it('un créneau à 17h un jeudi : « soir » (après l’école)', () => {
    const jeudi = { creneaux: [{ debut: '2026-09-17T17:00:00+02:00', fin: '2026-09-17T18:00:00+02:00' }] };
    expect(verdictHoraire(jeudi, '2026-09-17')).toBe('soir');
  });

  it('un créneau qui chevauche la sortie d’école (14h – 18h) : pas de malus', () => {
    const ev = { creneaux: [{ debut: '2026-09-18T14:00:00+02:00', fin: '2026-09-18T18:00:00+02:00' }] };
    expect(verdictHoraire(ev, VENDREDI)).toBeNull();
  });

  it('horaires inconnus : pas de contrainte', () => {
    expect(verdictHoraire({ horaires: null }, VENDREDI)).toBeNull();
  });

  it('tout commence à 19h30 ou après : « tard », même le week-end', () => {
    const chorale = { creneaux: [{ debut: '2026-09-19T20:00:00+02:00', fin: '2026-09-19T22:00:00+02:00' }] };
    expect(verdictHoraire(chorale, SAMEDI)).toBe('tard');
    const cours = { horaires: 'Mercredi 19h30 - 20h15' };
    expect(verdictHoraire(cours, MERCREDI)).toBe('tard');
    // Un créneau à 18h30 reste une sortie possible.
    const tot = { creneaux: [{ debut: '2026-09-19T18:30:00+02:00', fin: '2026-09-19T19:30:00+02:00' }] };
    expect(verdictHoraire(tot, SAMEDI)).toBeNull();
  });
});

describe('libelleHoraires', () => {
  it('deux créneaux : « 09h30 et 10h15 »', () => {
    expect(libelleHoraires(toutPetitTuLis, VENDREDI)).toBe('09h30 et 10h15');
  });

  it('un créneau long : plage « 10h – 18h »', () => {
    const ev = { creneaux: [{ debut: '2026-09-19T10:00:00+02:00', fin: '2026-09-19T18:00:00+02:00' }] };
    expect(libelleHoraires(ev, SAMEDI)).toBe('10h – 18h');
  });

  it('un créneau court : l’heure seule', () => {
    const ev = { creneaux: [{ debut: '2026-09-19T11:00:00+02:00', fin: '2026-09-19T11:45:00+02:00' }] };
    expect(libelleHoraires(ev, SAMEDI)).toBe('11h');
  });

  it('plus de trois créneaux : « dès 09h30 (5 créneaux) »', () => {
    const ev = { creneaux: [9.5, 10.5, 11.5, 14, 15].map((h) => ({
      debut: `2026-09-19T${String(Math.floor(h)).padStart(2, '0')}:${h % 1 ? '30' : '00'}:00+02:00`,
      fin: null,
    })) };
    expect(libelleHoraires(ev, SAMEDI)).toBe('dès 09h30 (5 créneaux)');
  });

  it('rien d’exploitable : null, l’appelant garde le texte brut', () => {
    expect(libelleHoraires({ horaires: 'Toute la journée' }, SAMEDI)).toBeNull();
  });
});
