import { describe, it, expect, vi, afterEach } from 'vitest';
import { QUOTAS, verifierQuota, debutDuMois, messageQuota } from '../src/quotas.js';
import {
  extraireAgeMois, extrairePrenom, lireMiseEnRoute, naissanceDepuisAge, ageLisible, messageBienvenue,
} from '../src/accueil.js';
import { normaliserNumero, hacherNumero } from '../src/identite.js';
import * as db from '../src/supabase.js';
import worker from '../src/index.js';

const MAINTENANT = new Date('2026-10-23T15:00:00Z');

afterEach(() => { vi.unstubAllGlobals(); });

describe('quotas', () => {
  it('reprend les plafonds de la spec', () => {
    expect(QUOTAS).toEqual({ sos: 5, activite: 5, histoire: 5, plan: 2 });
  });

  it('sous le plafond : ok, avec le reste', () => {
    expect(verifierQuota({}, 'sos', 3)).toEqual({ ok: true, restant: 2 });
  });

  it('pile au plafond : refusé', () => {
    expect(verifierQuota({}, 'plan', 2)).toEqual({ ok: false, restant: 0 });
  });

  it('un abonné passe toujours', () => {
    expect(verifierQuota({ abonne: true }, 'sos', 99).ok).toBe(true);
  });

  it('brique inconnue : erreur franche', () => {
    expect(() => verifierQuota({}, 'couple', 0)).toThrow('brique inconnue');
  });

  it('le mois commence le 1er à minuit UTC', () => {
    expect(debutDuMois(MAINTENANT)).toBe('2026-10-01T00:00:00.000Z');
  });

  it('message de quota avec et sans lien', () => {
    expect(messageQuota('histoire', 'https://papaparfait.fr/abonnement')).toContain('5 histoires du soir');
    expect(messageQuota('plan')).toMatch(/2 plans du week-end gratuits.*1er du mois prochain\.$/);
  });
});

describe('mise en route : prénom et âge', () => {
  it.each([
    ['Léo, 4 ans', 'Léo', 48],
    ['ma fille Jade a 2 ans et demi', 'Jade', 30],
    ["il s'appelle Tom et il a 18 mois", 'Tom', 18],
    ['leo 4 ans', 'Leo', 48],
    ['Salut ! Inès, 6 ans', 'Inès', 72],
    ['Bonjour, mon fils Noé a 3 ans 1/2', 'Noé', 42],
    ["c'est Anne-Sophie, 7 ans", 'Anne-Sophie', 84],
    ['jean-baptiste 5 ans', 'Jean-Baptiste', 60],
  ])('« %s » → %s, %i mois', (texte, prenom, mois) => {
    expect(extrairePrenom(texte)).toBe(prenom);
    expect(extraireAgeMois(texte)).toBe(mois);
  });

  it('sans âge : pas de mise en route', () => {
    expect(lireMiseEnRoute('Il s’appelle Léo')).toBeNull();
  });

  it('sans prénom : pas de mise en route', () => {
    expect(lireMiseEnRoute('il a 4 ans')).toBeNull();
  });

  it('âge hors cible (plus de 12 ans) : refusé', () => {
    expect(extraireAgeMois('Tom 15 ans')).toBeNull();
  });

  it('naissance = 1er du mois, jamais la date exacte', () => {
    expect(naissanceDepuisAge(48, MAINTENANT)).toBe('2022-10-01');
    expect(lireMiseEnRoute('Léo, 4 ans', MAINTENANT)).toEqual({ prenom: 'Léo', naissance: '2022-10-01' });
  });

  it('âge lisible en mois avant 2 ans, en ans ensuite', () => {
    expect(ageLisible('2025-04-01', MAINTENANT)).toBe('18 mois');
    expect(ageLisible('2022-10-01', MAINTENANT)).toBe('4 ans');
  });

  it('bienvenue avec les quatre briques', () => {
    const m = messageBienvenue({ prenom: 'Léo', naissance: '2022-10-01' }, MAINTENANT);
    expect(m).toContain('Léo, 4 ans');
    for (const e of ['🆘', '🏠', '🌙', '🗓️']) expect(m).toContain(e);
  });
});

describe('identité WhatsApp', () => {
  it('normalise les formats de numéro', () => {
    expect(normaliserNumero('+33 6 12 34 56 78')).toBe('33612345678');
    expect(normaliserNumero('0612345678')).toBe('33612345678');
    expect(normaliserNumero('0033612345678')).toBe('33612345678');
  });

  it('même numéro, même empreinte ; jamais le numéro en clair', async () => {
    const a = await hacherNumero('+33 6 12 34 56 78', 'sel');
    const b = await hacherNumero('0612345678', 'sel');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toContain('612345678');
  });

  it('le sel change l’empreinte', async () => {
    expect(await hacherNumero('0612345678', 'a')).not.toBe(await hacherNumero('0612345678', 'b'));
  });

  it('sans sel : erreur', async () => {
    await expect(hacherNumero('0612345678', '')).rejects.toThrow('WA_SEL');
  });
});

describe('accès Supabase', () => {
  const ENV = { SUPABASE_URL: 'https://x.supabase.co/', SUPABASE_SERVICE_KEY: 'service' };

  it('cherche un papa par empreinte, avec la clé service', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify([{ id: 'p1' }]), { status: 200 }));
    vi.stubGlobal('fetch', f);
    expect(await db.trouverPapa(ENV, { waHash: 'abc' })).toEqual({ id: 'p1' });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://x.supabase.co/rest/v1/papas?wa_hash=eq.abc&select=*&limit=1');
    expect(init.headers.Authorization).toBe('Bearer service');
  });

  it('papa inconnu : null', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', { status: 200 })));
    expect(await db.trouverPapa(ENV, { authId: 'u1' })).toBeNull();
  });

  it('compte l’usage par Content-Range', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 200, headers: { 'content-range': '0-2/3' } })));
    expect(await db.compterUsage(ENV, 'p1', 'sos', '2026-10-01T00:00:00.000Z')).toBe(3);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 200, headers: { 'content-range': '*/0' } })));
    expect(await db.compterUsage(ENV, 'p1', 'sos', '2026-10-01T00:00:00.000Z')).toBe(0);
  });

  it('coupe un souvenir à 500 caractères', async () => {
    const f = vi.fn(async () => new Response(null, { status: 201 }));
    vi.stubGlobal('fetch', f);
    await db.ajouterSouvenir(ENV, 'e1', { type: 'journee', texte: 'x'.repeat(800) });
    expect(JSON.parse(f.mock.calls[0][1].body).texte).toHaveLength(500);
  });

  it('effacer : un DELETE sur le papa (la cascade fait le reste)', async () => {
    const f = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', f);
    await db.effacerPapa(ENV, 'p1');
    expect(f.mock.calls[0][0]).toBe('https://x.supabase.co/rest/v1/papas?id=eq.p1');
    expect(f.mock.calls[0][1].method).toBe('DELETE');
  });

  it('erreur HTTP : SupabaseErreur avec le statut', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })));
    await expect(db.enfantsDe(ENV, 'p1')).rejects.toMatchObject({ status: 500 });
  });

  it('non configuré : 503', async () => {
    await expect(db.enfantsDe({}, 'p1')).rejects.toMatchObject({ status: 503 });
  });
});

describe('worker', () => {
  it('/health répond, sans rien révéler des secrets', async () => {
    const r = await worker.fetch(new Request('https://w/health'), { SUPABASE_URL: 'u', SUPABASE_SERVICE_KEY: 'k' });
    expect(r.status).toBe(200);
    const corps = await r.json();
    expect(corps).toMatchObject({ ok: true, worker: 'copilote-papa', supabase: true });
    expect(JSON.stringify(corps)).not.toContain('"k"');
  });

  it('route inconnue : 404', async () => {
    const r = await worker.fetch(new Request('https://w/nimporte'), {});
    expect(r.status).toBe(404);
  });
});
