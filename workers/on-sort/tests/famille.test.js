import { describe, it, expect } from 'vitest';
import { scoreFamille, trancheAge, lieuType } from '../src/famille.js';

describe('scoreFamille', () => {
  it('score fort quand l’événement est explicitement jeune public', () => {
    expect(scoreFamille({ titre: 'Spectacle jeune public', description: 'contes pour enfants' })).toBe(3);
  });

  it('score moyen sur un seul mot-clé fort', () => {
    expect(scoreFamille({ titre: 'Atelier famille', description: 'peinture' })).toBe(2);
  });

  it('score faible sur mots-clés indirects', () => {
    expect(scoreFamille({ titre: 'Atelier nature', description: 'jeux autour des plantes' })).toBe(1);
  });

  it('exclut les événements clairement adultes', () => {
    expect(scoreFamille({ titre: 'Dégustation de vin', description: 'public adulte' })).toBe(-1);
  });

  it('0 quand rien n’indique une sortie famille', () => {
    expect(scoreFamille({ titre: 'Réunion du conseil municipal', description: '' })).toBe(0);
  });

  it('matche par mot entier : « contemporaine » ≠ « conte », « réveil » ≠ « éveil »', () => {
    expect(scoreFamille({ titre: 'Exposition d’art contemporain', description: 'peinture contemporaine' })).toBe(0);
    expect(scoreFamille({ titre: 'Réveil musculaire des seniors', description: '' })).toBe(0);
    // …mais le vrai mot compte toujours.
    expect(scoreFamille({ titre: 'Conte et comptines', description: '' })).toBe(3);
  });
});

describe('trancheAge', () => {
  it('lit « de 3 à 6 ans »', () => {
    expect(trancheAge({ titre: '', description: 'atelier de 3 à 6 ans' })).toEqual({ min: 3, max: 6 });
  });

  it('lit « dès 4 ans » (non borné)', () => {
    expect(trancheAge({ titre: 'Ciné dès 4 ans', description: '' })).toEqual({ min: 4, max: null });
  });

  it('convertit les mois en années', () => {
    expect(trancheAge({ titre: '', description: 'à partir de 18 mois' })).toEqual({ min: 1, max: null });
  });

  it('reconnaît les tout-petits', () => {
    expect(trancheAge({ titre: 'Éveil des tout-petits', description: '' })).toEqual({ min: 0, max: 3 });
  });

  it('null sans indication', () => {
    expect(trancheAge({ titre: 'Concert', description: 'du groupe X' })).toBeNull();
  });
});

describe('lieuType', () => {
  it('détecte l’intérieur', () => {
    expect(lieuType({ titre: 'Heure du conte', lieuNom: 'Médiathèque de Bruz' })).toBe('interieur');
  });

  it('détecte l’extérieur', () => {
    expect(lieuType({ titre: 'Balade en forêt', description: 'sortie plein air' })).toBe('exterieur');
  });

  it('inconnu sinon', () => {
    expect(lieuType({ titre: 'Rencontre', description: '' })).toBe('inconnu');
  });
});
