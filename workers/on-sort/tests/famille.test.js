import { describe, it, expect } from 'vitest';
import { scoreFamille, analyseFamille, trancheAge, lieuType } from '../src/famille.js';

describe('scoreFamille', () => {
  it('score fort quand l’événement est explicitement jeune public', () => {
    expect(scoreFamille({ titre: 'Spectacle jeune public', description: 'contes pour enfants' })).toBe(3);
  });

  it('score moyen sur un seul mot-clé fort spécifique', () => {
    expect(scoreFamille({ titre: 'Atelier marionnettes', description: 'peinture' })).toBe(2);
  });

  it('un mot générique compte quand un public est nommé', () => {
    expect(scoreFamille({ titre: 'Atelier famille', description: 'peinture en famille' })).toBe(2);
    expect(scoreFamille({ titre: 'Atelier', description: 'pour les enfants dès 4 ans' })).toBe(2);
  });

  it('score faible sur mots-clés indirects, si un public enfant est nommé', () => {
    expect(scoreFamille({ titre: 'Atelier nature', description: 'jeux autour des plantes, petits et grands' })).toBe(1);
    // Sans public nommé, deux mots faibles = un atelier adulte (bricolage, jardin).
    expect(scoreFamille({ titre: 'Atelier nature', description: 'jeux autour des plantes' })).toBe(0.5);
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

describe('scoreFamille — les faux positifs du corpus du 19 septembre 2026', () => {
  it('« enfants » comme sujet, pas comme public : un thème, pas une sortie', () => {
    // Pièce sur la filiation, chorégraphie « d’un essaim d’enfants », synopsis « 2 enfants ».
    expect(scoreFamille({ titre: 'Les mains de ma mère', description: 'Une histoire de filiation entre une mère et sa fille.' })).toBe(0);
    expect(scoreFamille({ titre: 'Nahl', description: 'La chorégraphie d’un essaim d’enfants au Panthéon.' })).toBe(0.5);
    expect(scoreFamille({ titre: 'Scènes de la vie conjugale', description: '10 ans de mariage, 2 enfants, une belle maison.' })).toBe(0.5);
  });

  it('…mais le même mot compte dès que le public est nommé', () => {
    expect(scoreFamille({ titre: 'Bulles sonores', description: 'Une invitation pour vous, les parents et enfants !' })).toBe(2);
    expect(scoreFamille({ titre: 'Fouilles', description: 'Les enfants partent à la recherche des trésors.' })).toBe(2);
    expect(scoreFamille({ titre: 'Marque-page', description: 'Viens fabriquer ton marque-page.' })).toBe(0); // tutoiement seul ne suffit pas
    expect(scoreFamille({ titre: 'Atelier créatif Marque-page', description: 'Viens fabriquer ton marque-page ludique.' })).toBe(1);
  });

  it('réservé aux adultes ou aux parents seuls : exclu', () => {
    expect(scoreFamille({ titre: 'Veillée conte', description: 'Public ados-adultes.' })).toBe(-1);
    expect(scoreFamille({ titre: 'Créateliers', description: 'Pour adultes, sur inscription.' })).toBe(-1);
    expect(scoreFamille({ titre: 'Consultations notariales gratuites', description: 'pour les familles' })).toBe(-1);
    expect(scoreFamille({ titre: 'Baby-sitting dating', description: 'garder des enfants' })).toBe(-1);
    expect(scoreFamille({ titre: 'Enfances percutées', description: 'Discussion avec la commissaire, pour les enfants' })).toBe(-1);
  });

  it('commerce, sport de club, vie associative : exclu', () => {
    expect(scoreFamille({ titre: 'Braderie solidaire', description: 'jouets, jeux enfants, bébés' })).toBe(-1);
    expect(scoreFamille({ titre: 'Match D1 féminine', description: 'venez en famille' })).toBe(-1);
    expect(scoreFamille({ titre: 'Floorball', description: 'séance d’essai pour les enfants' })).toBe(-1);
  });

  it('titres qui disent tout : COMPLET, annulé, inscription annuelle, cours', () => {
    expect(scoreFamille({ titre: 'COMPLET Rythmes et comptines', description: 'éveil des tout-petits' })).toBe(-1);
    expect(scoreFamille({ titre: 'COMPLET/Pique ma curiosité', description: 'pour les enfants' })).toBe(-1);
    expect(scoreFamille({ titre: 'Café des lecteurs (annulé et reporté)', description: 'en famille' })).toBe(-1);
    expect(scoreFamille({ titre: 'Inscription : Sport en anglais pour les kids', description: 'pour les enfants' })).toBe(-1);
    expect(scoreFamille({ titre: 'Cours de dessin pour enfants et ados', description: 'tous les mercredis' })).toBe(-1);
    // « sur inscription » dans la description reste innocent.
    expect(scoreFamille({ titre: 'Heure du conte', description: 'Gratuit, sur inscription.' })).toBe(2);
  });

  it('expressions piégées : « à tout petit prix », « en éveil »', () => {
    expect(scoreFamille({ titre: 'Vente de livres', description: 'à tout petit prix' })).toBe(-1); // vente de livres
    expect(scoreFamille({ titre: 'Livres', description: 'des livres à tout petit prix' })).toBe(0);
    expect(scoreFamille({ titre: 'Brame du cerf', description: 'leurs sens sont en éveil, nature' })).toBe(0.5);
  });

  it('les récupérés : marionnettique, fête foraine, kermesse', () => {
    expect(scoreFamille({ titre: 'Spectacle « Barbedouce »', description: 'Spectacle familial, marionnettique et musical' })).toBe(3);
    expect(scoreFamille({ titre: 'Foire aux manèges de Lille', description: 'la plus grande fête foraine du Nord' })).toBe(3);
    expect(scoreFamille({ titre: 'Kermesse', description: 'magicien, jeux, goûter, maquillages' })).toBe(3);
  });

  it('analyseFamille distingue le spécifique du générique', () => {
    expect(analyseFamille({ titre: 'Marionnettes', description: '' }).specifique).toBe(true);
    expect(analyseFamille({ titre: 'Solo de danse', description: 'Accessible à toutes et tous, enfants et parents.' })).toEqual({ score: 2, specifique: false });
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

  it('lit « entre 5 et 8 ans » (rallye lecture)', () => {
    expect(trancheAge({ titre: 'Rallye lecture', description: 'Tu as entre 5 et 8 ans ?' })).toEqual({ min: 5, max: 8 });
  });

  it('lit « 6 mois - 3 ans » et « de la naissance à 4 ans »', () => {
    expect(trancheAge({ titre: '', description: 'Atelier dansé pour les 6 mois - 3 ans' })).toEqual({ min: 0, max: 3 });
    expect(trancheAge({ titre: '', description: 'de la naissance à 4 ans' })).toEqual({ min: 0, max: 4 });
  });

  it('lit « 6 ans et plus »', () => {
    expect(trancheAge({ titre: '', description: 'pour les 6 ans et plus' })).toEqual({ min: 6, max: null });
  });

  it('ados / collège sans petits : 11 ans et plus', () => {
    expect(trancheAge({ titre: 'Transforme le quotidien', description: 'Ados & robotique' })).toEqual({ min: 11, max: null });
    expect(trancheAge({ titre: 'Café numérique', description: 'accompagner son enfant au collège' })).toEqual({ min: 11, max: null });
    expect(trancheAge({ titre: 'Comédie familiale', description: 'adulte ou ado, en famille' })).toEqual({ min: 11, max: null });
    // « enfants et ados » : pas de contrainte.
    expect(trancheAge({ titre: 'Cours de dessin', description: 'pour les enfants et les ados' })).toBeNull();
  });

  it('« 10 ans de mariage » n’est pas une tranche d’âge', () => {
    expect(trancheAge({ titre: '', description: '10 ans de mariage, 2 enfants' })).toBeNull();
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
