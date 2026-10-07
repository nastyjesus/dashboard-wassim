import { describe, it, expect, vi, afterEach } from 'vitest';
import { lireSelection, correspondance, releverVeille, lireVeille } from '../src/veille.js';

afterEach(() => vi.unstubAllGlobals());

// Extrait de la forme réelle relevée le 7 octobre 2026.
const PAGE = `<section><h2>3 idées de sorties le samedi 10 octobre</h2><div class="event-list">
<a class="event-row agenda-event-row" href="/agenda/a"><div class="event-date"><strong>10</strong><span>OCT</span></div><div class="event-preview-copy"><small>09:30 · Jeu de Paume</small><h3>Café des P&#039;tits Trucs</h3></div></a>
<a class="event-row agenda-event-row" href="/agenda/b"><div class="event-preview-copy"><small>Le Triangle, Cité de la danse</small><h3>Ouescrime – Festival d’escrime artistique</h3></div></a>
<a class="event-row agenda-event-row" href="/agenda/c"><div class="event-preview-copy"><small>14:00 · Les Champs Libres</small><h3>Fête de la science – La pomme dans tous ses états</h3></div></a>
</div></section><section><h2>1 idée de sortie le dimanche 11 octobre</h2>
<a class="event-row agenda-event-row" href="/agenda/d"><small>10:00 · Parc</small><h3>Festival des Livres</h3></a></section>`;

describe('veille concurrente', () => {
  it('lit les sorties par jour : titre, lieu, heure', () => {
    const s = lireSelection(PAGE);
    expect(s.samedi).toHaveLength(3);
    expect(s.samedi[0]).toEqual({ titre: 'Café des P’tits Trucs', lieu: 'Jeu de Paume', heure: '09:30' });
    expect(s.samedi[1]).toMatchObject({ lieu: 'Le Triangle, Cité de la danse', heure: null });
    expect(s.dimanche.map((x) => x.titre)).toEqual(['Festival des Livres']);
  });

  it('rapproche des titres rédigés différemment, sans confondre des titres voisins', () => {
    const nos = [{ titre: "2e édition de Ouescrime : festival d'escrime artistique les 10 & 11 octobre" }, { titre: 'Les petites histoires' }];
    expect(correspondance('Ouescrime – Festival d’escrime artistique', nos)).toBe(nos[0]);
    expect(correspondance('La petite sorcière', nos)).toBeNull();
    expect(correspondance('Atelier enfants', nos)).toBeNull(); // que des mots vides
  });

  it('relève : absente / écartée / retenue, et garde l\'historique', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(PAGE)));
    const m = new Map();
    const env = { VOTES: { get: async (k, t) => (m.has(k) ? (t === 'json' ? JSON.parse(m.get(k)) : m.get(k)) : null), put: async (k, v) => { m.set(k, v); } } };
    const ici = { lat: 48.11, lon: -1.68, dateDebut: '2026-10-10', dateFin: '2026-10-10', creneaux: [], motsCles: [] };
    const nos = [
      { ...ici, titre: "2e édition de Ouescrime : festival d'escrime artistique", description: 'Un spectacle pour petits et grands, en famille.' },
      { ...ici, titre: 'Fête de la science : la pomme dans tous ses états', description: 'Conférence sur les vergers.' },
    ];
    const deps = {
      lireParams: () => ({ rayonKm: 40 }),
      chargerSources: async () => ({ evenements: nos, meteo: null }),
      lireSurcouche: async () => ({}),
      appliquerSurcouche: (e) => e,
    };
    const r = await releverVeille(env, deps, new Date('2026-10-09T15:00:00Z'));
    expect(r).toMatchObject({ dateISO: '2026-10-10', total: 3, absentes: 1, ecartees: 1, retenues: 1 });
    const { releve, historique } = await lireVeille(env);
    expect(releve.lignes.find((l) => l.statut === 'ecartee').motif).toBe('anti-famille'); // « conférence »
    expect(historique).toHaveLength(1);
  });

  it('page modifiée (aucune sortie lue) : erreur explicite plutôt qu\'un faux « 0 absente »', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>refonte</html>')));
    await expect(releverVeille({ VOTES: {} }, {}, new Date())).rejects.toThrow(/page modifiée/);
  });
});
