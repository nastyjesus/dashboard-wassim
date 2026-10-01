// Tests des routes avec un dépôt simulé (le SQL réel est vérifié de bout en
// bout par le smoke test du workflow de déploiement, sur la vraie D1).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const OPP_ID = '11111111-1111-4111-8111-111111111111';
const CLIENT = { id: 'cabinet-dupont', name: 'Cabinet Dupont', domain: 'dupont.fr', competitors: ['rival.fr'], weights: null, authority_source: 'semrush' };

vi.mock('../src/depot.js', () => ({
  listClients: vi.fn(async () => [{ ...CLIENT, counts: { a_contacter: 3 } }]),
  getClient: vi.fn(async (db, id) => (id === 'cabinet-dupont' ? { ...CLIENT } : null)),
  createClient: vi.fn(async () => {}),
  updateClient: vi.fn(async () => {}),
  recomputeScores: vi.fn(async () => 12),
  upsertOpportunities: vi.fn(async () => ({ created: 2, updated: 0 })),
  listOpportunities: vi.fn(async () => []),
  getOpportunity: vi.fn(async (db, id) => (id === OPP_ID
    ? { id: OPP_ID, client_id: 'cabinet-dupont', domain: 'blog.fr', status: 'contacte', link_url: null }
    : null)),
  updateOpportunity: vi.fn(async () => {}),
  listEvents: vi.fn(async () => []),
  listChecks: vi.fn(async () => []),
  dueFollowups: vi.fn(async () => []),
  lostLinks: vi.fn(async () => []),
  linksToCheck: vi.fn(async () => []),
  clientDomainOf: vi.fn(async () => 'dupont.fr'),
  recordCheck: vi.fn(async () => {}),
  lastCheckResults: vi.fn(async () => []),
}));

import worker, { runCheck } from '../src/index.js';
import * as depot from '../src/depot.js';

const ENV = { DB: {}, ALLOWED_ORIGINS: '*', WASSIM_AUTH_TOKEN: 'secret-de-test' };

async function call(path, { method = 'GET', body, auth = 'secret-de-test', raw } = {}) {
  const headers = {};
  if (auth) headers['X-Wassim-Auth'] = auth;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await worker.fetch(new Request(`https://radar.test${path}`, {
    method, headers, body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
  }), ENV);
  return { res, body: await res.json() };
}

beforeEach(() => vi.clearAllMocks());

describe('auth', () => {
  it('/health est public', async () => {
    const { res, body } = await call('/health', { auth: null });
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it('refuse sans token ou avec un mauvais token', async () => {
    expect((await call('/clients', { auth: null })).res.status).toBe(401);
    expect((await call('/clients', { auth: 'faux' })).res.status).toBe(401);
  });
});

describe('clients', () => {
  it('liste', async () => {
    const { body } = await call('/clients');
    expect(body.clients[0].counts.a_contacter).toBe(3);
  });

  it('crée un client avec domaines normalisés', async () => {
    depot.getClient.mockResolvedValueOnce(null);
    const { res } = await call('/clients', {
      method: 'POST',
      body: { name: 'Boulangerie Été', domain: 'https://www.boulangerie.fr/', competitors: ['www.Rival.fr', 'rival.fr'] },
    });
    expect(res.status).toBe(201);
    expect(depot.createClient).toHaveBeenCalledWith(ENV.DB, expect.objectContaining({
      id: 'boulangerie-ete', domain: 'boulangerie.fr', competitors: ['rival.fr'], authority_source: 'semrush',
    }));
  });

  it('refuse un domaine invalide ou un doublon', async () => {
    expect((await call('/clients', { method: 'POST', body: { name: 'X client', domain: 'pas un domaine' } })).res.status).toBe(400);
    expect((await call('/clients', { method: 'POST', body: { name: 'Cabinet Dupont', domain: 'dupont.fr' } })).res.status).toBe(409);
  });

  it('changer la pondération recalcule les scores', async () => {
    const { body } = await call('/clients/cabinet-dupont', { method: 'PATCH', body: { weights: { authority: 2, ease: 1 } } });
    expect(body.rescored).toBe(12);
    expect(depot.recomputeScores).toHaveBeenCalled();
  });

  it('refuse une pondération invalide', async () => {
    expect((await call('/clients/cabinet-dupont', { method: 'PATCH', body: { weights: { authority: -1 } } })).res.status).toBe(400);
  });
});

describe('imports', () => {
  it('fichier au format inconnu → 422 avec les colonnes lues', async () => {
    const form = new FormData();
    form.append('file', new File(['Colonne A;Colonne B\n1;2'], 'export.csv', { type: 'text/csv' }));
    const res = await worker.fetch(new Request('https://radar.test/clients/cabinet-dupont/imports', {
      method: 'POST', headers: { 'X-Wassim-Auth': 'secret-de-test' }, body: form,
    }), ENV);
    const body = await res.json();
    expect(res.status).toBe(422);
    expect(body).toMatchObject({ error: 'unknown_format', headers: ['Colonne A', 'Colonne B'] });
    expect(depot.upsertOpportunities).not.toHaveBeenCalled();
  });

  it('client inconnu → 404', async () => {
    expect((await call('/clients/inconnu/imports', { method: 'POST' })).res.status).toBe(404);
  });
});

describe('opportunités', () => {
  it('transition valide journalisée', async () => {
    const { res } = await call(`/opportunities/${OPP_ID}`, { method: 'PATCH', body: { status: 'relance', note: 'relancé par mail' } });
    expect(res.status).toBe(200);
    expect(depot.updateOpportunity).toHaveBeenCalledWith(ENV.DB, expect.any(Object),
      expect.objectContaining({ status: 'relance', next_followup_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }), 'relancé par mail');
  });

  it('transition interdite → 400', async () => {
    const { res, body } = await call(`/opportunities/${OPP_ID}`, { method: 'PATCH', body: { status: 'a_contacter' } });
    expect(res.status).toBe(400);
    expect(body.message).toMatch(/interdite/);
  });

  it('« obtenu » sans URL → 400', async () => {
    expect((await call(`/opportunities/${OPP_ID}`, { method: 'PATCH', body: { status: 'obtenu' } })).res.status).toBe(400);
  });

  it('statut de filtre inconnu → 400', async () => {
    expect((await call('/clients/cabinet-dupont/opportunities?status=xx')).res.status).toBe(400);
  });

  it('opportunité inconnue → 404', async () => {
    expect((await call('/opportunities/22222222-2222-4222-8222-222222222222')).res.status).toBe(404);
  });
});

describe('runCheck', () => {
  const html = (body) => `<html><body><p>${'contenu '.repeat(60)}</p>${body}</body></html>`;
  const fetchWith = (body, status = 200) => async () => new Response(html(body), { status, headers: { 'content-type': 'text/html' } });

  it('obtenu + deux échecs consécutifs → perdu', async () => {
    depot.lastCheckResults.mockResolvedValueOnce(['missing', 'missing']);
    const opp = { id: OPP_ID, client_id: 'cabinet-dupont', status: 'obtenu', link_url: 'https://blog.fr/a' };
    const check = await runCheck({}, opp, fetchWith('<a href="https://autre.fr">x</a>'));
    expect(check.result).toBe('missing');
    expect(depot.updateOpportunity).toHaveBeenCalledWith({}, opp, { status: 'perdu' }, expect.stringMatching(/deux fois/));
  });

  it('obtenu + un seul échec → reste obtenu', async () => {
    depot.lastCheckResults.mockResolvedValueOnce(['missing', 'live_dofollow']);
    const opp = { id: OPP_ID, client_id: 'cabinet-dupont', status: 'obtenu', link_url: 'https://blog.fr/a' };
    await runCheck({}, opp, fetchWith(''));
    expect(depot.updateOpportunity).not.toHaveBeenCalled();
  });

  it('perdu + lien retrouvé → obtenu', async () => {
    const opp = { id: OPP_ID, client_id: 'cabinet-dupont', status: 'perdu', link_url: 'https://blog.fr/a' };
    const check = await runCheck({}, opp, fetchWith('<a href="https://dupont.fr/">x</a>'));
    expect(check.result).toBe('live_dofollow');
    expect(depot.updateOpportunity).toHaveBeenCalledWith({}, opp, { status: 'obtenu' }, expect.stringMatching(/retrouvé/));
  });
});
