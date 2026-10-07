import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  agirConcours, participer, listerConcours, tirer, estOuvert, purgerConcours, csvParticipants, pageReglement,
} from '../src/concours.js';
import { envoyerAlertes, desabonner } from '../src/alerte.js';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

function kvMemoire() {
  const m = new Map();
  return {
    m,
    get: async (k, t) => (m.has(k) ? (t === 'json' ? JSON.parse(m.get(k)) : m.get(k)) : null),
    put: async (k, v) => { m.set(k, v); },
    delete: async (k) => { m.delete(k); },
    list: async ({ prefix }) => ({ keys: [...m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })) }),
  };
}

const CONCOURS = {
  id: 'nocturnes-parc', titre: 'Nocturnes du parc', lot: '2 × 4 entrées', partenaire: 'Parc de Test',
  villes: ['rennes'], nbGagnants: 2, debut: '2026-10-01', fin: '2026-10-18',
};

function formulaire(champs) {
  const f = new FormData();
  for (const [k, v] of Object.entries({ prenom: 'Léa', email: 'lea@example.org', ville: 'rennes', reglement: 'on', ...champs })) {
    if (v !== null) f.append(k, v);
  }
  return new Request('https://w/concours/nocturnes-parc/participer', { method: 'POST', body: f, headers: { 'CF-Connecting-IP': '1.1.1.1' } });
}

async function envAvecConcours() {
  const env = { VOTES: kvMemoire() };
  expect(await agirConcours(env, { action: 'enregistrer', concours: CONCOURS })).toEqual({ ok: true });
  return env;
}

describe('concours', () => {
  it('ouvert seulement entre les dates, et plus après le tirage', () => {
    expect(estOuvert(CONCOURS, new Date('2026-10-07T10:00:00Z'))).toBe(true);
    expect(estOuvert(CONCOURS, new Date('2026-10-18T21:00:00Z'))).toBe(true); // 23 h à Paris le dernier jour
    expect(estOuvert(CONCOURS, new Date('2026-10-19T08:00:00Z'))).toBe(false);
    expect(estOuvert({ ...CONCOURS, tirageLe: 'x' }, new Date('2026-10-07T10:00:00Z'))).toBe(false);
  });

  it('participation : règlement exigé, une seule par e-mail, alerte en option', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-07T10:00:00Z'));
    const env = await envAvecConcours();
    expect((await participer(formulaire({ reglement: null }), env, 'nocturnes-parc')).corps.erreurs.reglement).toBeTruthy();
    expect((await participer(formulaire({}), env, 'nocturnes-parc')).corps).toEqual({ ok: true });
    expect((await participer(formulaire({ email: 'LEA@example.org' }), env, 'nocturnes-parc')).corps).toEqual({ ok: true, deja: true });
    await participer(formulaire({ email: 'paul@example.org', prenom: 'Paul', alerte: 'on' }), env, 'nocturnes-parc');
    const { concours: [c] } = await listerConcours(env);
    expect(c).toMatchObject({ nbParticipants: 2, nbAlerte: 1, ouvert: true });
    // Seul Paul (case cochée) est abonné à l'alerte.
    expect([...env.VOTES.m.keys()].filter((k) => k.startsWith('alerte:abonne:'))).toHaveLength(1);
  });

  it('pas de tirage avant la clôture ; tirage tracé ; puis concours figé', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-07T10:00:00Z'));
    const env = await envAvecConcours();
    for (const n of ['a', 'b', 'c']) await participer(formulaire({ email: `${n}@example.org`, prenom: n }), env, 'nocturnes-parc');
    expect((await agirConcours(env, { action: 'tirer', id: 'nocturnes-parc' })).erreur).toMatch(/encore ouvert/);
    vi.setSystemTime(new Date('2026-10-20T10:00:00Z'));
    const r = await agirConcours(env, { action: 'tirer', id: 'nocturnes-parc' });
    expect(r).toMatchObject({ ok: true, parmi: 3 });
    expect(new Set(r.gagnants.map((g) => g.email)).size).toBe(2);
    expect((await agirConcours(env, { action: 'tirer', id: 'nocturnes-parc' })).erreur).toBe('déjà tiré');
    expect((await agirConcours(env, { action: 'enregistrer', concours: CONCOURS })).erreur).toMatch(/déjà tiré/);
    expect(await csvParticipants(env, 'nocturnes-parc')).toMatch(/^prenom;email;ville;alerte;le/);
  });

  it('purge 3 mois après le tirage, sans toucher aux abonnés de l\'alerte', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-07T10:00:00Z'));
    const env = await envAvecConcours();
    await participer(formulaire({ alerte: 'on' }), env, 'nocturnes-parc');
    vi.setSystemTime(new Date('2026-10-20T10:00:00Z'));
    await agirConcours(env, { action: 'tirer', id: 'nocturnes-parc' });
    expect((await purgerConcours(env, new Date('2026-12-01T00:00:00Z'))).purges).toBe(0);
    expect((await purgerConcours(env, new Date('2027-01-20T00:00:00Z'))).purges).toBe(1);
    const { concours: [c] } = await listerConcours(env);
    expect(c.nbParticipants).toBe(0);
    expect(c.gagnants[0].email).toBeUndefined();
    expect([...env.VOTES.m.keys()].some((k) => k.startsWith('alerte:abonne:'))).toBe(true);
  });

  it('tirage uniforme sans doublon, même si moins de participants que de lots', () => {
    expect(tirer([1, 2, 3], 5).sort()).toEqual([1, 2, 3]);
  });

  it('règlement : alerte facultative, durée de conservation, partenaire', () => {
    const html = pageReglement(CONCOURS);
    expect(html).toContain('décochée par défaut');
    expect(html).toContain('supprimés 3 mois après le tirage');
    expect(html).toContain('Parc de Test');
  });
});

describe('alerte : abonnés sans compte', () => {
  it('reçoivent l\'alerte sans Supabase, puis se désabonnent en un clic', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-07T10:00:00Z'));
    const env = await envAvecConcours();
    await participer(formulaire({ alerte: 'on' }), env, 'nocturnes-parc');
    const envois = [];
    vi.stubGlobal('fetch', vi.fn(async (url, o) => {
      const u = String(url);
      if (u.includes('/top?')) return Response.json({ top: [{ titre: 'Spectacle de marionnettes', horaires: '10h' }] });
      if (u.includes('api.resend.com')) { envois.push(JSON.parse(o.body)); return Response.json({ id: 'm' }); }
      throw new Error(u);
    }));
    const r = await envoyerAlertes({ ...env, RESEND_KEY: 'k', BASE_URL: 'https://w' }, new Date('2026-10-09T15:00:00Z'));
    expect(r).toMatchObject({ destinataires: 1, envoyes: 1 });
    expect(envois[0].to).toEqual(['lea@example.org']);
    expect(envois[0].html).not.toMatch(/\d ANS/); // âge inconnu : pas de libellé d'âge
    const jeton = envois[0].text.match(/jeton=([0-9a-f-]{36})/)[1];
    expect(await desabonner(env, jeton)).toEqual({ ok: true });
    expect([...env.VOTES.m.keys()].some((k) => k.startsWith('alerte:'))).toBe(false);
  });
});
