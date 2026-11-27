// Lancement des passages à l'heure de Paris (src/declenchement.js), porté par
// l'appel toutes les 15 min du script Gmail.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import worker from '../src/index.js';
import { passageDu, declencherSiDu } from '../src/declenchement.js';

class KVMemoire {
  constructor() { this.donnees = new Map(); }
  async get(cle, type) {
    if (!this.donnees.has(cle)) return null;
    const v = this.donnees.get(cle);
    return type === 'json' ? JSON.parse(v) : v;
  }
  async put(cle, valeur) { this.donnees.set(cle, valeur); }
  async delete(cle) { this.donnees.delete(cle); }
  async list({ prefix }) { return { keys: [...this.donnees.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })) }; }
}

const BASE = {
  GITHUB_REPO: 'exemple/depot', GITHUB_WORKFLOW: 'job.yml', GITHUB_WORKFLOW_NETTOYAGE: 'nettoyage.yml',
  GITHUB_REF: 'branche',
};
let env, appels;

function simulerGitHub(statuts) {
  appels = [];
  const file = [...statuts];
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
    appels.push({ url, corps: JSON.parse(init.body), auth: init.headers.Authorization });
    return new Response(null, { status: file.length > 1 ? file.shift() : file[0] });
  }));
}

beforeEach(() => {
  env = { ...BASE, KV: new KVMemoire(), GH_DISPATCH_TOKEN: 'jeton-test', WASSIM_AUTH_TOKEN: 'admin-secret' };
  simulerGitHub([204]);
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('passageDu (heure de Paris)', () => {
  it('heure d\'hiver : fenêtre de 3 h à partir de mercredi 19:05, jeudi 12:05, samedi 07:05', () => {
    // 2 décembre 2026 = mercredi, UTC+1
    expect(passageDu(new Date('2026-12-02T18:04:00Z'))).toBeNull(); // 19:04 Paris
    expect(passageDu(new Date('2026-12-02T18:05:00Z'))).toEqual({ creneau: '2026-12-02 mercredi soir', workflow: 'job', inputs: { cron: '5 18 * * 3' } });
    expect(passageDu(new Date('2026-12-02T21:04:00Z'))?.creneau).toBe('2026-12-02 mercredi soir');
    expect(passageDu(new Date('2026-12-02T21:05:00Z'))).toBeNull(); // 22:05 Paris
    expect(passageDu(new Date('2026-12-03T11:00:00Z'))).toBeNull(); // jeudi 12:00 Paris
    expect(passageDu(new Date('2026-12-03T11:15:00Z'))).toEqual({ creneau: '2026-12-03 jeudi midi', workflow: 'job', inputs: { cron: '0 11 * * 4' } });
    expect(passageDu(new Date('2026-12-05T06:00:00Z'))).toBeNull(); // samedi 07:00 Paris
    expect(passageDu(new Date('2026-12-05T06:15:00Z'))).toEqual({ creneau: '2026-12-05 samedi nettoyage', workflow: 'nettoyage', inputs: { mode: 'auto' } });
    expect(passageDu(new Date('2026-12-04T18:15:00Z'))).toBeNull(); // vendredi
  });

  it('heure d\'été', () => {
    // 3 juin 2026 = mercredi, UTC+2
    expect(passageDu(new Date('2026-06-03T16:15:00Z'))).toBeNull(); // 18:15 Paris
    expect(passageDu(new Date('2026-06-03T17:15:00Z'))?.creneau).toBe('2026-06-03 mercredi soir');
    expect(passageDu(new Date('2026-06-04T10:15:00Z'))?.creneau).toBe('2026-06-04 jeudi midi');
    expect(passageDu(new Date('2026-06-06T05:15:00Z'))?.creneau).toBe('2026-06-06 samedi nettoyage');
  });

  it('les valeurs « cron » envoyées au job sont reconnues par job.py et les workflows acceptent les entrées', () => {
    const job = readFileSync(new URL('../../../scripts/bni-infomerciales/job.py', import.meta.url), 'utf8');
    for (const cron of ['5 18 * * 3', '0 11 * * 4']) expect(job).toContain(`"${cron}"`);
    const wf = readFileSync(new URL('../../../.github/workflows/bni-infomerciales-job.yml', import.meta.url), 'utf8');
    expect(wf).toContain('CRON: ${{ github.event.schedule || inputs.cron }}');
    const net = readFileSync(new URL('../../../.github/workflows/bni-infomerciales-nettoyage.yml', import.meta.url), 'utf8');
    expect(net).toContain('options: [essai, forcer, auto]');
  });
});

describe('declencherSiDu', () => {
  it('lance le job du mercredi une seule fois par créneau, avec la branche et le cron', async () => {
    const trace = await declencherSiDu(env, new Date('2026-12-02T18:05:00Z'));
    expect(appels).toHaveLength(1);
    expect(appels[0].url).toBe('https://api.github.com/repos/exemple/depot/actions/workflows/job.yml/dispatches');
    expect(appels[0].corps).toEqual({ ref: 'branche', inputs: { cron: '5 18 * * 3' } });
    expect(appels[0].auth).toBe('Bearer jeton-test');
    expect(trace).toMatchObject({ creneau: '2026-12-02 mercredi soir', workflow: 'job', ok: true, statut: 204 });
    // appels suivants du script Gmail (toutes les 15 min) : rien de plus
    expect(await declencherSiDu(env, new Date('2026-12-02T18:20:00Z'))).toBeNull();
    expect(await declencherSiDu(env, new Date('2026-12-02T20:50:00Z'))).toBeNull();
    expect(appels).toHaveLength(1);
    // le créneau suivant repart
    await declencherSiDu(env, new Date('2026-12-03T11:05:00Z'));
    expect(appels).toHaveLength(2);
  });

  it('lance le nettoyage du samedi en mode auto', async () => {
    await declencherSiDu(env, new Date('2026-12-05T06:05:00Z'));
    expect(appels[0].url).toContain('/workflows/nettoyage.yml/dispatches');
    expect(appels[0].corps.inputs).toEqual({ mode: 'auto' });
  });

  it('ne fait rien hors créneau ni sans jeton', async () => {
    expect(await declencherSiDu(env, new Date('2026-12-02T17:05:00Z'))).toBeNull();
    delete env.GH_DISPATCH_TOKEN;
    expect(await declencherSiDu(env, new Date('2026-12-03T11:05:00Z'))).toBeNull();
    expect(appels).toHaveLength(0);
    expect(await env.KV.get('declenchements', 'json')).toBeNull();
  });

  it('erreur GitHub 5xx ou réseau : retenté à l\'appel suivant ; 4xx : pas d\'insistance', async () => {
    simulerGitHub([502, 204]);
    expect(await declencherSiDu(env, new Date('2026-12-03T11:05:00Z'))).toMatchObject({ ok: false, statut: 502 });
    expect(await declencherSiDu(env, new Date('2026-12-03T11:20:00Z'))).toMatchObject({ ok: true });
    expect(appels).toHaveLength(2);
    simulerGitHub([401]);
    expect(await declencherSiDu(env, new Date('2026-12-05T06:05:00Z'))).toMatchObject({ ok: false, statut: 401 });
    expect(await declencherSiDu(env, new Date('2026-12-05T06:20:00Z'))).toBeNull();
    expect(appels).toHaveLength(1);
    simulerGitHub([429, 204]);
    expect(await declencherSiDu(env, new Date('2026-12-10T11:05:00Z'))).toMatchObject({ ok: false, statut: 429 });
    expect(await declencherSiDu(env, new Date('2026-12-10T11:20:00Z'))).toMatchObject({ ok: true });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('réseau'); }));
    expect(await declencherSiDu(env, new Date('2026-12-09T18:05:00Z'))).toMatchObject({ ok: false, statut: -1 });
  });

  it('ne lève jamais, même si le KV tombe', async () => {
    env.KV = { get: async () => { throw new Error('KV'); } };
    expect(await declencherSiDu(env, new Date('2026-12-02T18:05:00Z'))).toBeNull();
  });

  it('garde au plus 20 traces', async () => {
    simulerGitHub([500]);
    for (let i = 0; i < 25; i++) await declencherSiDu(env, new Date('2026-12-03T11:05:00Z'));
    expect(await env.KV.get('declenchements', 'json')).toHaveLength(20);
  });
});

describe('routes', () => {
  const get = (chemin) => worker.fetch(new Request(`https://bni.test${chemin}`, { headers: { 'X-Wassim-Auth': 'admin-secret' } }), env);

  it('l\'appel 15 min du script Gmail lance le passage dû (heure réelle, pas ?maintenant=)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-12-02T18:10:00Z'));
    const res = await get('/api/admin/conference/notifications');
    expect(res.status).toBe(200);
    expect(appels.map((a) => a.corps.inputs)).toEqual([{ cron: '5 18 * * 3' }]);
    // un essai daté ne lance rien, même pendant une vraie fenêtre
    vi.setSystemTime(new Date('2026-12-03T11:10:00Z'));
    await get('/api/admin/conference/notifications?maintenant=2026-12-03T11:05:00Z');
    expect(appels).toHaveLength(1);
  });

  it('le bouton « Appliquer maintenant » lance un passage manuel (sans cron)', async () => {
    const res = await worker.fetch(new Request('https://bni.test/api/admin/appliquer', { method: 'POST', headers: { 'X-Wassim-Auth': 'admin-secret' } }), env);
    expect(res.status).toBe(200);
    expect(appels[0].corps).toEqual({ ref: 'branche' });
  });

  it('l\'essai du jeton lance un nettoyage à blanc', async () => {
    const res = await worker.fetch(new Request('https://bni.test/api/admin/essai-jeton', { method: 'POST', headers: { 'X-Wassim-Auth': 'admin-secret' } }), env);
    expect(res.status).toBe(200);
    expect(appels[0].url).toContain('/workflows/nettoyage.yml/dispatches');
    expect(appels[0].corps).toEqual({ ref: 'branche', inputs: { mode: 'essai' } });
  });
});
