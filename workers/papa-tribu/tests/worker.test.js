// Tests des routes avec un dépôt simulé (le SQL réel est vérifié de bout en
// bout par le smoke test du workflow de déploiement, sur la vraie D1).
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/depot.js', () => ({
  creerPapa: vi.fn(async ({ pseudo }) => ({ id: 'p-1', pseudo, ville: 'Rennes', dept: 'Ille-et-Vilaine', jeton: 'jeton-1', numero: 3 })),
  papaParJeton: vi.fn(async (db, jeton) => {
    if (jeton === 'jeton-1') return { id: 'p-1', pseudo: 'Wassim', ville: 'Rennes', dept: 'Ille-et-Vilaine', numero: 3, banni: 0 };
    if (jeton === 'jeton-banni') return { id: 'p-2', pseudo: 'Troll', banni: 1 };
    return null;
  }),
  postsRecents: vi.fn(async () => 0),
  creerPost: vi.fn(async () => ({ id: '11111111-1111-4111-8111-111111111111' })),
  listerFil: vi.fn(async () => [{
    id: '11111111-1111-4111-8111-111111111111', type: 'sortie', texte: 'Testé le parc', ville: 'Rennes',
    dept: 'Ille-et-Vilaine', cree_le: '2026-08-22 10:00:00', pseudo: 'Wassim', auteur_ville: 'Rennes',
    auteur_numero: 3, pouces: 2, nb_commentaires: 1, mon_pouce: 1,
  }]),
  postParId: vi.fn(async (db, id) => (id.startsWith('1111') ? { id, papa_id: 'p-1', masque: 0 } : null)),
  basculerReaction: vi.fn(async () => ({ aime: true, pouces: 3 })),
  listerCommentaires: vi.fn(async () => []),
  creerCommentaire: vi.fn(async () => ({ id: '22222222-2222-4222-8222-222222222222' })),
  signaler: vi.fn(async () => 3),
  masquer: vi.fn(async () => {}),
  bannir: vi.fn(async () => {}),
  listerSignalements: vi.fn(async () => []),
}));

import worker from '../src/index.js';
import * as depot from '../src/depot.js';

const ENV = { DB: {}, ALLOWED_ORIGINS: '*', SEUIL_SIGNALEMENTS: '3', MAX_POSTS_PAR_HEURE: '5', WASSIM_AUTH_TOKEN: 'admin-secret' };
const POST_ID = '11111111-1111-4111-8111-111111111111';

async function appel(path, { methode = 'GET', corps, jeton, admin } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (jeton) headers.Authorization = `Bearer ${jeton}`;
  if (admin) headers['X-Wassim-Auth'] = admin;
  const res = await worker.fetch(new Request(`https://papa-tribu.test${path}`, {
    method: methode, headers, body: corps ? JSON.stringify(corps) : undefined,
  }), ENV);
  return { res, body: await res.json() };
}

beforeEach(() => vi.clearAllMocks());

describe('inscription', () => {
  it('crée une identité et renvoie le jeton une seule fois', async () => {
    const { res, body } = await appel('/inscription', { methode: 'POST', corps: { pseudo: 'Wassim', ville: 'Rennes', dept: 'Ille-et-Vilaine' } });
    expect(res.status).toBe(201);
    expect(body.jeton).toBe('jeton-1');
    expect(body.papa.fondateur).toBe(true);
    expect(body.papa.jeton).toBeUndefined();
  });

  it('refuse un pseudo invalide', async () => {
    const { res } = await appel('/inscription', { methode: 'POST', corps: { pseudo: 'W' } });
    expect(res.status).toBe(400);
  });
});

describe('fil', () => {
  it('liste les posts au format public (jeton jamais exposé)', async () => {
    const { body } = await appel('/fil?dept=Ille-et-Vilaine', { jeton: 'jeton-1' });
    expect(body.posts).toHaveLength(1);
    const p = body.posts[0];
    expect(p.auteur).toEqual({ pseudo: 'Wassim', ville: 'Rennes', fondateur: true });
    expect(p.monPouce).toBe(true);
    expect(p.papa_id).toBeUndefined();
  });
});

describe('écriture protégée', () => {
  it('poster sans jeton → 401', async () => {
    const { res } = await appel('/posts', { methode: 'POST', corps: { type: 'sortie', texte: 'Un post sans identité' } });
    expect(res.status).toBe(401);
  });

  it('un papa banni ne peut plus écrire', async () => {
    const { res } = await appel('/posts', { methode: 'POST', jeton: 'jeton-banni', corps: { type: 'sortie', texte: 'coucou' } });
    expect(res.status).toBe(403);
  });

  it('poste valide → 201', async () => {
    const { res, body } = await appel('/posts', { methode: 'POST', jeton: 'jeton-1', corps: { type: 'entraide', texte: 'Comment vous gérez les réveils ?' } });
    expect(res.status).toBe(201);
    expect(body.id).toBeTruthy();
  });

  it('rate limit → 429', async () => {
    depot.postsRecents.mockResolvedValueOnce(5);
    const { res } = await appel('/posts', { methode: 'POST', jeton: 'jeton-1', corps: { type: 'sortie', texte: 'Encore un post' } });
    expect(res.status).toBe(429);
  });

  it('réaction : toggle sur un post existant', async () => {
    const { body } = await appel(`/posts/${POST_ID}/reaction`, { methode: 'POST', jeton: 'jeton-1' });
    expect(body).toEqual({ aime: true, pouces: 3 });
  });
});

describe('signalements', () => {
  it('au seuil, la cible est masquée automatiquement', async () => {
    const { res } = await appel('/signalements', {
      methode: 'POST', jeton: 'jeton-1', corps: { cibleType: 'post', cibleId: POST_ID, raison: 'spam' },
    });
    expect(res.status).toBe(201);
    expect(depot.masquer).toHaveBeenCalledWith(ENV.DB, 'post', POST_ID);
  });

  it('sous le seuil, pas de masquage', async () => {
    depot.signaler.mockResolvedValueOnce(1);
    await appel('/signalements', { methode: 'POST', jeton: 'jeton-1', corps: { cibleType: 'post', cibleId: POST_ID } });
    expect(depot.masquer).not.toHaveBeenCalled();
  });
});

describe('admin', () => {
  it('refuse sans le bon secret', async () => {
    const { res } = await appel('/admin/signalements', { methode: 'POST', jeton: 'jeton-1', admin: 'mauvais' });
    expect(res.status).toBe(401);
  });

  it('bannit avec le bon secret', async () => {
    const { res } = await appel('/admin/bannir', { methode: 'POST', jeton: 'jeton-1', admin: 'admin-secret', corps: { papaId: 'p-2' } });
    expect(res.status).toBe(200);
    expect(depot.bannir).toHaveBeenCalledWith(ENV.DB, 'p-2');
  });
});
