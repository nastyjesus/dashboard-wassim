import { describe, it, expect } from 'vitest';
import {
  nettoyer, validerPseudo, validerTypePost, validerTextePost, validerCommentaire,
} from '../src/valider.js';

describe('nettoyer', () => {
  it('retire les caractères de contrôle mais garde les sauts de ligne', () => {
    expect(nettoyer(`a${String.fromCharCode(7)}b\nc`)).toBe('ab\nc');
  });
  it('compacte les sauts de ligne en rafale', () => {
    expect(nettoyer('a\n\n\n\n\nb')).toBe('a\n\nb');
  });
});

describe('validerPseudo', () => {
  it('accepte un pseudo normal', () => expect(validerPseudo('Wassim')).toBeNull());
  it('refuse trop court, trop long, lien', () => {
    expect(validerPseudo('W')).not.toBeNull();
    expect(validerPseudo('x'.repeat(21))).not.toBeNull();
    expect(validerPseudo('https://spam.io')).not.toBeNull();
  });
});

describe('validerTypePost / textes', () => {
  it('types connus uniquement', () => {
    expect(validerTypePost('sortie')).toBeNull();
    expect(validerTypePost('entraide')).toBeNull();
    expect(validerTypePost('pub')).not.toBeNull();
  });
  it('bornes des textes', () => {
    expect(validerTextePost('Un vrai post.')).toBeNull();
    expect(validerTextePost('ab')).not.toBeNull();
    expect(validerTextePost('x'.repeat(601))).not.toBeNull();
    expect(validerCommentaire('ok')).toBeNull();
    expect(validerCommentaire('')).not.toBeNull();
    expect(validerCommentaire('x'.repeat(301))).not.toBeNull();
  });
});
