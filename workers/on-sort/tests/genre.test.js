import { describe, it, expect } from 'vitest';
import { exceptionnel, estLecture, genre } from '../src/genre.js';
import { scorer, selectionner } from '../src/scoring.js';

const ev = (titre, extra = {}) => ({ titre, description: '', motsCles: [], ...extra });

describe('genre', () => {
  it('reconnaît l\'exceptionnel sur le titre', () => {
    expect(exceptionnel(ev('Cirque Pinder - Le Mans'))).toEqual({ genre: 'cirque', enfant: true });
    expect(exceptionnel(ev('Pochette Surprise : la Ducasse de Clément Courgeon'))?.genre).toBe('fete-foraine');
    expect(exceptionnel(ev('Grand carnaval des enfants'))?.genre).toBe('parade');
    expect(exceptionnel(ev("Feu d'artifice du 14 juillet"))?.genre).toBe('feu-artifice');
    expect(exceptionnel(ev('Marché de Noël de Lille'))?.genre).toBe('noel');
    expect(exceptionnel(ev('Halloween en famille à Land aux Lutins'))).toEqual({ genre: 'halloween', enfant: false });
  });

  it('lit le type DATAtourisme, quel que soit son préfixe', () => {
    expect(exceptionnel(ev('Spectacle', { types: ['https://www.datatourisme.fr/ontology/core#CircusEvent'] }))?.genre).toBe('cirque');
    expect(exceptionnel(ev('Spectacle', { types: ['schema:Event', 'Carnival'] }))?.genre).toBe('parade');
    expect(exceptionnel(ev('Spectacle', { types: ['ShowEvent'] }))).toBeNull();
  });

  it('ne lit pas la description : « arts du cirque » dans un atelier n\'est pas un cirque de passage', () => {
    expect(exceptionnel(ev('Atelier motricité', { description: 'initiation aux arts du cirque' }))).toBeNull();
  });

  it('reconnaît la lecture et le conte', () => {
    for (const t of ['Historiettes', 'Allez hop, on lit !', 'Les samedis à histoires', 'Bébé Bouquine',
      "L'heure du conte", 'Séance bébés lecteurs', 'Comptines et jeux de doigts']) {
      expect(estLecture(ev(t)), t).toBe(true);
    }
    expect(estLecture(ev('Atelier cuisine recettes d\'Halloween'))).toBe(false);
  });

  it('un festival de contes reste un festival', () => {
    expect(genre(ev('Festival de contes : Cahutes'))).toBe('festival');
  });
});

describe('scoring du genre', () => {
  const ctx = { lat: 48.11, lon: -1.68, age: 3 };
  const ici = { lat: 48.11, lon: -1.68, dateDebut: '2026-10-10', dateFin: '2026-10-10' };

  it('un cirque de passage est une sortie enfant même sans « en famille »', () => {
    const r = scorer(ev('Cirque Medrano', { ...ici, dateFin: '2026-10-14', description: 'Le nouveau spectacle sous chapiteau.' }), ctx);
    expect(r).not.toBeNull();
    expect(r.genre).toBe('cirque');
    expect(r.raisons).toContain('À ne pas rater');
    expect(r.raisons).toContain('Ouvert aux enfants');
  });

  it('pas de bonus pour un festival étalé sur une saison', () => {
    const r = scorer(ev('Festival jeune public', { ...ici, dateDebut: '2026-09-01', dateFin: '2026-12-31', description: 'pour les enfants' }), ctx);
    expect(r.raisons).not.toContain('À ne pas rater');
  });

  it('le cirque passe devant une séance de lecture équivalente', () => {
    const lecture = scorer(ev('Bébés lecteurs', { ...ici, description: 'Lecture pour les tout-petits de 0 à 3 ans. Gratuit.' }), ctx);
    const cirque = scorer(ev('Cirque de passage', { ...ici, description: 'Spectacle pour les enfants de 0 à 3 ans. Gratuit.' }), ctx);
    expect(cirque.score).toBeGreaterThan(lecture.score);
  });
});

describe('selectionner — une lecture par top', () => {
  const sortie = (titre, score, genreSortie) => ({ titre, score, genre: genreSortie, dureeJours: 0 });

  it('garde une seule lecture quand il y a d\'autres sorties', () => {
    const top = selectionner([
      sortie('Historiettes', 12, 'lecture'), sortie('Les petites histoires', 11, 'lecture'),
      sortie('Allez hop, on lit !', 10, 'lecture'), sortie('Atelier peinture', 8, 'autre'),
      sortie('Ferme pédagogique', 7, 'autre'), sortie('Concert jeune public', 6, 'autre'),
      sortie('Cinéma', 5, 'autre'),
    ]);
    expect(top.map((e) => e.titre)).toEqual(['Historiettes', 'Atelier peinture', 'Ferme pédagogique', 'Concert jeune public', 'Cinéma']);
  });

  it('complète avec d\'autres lectures plutôt que de laisser un top court', () => {
    const top = selectionner([
      sortie('Historiettes', 12, 'lecture'), sortie('Les petites histoires', 11, 'lecture'),
      sortie('Atelier peinture', 8, 'autre'),
    ]);
    expect(top.map((e) => e.titre)).toEqual(['Historiettes', 'Atelier peinture', 'Les petites histoires']);
  });
});
