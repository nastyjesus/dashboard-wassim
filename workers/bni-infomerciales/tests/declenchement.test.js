// Lancement des passages par les crons Cloudflare (src/declenchement.js).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import worker from '../src/index.js';
import { passageDu, declencherPlanifie } from '../src/declenchement.js';

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
  GITHUB_REF: 'branche', PAUSE_DECLENCHEMENT_MS: 0,
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
  env = { ...BASE, KV: new KVMemoire(), GH_DISPATCH_TOKEN: 'jeton-test' };
  simulerGitHub([204]);
});
afterEach(() => vi.unstubAllGlobals());

describe('passageDu (heure de Paris)', () => {
  it('heure d\'hiver : seuls les crons UTC qui tombent à la bonne heure de Paris déclenchent', () => {
    // 2 décembre 2026 = mercredi, UTC+1
    expect(passageDu(new Date('2026-12-02T17:05:00Z'))).toBeNull(); // 18:05 Paris
    expect(passageDu(new Date('2026-12-02T18:05:00Z'))).toEqual({ workflow: 'job', inputs: { cron: '5 18 * * 3' } });
    expect(passageDu(new Date('2026-12-03T10:05:00Z'))).toBeNull(); // jeudi 11:05 Paris
    expect(passageDu(new Date('2026-12-03T11:05:00Z'))).toEqual({ workflow: 'job', inputs: { cron: '0 11 * * 4' } });
    expect(passageDu(new Date('2026-12-05T05:05:00Z'))).toBeNull(); // samedi 06:05 Paris
    expect(passageDu(new Date('2026-12-05T06:05:00Z'))).toEqual({ workflow: 'nettoyage', inputs: { mode: 'auto' } });
  });

  it('heure d\'été : l\'autre cron UTC prend le relais', () => {
    // 3 juin 2026 = mercredi, UTC+2
    expect(passageDu(new Date('2026-06-03T17:05:00Z'))).toEqual({ workflow: 'job', inputs: { cron: '5 18 * * 3' } });
    expect(passageDu(new Date('2026-06-03T18:05:00Z'))).toBeNull(); // 20:05 Paris
    expect(passageDu(new Date('2026-06-04T10:00:00Z'))?.workflow).toBe('job');
    expect(passageDu(new Date('2026-06-04T11:00:00Z'))).toBeNull();
    expect(passageDu(new Date('2026-06-06T05:00:00Z'))?.workflow).toBe('nettoyage');
    expect(passageDu(new Date('2026-06-06T06:00:00Z'))).toBeNull();
  });

  it('les valeurs « cron » envoyées au job sont reconnues par job.py', () => {
    const job = readFileSync(new URL('../../../scripts/bni-infomerciales/job.py', import.meta.url), 'utf8');
    for (const cron of ['5 18 * * 3', '0 11 * * 4']) expect(job).toContain(`"${cron}"`);
    const wf = readFileSync(new URL('../../../.github/workflows/bni-infomerciales-job.yml', import.meta.url), 'utf8');
    expect(wf).toContain('CRON: ${{ github.event.schedule || inputs.cron }}');
    const net = readFileSync(new URL('../../../.github/workflows/bni-infomerciales-nettoyage.yml', import.meta.url), 'utf8');
    expect(net).toContain('options: [essai, forcer, auto]');
  });
});

describe('declencherPlanifie', () => {
  it('lance le job du mercredi avec la branche et le cron, et le trace', async () => {
    const trace = await declencherPlanifie(env, new Date('2026-12-02T18:05:00Z'));
    expect(appels).toHaveLength(1);
    expect(appels[0].url).toBe('https://api.github.com/repos/exemple/depot/actions/workflows/job.yml/dispatches');
    expect(appels[0].corps).toEqual({ ref: 'branche', inputs: { cron: '5 18 * * 3' } });
    expect(appels[0].auth).toBe('Bearer jeton-test');
    expect(trace).toMatchObject({ workflow: 'job', ok: true, statut: 204 });
    expect(await env.KV.get('declenchements', 'json')).toHaveLength(1);
  });

  it('lance le nettoyage du samedi en mode auto', async () => {
    await declencherPlanifie(env, new Date('2026-12-05T06:05:00Z'));
    expect(appels[0].url).toContain('/workflows/nettoyage.yml/dispatches');
    expect(appels[0].corps.inputs).toEqual({ mode: 'auto' });
  });

  it('ne fait rien hors de l\'heure de Paris', async () => {
    expect(await declencherPlanifie(env, new Date('2026-12-02T17:05:00Z'))).toBeNull();
    expect(appels).toHaveLength(0);
    expect(await env.KV.get('declenchements', 'json')).toBeNull();
  });

  it('sans jeton : aucun appel, mais la trace dit pourquoi', async () => {
    delete env.GH_DISPATCH_TOKEN;
    const trace = await declencherPlanifie(env, new Date('2026-12-03T11:05:00Z'));
    expect(appels).toHaveLength(0);
    expect(trace).toMatchObject({ ok: false, statut: 0 });
  });

  it('réessaie sur erreur GitHub 5xx, pas sur 4xx', async () => {
    simulerGitHub([502, 204]);
    expect(await declencherPlanifie(env, new Date('2026-12-03T11:05:00Z'))).toMatchObject({ ok: true });
    expect(appels).toHaveLength(2);
    simulerGitHub([401]);
    expect(await declencherPlanifie(env, new Date('2026-12-03T11:05:00Z'))).toMatchObject({ ok: false, statut: 401 });
    expect(appels).toHaveLength(1);
  });

  it('garde au plus 20 traces', async () => {
    for (let i = 0; i < 25; i++) await declencherPlanifie(env, new Date('2026-12-03T11:05:00Z'));
    expect(await env.KV.get('declenchements', 'json')).toHaveLength(20);
  });
});

describe('worker.scheduled et bouton admin', () => {
  it('le handler scheduled passe l\'heure du cron', async () => {
    const attente = [];
    await worker.scheduled({ scheduledTime: Date.parse('2026-12-02T18:05:00Z') }, env, { waitUntil: (p) => attente.push(p) });
    await Promise.all(attente);
    expect(appels).toHaveLength(1);
    expect(appels[0].corps.inputs.cron).toBe('5 18 * * 3');
  });

  it('le bouton « Appliquer maintenant » lance un passage manuel (sans cron)', async () => {
    env.WASSIM_AUTH_TOKEN = 'admin-secret';
    const res = await worker.fetch(new Request('https://bni.test/api/admin/appliquer', { method: 'POST', headers: { 'X-Wassim-Auth': 'admin-secret' } }), env);
    expect(res.status).toBe(200);
    expect(appels[0].corps).toEqual({ ref: 'branche' });
  });
});
