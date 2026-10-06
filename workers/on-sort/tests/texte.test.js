import { describe, it, expect } from 'vitest';
import {
  texteLisible, couper, assembler, champsDescription, pourAffichage, DESCRIPTION_SCORING,
} from '../src/texte.js';
import { cleSerie } from '../src/scoring.js';

// Fiche OpenAgenda réelle (Ouescrime, Rennes), relevée le 6 octobre 2026.
const CHAPEAU = 'Un spectacle palpitant dans lequel 45 escrimeurs venus de partout en France vous présenteront leurs numéros à la rapière, à l’épée, à la faucille,… ou encore au sabre laser';
const LONG = '<p>⚔️ Enfant, vous rêviez de brandir l’épée d’Aragorn ?</p>\n<p>Au programme :</p>\n<p>🗡️ SAMEDI</p>\n'
  + '<p>- 18h30 : ouverture de la salle au public<br>- 19h00 : spectacle 1ère partie<br>- 20h30 : entracte - buvette &amp; restauration</p>\n'
  + '<p>🗡️ DIMANCHE</p>\n<p>Stages réservés aux escrimeurs (non ouvert au public)</p>\n'
  + '<p>N’attendez plus et venez vivre un spectacle palpitant dans lequel 45 escrimeurs venus de partout en France vous présenteront leurs numéros à la rapière, à l’épée, à la faucille,… ou encore au sabre laser !</p>';

describe('descriptions lisibles', () => {
  it('garde un paragraphe par ligne, et chaque ligne du programme', () => {
    expect(texteLisible(LONG).split('\n')).toEqual([
      '⚔️ Enfant, vous rêviez de brandir l’épée d’Aragorn ?',
      'Au programme :',
      '🗡️ SAMEDI',
      '- 18h30 : ouverture de la salle au public',
      '- 19h00 : spectacle 1ère partie',
      '- 20h30 : entracte - buvette & restauration',
      '🗡️ DIMANCHE',
      'Stages réservés aux escrimeurs (non ouvert au public)',
      expect.stringMatching(/^N’attendez plus/),
    ]);
  });

  it('ne répète pas un chapeau déjà présent dans le texte long', () => {
    expect(assembler(CHAPEAU, LONG)).toBe(texteLisible(LONG));
    expect(assembler('Un chapeau qui ne figure pas ailleurs.', '<p>Texte.</p>')).toBe('Un chapeau qui ne figure pas ailleurs.\nTexte.');
  });

  it('coupe en fin de phrase, ou sur un espace avec « … », jamais en plein mot', () => {
    const phrases = `${'Une phrase complète. '.repeat(60)}Fin`;
    const c = couper(phrases, 1200);
    expect(c.length).toBeLessThanOrEqual(1200);
    expect(c.endsWith('complète.')).toBe(true);
    const mots = 'mot '.repeat(400);
    expect(couper(mots, 100)).toMatch(/mot…$/);
  });

  it('extrait pour le scoring, texte complet pour la fiche du top', () => {
    const long = `${'Paragraphe assez long pour dépasser la limite. '.repeat(40)}`;
    const champs = champsDescription(long);
    expect(champs.description.length).toBeLessThanOrEqual(DESCRIPTION_SCORING);
    expect(champs.descriptionComplete.length).toBeGreaterThan(DESCRIPTION_SCORING);
    const fiche = pourAffichage({ titre: 'x', ...champs });
    expect(fiche.description).toBe(champs.descriptionComplete);
    expect(fiche.descriptionComplete).toBeUndefined();
    expect(champsDescription('Court.')).toEqual({ description: 'Court.' });
  });

  it('la clé de série saute une courte ligne de public commune à la source', () => {
    const a = { description: 'Petite enfance\nL’heure des bébés lecteurs : comptines, albums et jeux de doigts pour les tout-petits, chaque samedi matin.' };
    const b = { description: 'Petite enfance\nAtelier d’éveil musical : instruments, chansons et premiers rythmes à partager entre parents et enfants.' };
    expect(cleSerie(a)).not.toBe(cleSerie(b));
  });
});
