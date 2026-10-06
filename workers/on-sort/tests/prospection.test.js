import { describe, it, expect } from 'vitest';
import { fusionner, majLieu, rapprocherProposition, idLieu, lireProspection } from '../src/admin/prospection.js';

function kvMemoire() {
  const m = new Map();
  return {
    m,
    get: async (k, t) => (m.has(k) ? (t === 'json' ? JSON.parse(m.get(k)) : m.get(k)) : null),
    put: async (k, v) => { m.set(k, v); },
  };
}

const LIEUX = [
  { ville: 'rennes', type: 'spectacle', nom: 'Comédie de Rennes', site: 'https://www.comedie-de-rennes.fr', email: 'contact@comedie-de-rennes.fr' },
  { ville: 'rennes', type: 'loisirs', nom: 'Pop Corn Labyrinthe', site: 'https://www.popcornlabyrinthe.fr', email: null, pageContact: 'https://www.popcornlabyrinthe.fr/contact' },
  { ville: 'rennes', type: 'inconnu', nom: 'Type invalide' },
];

describe('prospection', () => {
  it('fusionne : nouveaux « à contacter », types invalides écartés, statuts conservés', () => {
    let doc = fusionner({ version: 0, lieux: [] }, LIEUX, '2026-10-06T00:00:00Z');
    expect(doc.lieux.map((l) => [l.id, l.statut])).toEqual([
      ['rennes:comedie-de-rennes', 'a-contacter'], ['rennes:pop-corn-labyrinthe', 'a-contacter'],
    ]);
    doc.lieux[0].statut = 'contacte';
    doc = fusionner(doc, [{ ...LIEUX[0], telephone: '02 99 00 00 00' }]);
    expect(doc.lieux[0]).toMatchObject({ statut: 'contacte', telephone: '02 99 00 00 00' });
    expect(idLieu('stmalo', 'Le Grand Aquarium ')).toBe('stmalo:le-grand-aquarium');
  });

  it('date la première prise de contact, refuse un statut inconnu', async () => {
    const env = { VOTES: kvMemoire() };
    await env.VOTES.put('prospect:lieux', JSON.stringify(fusionner({ version: 0, lieux: [] }, LIEUX)));
    const r = await majLieu(env, { id: 'rennes:comedie-de-rennes', statut: 'contacte', note: 'Envoyé à contact@' });
    expect(r.lieu).toMatchObject({ statut: 'contacte', note: 'Envoyé à contact@' });
    expect(r.lieu.contacteLe).toBeTruthy();
    expect(await majLieu(env, { id: 'rennes:comedie-de-rennes', statut: 'n-importe' })).toEqual({ erreur: 'statut inconnu' });
  });

  it('une proposition d\'un lieu prospecté le passe « a proposé » (domaine e-mail, site ou nom)', async () => {
    const env = { VOTES: kvMemoire() };
    await env.VOTES.put('prospect:lieux', JSON.stringify(fusionner({ version: 0, lieux: [] }, LIEUX)));
    // Domaine de l'e-mail = domaine du site.
    expect(await rapprocherProposition(env, { contactEmail: 'billetterie@comedie-de-rennes.fr', organisme: 'La Comédie', titre: 'La petite sorcière' }))
      .toBe('rennes:comedie-de-rennes');
    // Webmail : on ne rapproche pas sur gmail.com, mais sur le nom.
    expect(await rapprocherProposition(env, { contactEmail: 'popcorn35@gmail.com', organisme: 'Pop Corn Labyrinthe', titre: 'Halloween' }))
      .toBe('rennes:pop-corn-labyrinthe');
    expect(await rapprocherProposition(env, { contactEmail: 'x@gmail.com', organisme: 'Inconnu', titre: 'y' })).toBeNull();
    const doc = await lireProspection(env);
    expect(doc.lieux.filter((l) => l.statut === 'a-propose')).toHaveLength(2);
    expect(doc.lieux[0].note).toContain('La petite sorcière');
  });
});
