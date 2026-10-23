import { describe, it, expect } from 'vitest';
import { detecterDanger, normaliser, reponseDanger } from '../src/danger.js';

// Chaque phrase est écrite comme un papa l'écrirait (ou comme un vocal la
// transcrirait) : fautes, absence d'accents, majuscules.
const A_RISQUE = [
  ['Il ne respire plus !!', 'medical'],
  ['ma fille respire mal depuis tout à l heure', 'medical'],
  ["il s'étouffe avec un bonbon", 'medical'],
  ['il fait des convulsions', 'medical'],
  ['elle est inconsciente', 'medical'],
  ['il a perdu connaissance en tombant', 'medical'],
  ['il ne se réveille pas de sa sieste et ne réagit plus', 'medical'],
  ['ses lèvres sont bleues', 'medical'],
  ['il a avalé une pile bouton', 'medical'],
  ['elle a avale des medicaments dans mon sac', 'medical'],
  ['mon fils a avalé de la javel', 'medical'],
  ['il a avalé un aimant', 'medical'],
  ['grosse brûlure avec la casserole', 'medical'],
  ['il saigne beaucoup de la tête', 'medical'],
  ['il est tombé de la fenêtre', 'medical'],
  ['tombé sur la tête et il a vomi deux fois', 'medical'],
  ["j'ai envie de me tuer", 'suicide'],
  ['je pense au suicide', 'suicide'],
  ['je veux en finir', 'suicide'],
  ["j'ai plus envie de vivre", 'suicide'],
  ['je veux mourir sérieux', 'suicide'],
  ["j'ai envie de le frapper", 'enfance'],
  ['je vais la secouer si elle continue', 'enfance'],
  ['je vais le tuer', 'enfance'],
  ["je l'ai frappé tout à l'heure", 'enfance'],
  ["j'ai giflé mon fils", 'enfance'],
  ['il pleure et j ai secoue le bebe', 'enfance'],
  ["j'ai peur de lui faire du mal", 'enfance'],
  ['je crois que ma fille est maltraitée chez sa mère', 'enfance'],
  ['ENVIE DE LES COGNER TOUS LES DEUX', 'enfance'],
];

const ORDINAIRES = [
  'il refuse de dormir',
  'il tape sa sœur',
  'il me frappe quand je lui dis non',
  'crise au supermarché, il hurle',
  'elle fait une colère monstre pour le manteau',
  "j'en peux plus il refuse de mettre ses chaussures",
  'il a avalé son repas en deux minutes',
  'il respire fort quand il est en colère',
  'il a tapé un copain à la crèche',
  'ma fille ne veut pas manger ses légumes',
  'il veut pas lâcher la tablette',
  'ils se battent pour un jouet',
  'il fait pipi au lit',
  'elle a peur du noir',
  'il mord à la crèche',
  'il casse ses jouets quand il perd',
  'il me répond tout le temps',
  'elle pleure quand je pars au travail',
  "il s'est brûlé un peu le doigt avec la tasse",
  'il est tombé du canapé, il va bien',
  'il dit des gros mots',
  'elle ne veut pas aller à l école',
  'il ment pour les bonbons',
  'il est jaloux du bébé',
  'mon fils fait une crise parce qu il a perdu au jeu',
  'il se roule par terre',
  'il crache quand il est énervé',
  'je suis crevé, il se réveille 5 fois par nuit',
  'elle étouffe de rire devant le dessin animé',
  'il a fait tomber la télé, rien de cassé',
];

describe('détection des messages à risque', () => {
  it.each(A_RISQUE)('« %s » → %s', (phrase, type) => {
    const r = detecterDanger(phrase);
    expect(r).not.toBeNull();
    expect(r.type).toBe(type);
  });
});

describe('crises ordinaires : pas d’alerte, elles vont au SOS', () => {
  it.each(ORDINAIRES)('« %s »', (phrase) => {
    expect(detecterDanger(phrase)).toBeNull();
  });
});

describe('réponses', () => {
  it('urgence médicale : 15 et 112', () => {
    const { reponse } = detecterDanger('il ne respire plus');
    expect(reponse).toContain('15');
    expect(reponse).toContain('112');
  });

  it('détresse du papa : 3114', () => {
    expect(detecterDanger('je veux en finir').reponse).toContain('3114');
  });

  it('risque pour l’enfant : 119', () => {
    expect(detecterDanger("j'ai envie de le frapper").reponse).toContain('119');
  });

  it('la vie de l’enfant passe avant tout', () => {
    expect(detecterDanger("je vais le secouer, il ne respire plus").type).toBe('medical');
  });

  it('message vide : rien', () => {
    expect(detecterDanger('')).toBeNull();
    expect(detecterDanger(undefined)).toBeNull();
  });

  it('second filet : type inconnu → réponse enfance', () => {
    expect(reponseDanger('autre')).toContain('119');
  });
});

describe('normaliser', () => {
  it('retire accents, majuscules et apostrophes typographiques', () => {
    expect(normaliser('  Il s’ÉTOUFFE  ')).toBe("il s'etouffe");
  });
});
