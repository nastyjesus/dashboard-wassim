// Tests des routes avec un KV simulé en mémoire. Le vrai KV est vérifié par
// le smoke test du workflow de déploiement.
import { describe, it, expect, beforeEach } from 'vitest';
import worker from '../src/index.js';

class KVMemoire {
  constructor() { this.donnees = new Map(); }
  async get(cle, type) {
    if (!this.donnees.has(cle)) return null;
    const v = this.donnees.get(cle);
    if (type === 'json') return JSON.parse(v);
    if (type === 'arrayBuffer') return v;
    return v;
  }
  async put(cle, valeur) { this.donnees.set(cle, valeur); }
  async delete(cle) { this.donnees.delete(cle); }
  async list({ prefix }) { return { keys: [...this.donnees.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })) }; }
}

const ADMIN = 'admin-secret';
let env;

async function appel(path, { methode = 'GET', corps, admin, type } = {}) {
  const headers = {};
  if (admin) headers['X-Wassim-Auth'] = admin;
  let body;
  if (corps instanceof Uint8Array) { body = corps; headers['Content-Type'] = type ?? 'image/jpeg'; }
  else if (corps !== undefined) { body = JSON.stringify(corps); headers['Content-Type'] = 'application/json'; }
  const res = await worker.fetch(new Request(`https://bni.test${path}`, { method: methode, headers, body }), env);
  const ct = res.headers.get('Content-Type') || '';
  return { res, body: ct.includes('json') ? await res.json() : await res.text() };
}

const MEMBRES = [
  { slide_id: 101, nom: 'Paul JUHEL', metier: 'C.G.P', recherche: '', a_une_photo: false },
  { slide_id: 202, nom: 'Céline GUIHO', metier: 'Prévoyance', recherche: 'Ancien texte', a_une_photo: true },
];

async function lienDe(nom) {
  const { body } = await appel('/api/admin/etat', { admin: ADMIN });
  const lien = body.membres.find((m) => m.nom === nom).lien;
  return new URL(lien).searchParams.get('m');
}

beforeEach(async () => {
  env = { KV: new KVMemoire(), WASSIM_AUTH_TOKEN: ADMIN };
  await appel('/api/job/resultat', { methode: 'POST', admin: ADMIN, corps: { ok: true, message: 'sync', membres: MEMBRES } });
});

describe('pages', () => {
  it('sert la page membre et la page admin', async () => {
    expect((await appel('/')).body).toContain('Ton infomerciale de la semaine');
    expect((await appel('/admin')).body).toContain('Jeton admin');
    expect((await appel('/health')).body).toEqual({ ok: true });
  });
});

describe('membres', () => {
  it('refuse un lien inconnu', async () => {
    const { res } = await appel('/api/moi?m=faux');
    expect(res.status).toBe(403);
  });

  it('dépose photo + recherche avec son lien perso', async () => {
    const m = await lienDe('Paul JUHEL');
    const moi = await appel(`/api/moi?m=${m}`);
    expect(moi.body).toMatchObject({ nom: 'Paul JUHEL', metier: 'C.G.P', depot: null });

    const photo = await appel(`/api/photo?m=${m}`, { methode: 'PUT', corps: new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]) });
    expect(photo.res.status).toBe(200);
    const depot = await appel(`/api/depot?m=${m}`, { methode: 'POST', corps: { recherche: '  Marie   DUPONT – DRH ' } });
    expect(depot.body).toMatchObject({ slide_id: 101, a_photo: true, recherche: 'Marie DUPONT – DRH' });

    const relu = await appel(`/api/photo?m=${m}`);
    expect(relu.res.headers.get('Content-Type')).toBe('image/jpeg');
  });

  it('refuse une photo qui n\'est pas un JPEG', async () => {
    const m = await lienDe('Paul JUHEL');
    const { res } = await appel(`/api/photo?m=${m}`, { methode: 'PUT', corps: new Uint8Array([1]), type: 'image/png' });
    expect(res.status).toBe(400);
  });

  it('ne donne jamais accès au jeton Microsoft', async () => {
    await appel('/api/job/ms', { methode: 'PUT', admin: ADMIN, corps: { refresh_token: 'secret-ms', client_id: 'c' } });
    const m = await lienDe('Paul JUHEL');
    const { body } = await appel(`/api/moi?m=${m}`);
    expect(JSON.stringify(body)).not.toContain('secret-ms');
    expect((await appel('/api/job/entree')).res.status).toBe(401);
  });
});

describe('admin et job', () => {
  it('protège l\'admin par jeton', async () => {
    expect((await appel('/api/admin/etat')).res.status).toBe(401);
    expect((await appel('/api/admin/etat', { admin: 'mauvais' })).res.status).toBe(401);
  });

  it('crée un lien perso par membre, stable entre deux synchros', async () => {
    const avant = await lienDe('Céline GUIHO');
    await appel('/api/job/resultat', { methode: 'POST', admin: ADMIN, corps: { ok: true, membres: MEMBRES } });
    expect(await lienDe('Céline GUIHO')).toBe(avant);
    expect(avant).not.toBe(await lienDe('Paul JUHEL'));
  });

  it('donne les dépôts au job puis efface ceux appliqués', async () => {
    const m = await lienDe('Paul JUHEL');
    await appel(`/api/photo?m=${m}`, { methode: 'PUT', corps: new Uint8Array([0xff, 0xd8]) });
    const { body: entree } = await appel('/api/job/entree', { admin: ADMIN });
    expect(entree.depots).toHaveLength(1);
    const { slide_id, date } = entree.depots[0];

    await appel('/api/job/resultat', { methode: 'POST', admin: ADMIN, corps: { ok: true, message: '1 slide', appliques: [{ slide_id, date }] } });
    expect((await appel('/api/job/entree', { admin: ADMIN })).body.depots).toHaveLength(0);
    expect((await appel('/api/admin/etat', { admin: ADMIN })).body.dernier_run).toMatchObject({ ok: true, mis_a_jour: 1 });
  });

  it('garde un dépôt modifié pendant que le job tournait', async () => {
    const m = await lienDe('Paul JUHEL');
    await appel(`/api/depot?m=${m}`, { methode: 'POST', corps: { recherche: 'v1' } });
    const { body: entree } = await appel('/api/job/entree', { admin: ADMIN });
    await new Promise((r) => setTimeout(r, 5));
    await appel(`/api/depot?m=${m}`, { methode: 'POST', corps: { recherche: 'v2' } });

    await appel('/api/job/resultat', { methode: 'POST', admin: ADMIN, corps: { ok: true, appliques: [{ slide_id: 101, date: entree.depots[0].date }] } });
    const reste = (await appel('/api/job/entree', { admin: ADMIN })).body.depots;
    expect(reste).toHaveLength(1);
    expect(reste[0].recherche).toBe('v2');
  });

  it('stocke le jeton Microsoft en fusionnant la config', async () => {
    await appel('/api/job/ms', { methode: 'PUT', admin: ADMIN, corps: { refresh_token: 'r1', client_id: 'c', item_id: 'i', drive_id: 'd' } });
    await appel('/api/job/ms', { methode: 'PUT', admin: ADMIN, corps: { refresh_token: 'r2' } });
    const { body } = await appel('/api/job/entree', { admin: ADMIN });
    expect(body.ms).toEqual({ refresh_token: 'r2', client_id: 'c', item_id: 'i', drive_id: 'd' });
  });

  it('explique quand le bouton n\'est pas configuré', async () => {
    const { res } = await appel('/api/admin/appliquer', { methode: 'POST', admin: ADMIN });
    expect(res.status).toBe(501);
  });
});
