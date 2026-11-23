// Chaque <script> inline des pages HTML doit se compiler : une erreur de
// syntaxe (ex. apostrophe droite dans une chaîne '…') casse toute la page
// sans qu'aucun autre test ne le voie.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dossier = join(__dirname, '..', 'src');
const pages = readdirSync(dossier).filter((f) => f.endsWith('.html'));

describe('scripts inline des pages', () => {
  it('trouve les pages attendues', () => {
    for (const p of ['admin.html', 'reseaux.html', 'conference.html', 'secretaire.html', 'membre.html', 'addin.html']) expect(pages).toContain(p);
  });

  for (const page of pages) {
    it(`${page} : chaque script inline se compile`, () => {
      const html = readFileSync(join(dossier, page), 'utf8');
      // scripts sans attribut src (les scripts externes ne sont pas à nous)
      const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
      if (page !== 'icone.html') expect(scripts.length).toBeGreaterThan(0);
      scripts.forEach((code, i) => {
        // compilation seule (rien n'est exécuté) ; « async » pour accepter un await de premier niveau
        const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
        expect(() => new AsyncFunction(code), `${page}, script ${i + 1}`).not.toThrow();
      });
    });
  }
});
