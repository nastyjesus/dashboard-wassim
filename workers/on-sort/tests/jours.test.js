import { describe, it, expect } from 'vitest';
import { joursMentionnes, jourCompatible, dureeJours } from '../src/jours.js';

// 2026-08-22 = samedi, 2026-08-23 = dimanche, 2026-08-24 = lundi.
const SAMEDI = '2026-08-22';
const DIMANCHE = '2026-08-23';
const LUNDI = '2026-08-24';

describe('jourCompatible — les cas réels du premier /top', () => {
  it('« les dimanches » n’est pas proposé un samedi (bug Troc Plantes)', () => {
    const ev = { horaires: '29 mars - 27 décembre, les dimanches' };
    expect(jourCompatible(ev, SAMEDI)).toBe(false);
    expect(jourCompatible(ev, DIMANCHE)).toBe(true);
  });

  it('« les mercredis » n’est pas proposé un samedi (bug Ferme de Quincé)', () => {
    const ev = {
      horaires: '28 janvier 2026 - 31 janvier 2029, les mercredis',
      description: 'Les portes de la ferme sont ouvertes tous les mercredis après-midi.',
    };
    expect(jourCompatible(ev, SAMEDI)).toBe(false);
  });

  it('« tous les jours » passe n’importe quel jour', () => {
    const ev = { horaires: '18 octobre 2025 - 26 août 2026', description: 'Tous les jours, les bibliothécaires…' };
    expect(jourCompatible(ev, SAMEDI)).toBe(true);
    expect(jourCompatible(ev, LUNDI)).toBe(true);
  });

  it('sans jour cité : pas de contrainte', () => {
    expect(jourCompatible({ horaires: '17 février - 28 août' }, SAMEDI)).toBe(true);
  });

  it('les horaires priment sur la description (« le jeudi soir » anecdotique)', () => {
    const ev = { horaires: 'Le samedi à 15h', description: 'passez le jeudi soir récupérer votre panier' };
    expect(jourCompatible(ev, SAMEDI)).toBe(true);
  });

  it('sans dateISO (tests du scoring seul) : pas de contrainte', () => {
    expect(jourCompatible({ horaires: 'les dimanches' }, undefined)).toBe(true);
  });

  it('avec des créneaux structurés, seuls les jours joués passent (bug Solo de danse)', () => {
    // Plage « 7 - 26 septembre », mais joué les 7, 8, 9 et 26 seulement.
    const ev = {
      horaires: '7 - 26 septembre',
      creneaux: [
        { debut: '2026-09-07T05:30:00+02:00', fin: '2026-09-07T09:00:00+02:00' },
        { debut: '2026-09-08T05:30:00+02:00', fin: '2026-09-08T09:00:00+02:00' },
        { debut: '2026-09-26T12:00:00+02:00', fin: '2026-09-26T12:20:00+02:00' },
      ],
    };
    expect(jourCompatible(ev, '2026-09-18')).toBe(false);
    expect(jourCompatible(ev, '2026-09-26')).toBe(true);
  });

  it('les créneaux priment sur le texte des jours', () => {
    // Le texte dit « les dimanches », mais un créneau existe bien ce samedi.
    const ev = {
      horaires: 'les dimanches',
      creneaux: [{ debut: '2026-08-22T15:00:00+02:00', fin: '2026-08-22T17:00:00+02:00' }],
    };
    expect(jourCompatible(ev, SAMEDI)).toBe(true);
  });

  it('une liste de créneaux vide ne contraint rien', () => {
    expect(jourCompatible({ horaires: '17 février - 28 août', creneaux: [] }, SAMEDI)).toBe(true);
  });
});

describe('joursMentionnes', () => {
  it('« du mardi au dimanche » couvre le samedi mais pas le lundi', () => {
    const jours = joursMentionnes('ouvert du mardi au dimanche');
    expect(jours.has(6)).toBe(true); // samedi
    expect(jours.has(0)).toBe(true); // dimanche
    expect(jours.has(1)).toBe(false); // lundi
  });

  it('« le week-end » = samedi + dimanche', () => {
    const jours = joursMentionnes('animations le week-end');
    expect(jours.has(6)).toBe(true);
    expect(jours.has(0)).toBe(true);
    expect(jours.size).toBe(2);
  });
});

describe('dureeJours', () => {
  it('mesure la plage et gère l’absence de dates', () => {
    expect(dureeJours({ dateDebut: '2026-08-22', dateFin: '2026-08-22' })).toBe(0);
    expect(dureeJours({ dateDebut: '2026-03-29', dateFin: '2026-12-27' })).toBeGreaterThan(90);
    expect(dureeJours({ dateDebut: '2026-08-22', dateFin: null })).toBeNull();
  });
});
