import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  prochainSamedi, libelleDate, sujetAlerte, corpsAlerte, echapper, envoyerAlertes, desabonner,
} from '../src/alerte.js';
import { VILLES, villeParId } from '../src/villes.js';

const RENNES = villeParId('rennes');
const TOP = [
  { titre: 'Conte pour bébé', horaires: '10h30', ville: 'Vern-sur-Seiche', distanceKm: 10 },
  { titre: 'Les mercredis de Quincé', horaires: null, ville: 'Rennes', distanceKm: 2.8 },
];

afterEach(() => { vi.unstubAllGlobals(); });

describe('dates', () => {
  it('vise le samedi qui vient depuis un vendredi', () => {
    // 25 septembre 2026 est un vendredi.
    expect(prochainSamedi(new Date('2026-09-25T15:00:00Z'))).toBe('2026-09-26');
  });

  it('un samedi, vise le jour même', () => {
    expect(prochainSamedi(new Date('2026-09-26T09:00:00Z'))).toBe('2026-09-26');
  });

  it('écrit la date en français', () => {
    expect(libelleDate('2026-09-26')).toBe('samedi 26 septembre');
  });
});

describe('objet de l’e-mail', () => {
  it('annonce le nombre de sorties et la ville', () => {
    expect(sujetAlerte(TOP, RENNES, '2026-09-26')).toBe('samedi 26 septembre à Rennes : 2 sorties pour toi');
  });

  it('nomme la sortie quand il n’y en a qu’une', () => {
    expect(sujetAlerte([TOP[0]], RENNES, '2026-09-26'))
      .toBe('samedi 26 septembre à Rennes : Conte pour bébé');
  });
});

describe('corps de l’e-mail', () => {
  const rendu = () => corpsAlerte({
    prenom: 'Wassim', top: TOP, ville: RENNES, age: 2,
    dateISO: '2026-09-26', lienDesabo: 'https://exemple.test/desabonnement?jeton=abc',
  });

  it('contient les sorties, le lien vers le top pré-rempli et le désabonnement', () => {
    const { html, texte } = rendu();
    expect(html).toContain('Conte pour bébé');
    expect(html).toContain('Les mercredis de Quincé');
    expect(html).toContain('?ville=rennes&age=2');
    expect(html).toContain('https://exemple.test/desabonnement?jeton=abc');
    expect(texte).toContain('1. Conte pour bébé');
    expect(texte).toContain('Me désabonner');
  });

  it('échappe le HTML des titres, qui viennent d’agendas publics', () => {
    const { html } = corpsAlerte({
      prenom: null,
      top: [{ titre: '<script>alert(1)</script>', horaires: null, ville: 'Rennes', distanceKm: 1 }],
      ville: RENNES, age: 3, dateISO: '2026-09-26', lienDesabo: 'https://exemple.test/d',
    });
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
  });

  it('échapper rend une chaîne vide sur null', () => {
    expect(echapper(null)).toBe('');
  });
});

describe('envoi', () => {
  const envComplet = (extra = {}) => ({
    SUPABASE_URL: 'https://projet.supabase.test',
    SUPABASE_SERVICE_KEY: 'service-key',
    RESEND_KEY: 'resend-key',
    BASE_URL: 'https://worker.test',
    ...extra,
  });

  const PROFIL = {
    id: 'u1', prenom: 'Wassim', age: 2, ville_id: 'rennes',
    alerte_jeton: '11111111-2222-4333-8444-555555555555', alerte_envoyee_le: null,
  };

  /** Simule Supabase, notre propre /top et Resend. */
  function stub({ profils, top }) {
    const envoyes = [];
    const patchs = [];
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      const u = String(url);
      if (u.includes('/rest/v1/profils') && options?.method === 'PATCH') {
        patchs.push(u);
        return new Response('[]', { status: 200 });
      }
      if (u.includes('/rest/v1/profils')) return Response.json(profils);
      if (u.includes('/auth/v1/admin/users/')) return Response.json({ email: 'papa@exemple.fr' });
      if (u.includes('/top?')) return Response.json({ top });
      if (u.includes('api.resend.com')) {
        envoyes.push(JSON.parse(options.body));
        return Response.json({ id: 'msg_1' });
      }
      throw new Error(`appel inattendu : ${u}`);
    }));
    return { envoyes, patchs };
  }

  it('envoie un e-mail par papa et marque l’envoi', async () => {
    const { envoyes, patchs } = stub({ profils: [PROFIL], top: TOP });
    const resume = await envoyerAlertes(envComplet(), new Date('2026-09-25T15:00:00Z'));
    expect(resume).toMatchObject({ destinataires: 1, envoyes: 1, silences: 0 });
    expect(envoyes[0].to).toEqual(['papa@exemple.fr']);
    expect(envoyes[0].subject).toContain('samedi 26 septembre à Rennes');
    expect(patchs).toHaveLength(1);
  });

  it('n’envoie rien quand le top est vide — le silence vaut mieux', async () => {
    const { envoyes } = stub({ profils: [PROFIL], top: [] });
    const resume = await envoyerAlertes(envComplet(), new Date('2026-09-25T15:00:00Z'));
    expect(resume).toMatchObject({ envoyes: 0, silences: 1 });
    expect(envoyes).toHaveLength(0);
  });

  it('ignore un papa dont la ville a été fermée depuis son inscription', async () => {
    const { envoyes } = stub({ profils: [{ ...PROFIL, ville_id: 'caen' }], top: TOP });
    const resume = await envoyerAlertes(envComplet(), new Date('2026-09-25T15:00:00Z'));
    expect(resume).toMatchObject({ envoyes: 0, silences: 1 });
    expect(envoyes).toHaveLength(0);
  });

  it('ne demande qu’un seul top pour deux papas de la même ville et du même âge', async () => {
    stub({ profils: [PROFIL, { ...PROFIL, id: 'u2' }], top: TOP });
    await envoyerAlertes(envComplet(), new Date('2026-09-25T15:00:00Z'));
    const appelsTop = fetch.mock.calls.filter(([u]) => String(u).includes('/top?'));
    expect(appelsTop).toHaveLength(1);
  });

  it('ne fait rien, sans échouer, si les secrets manquent', async () => {
    const resume = await envoyerAlertes({ SUPABASE_URL: 'https://x.test' });
    expect(resume.ignore).toContain('SUPABASE_SERVICE_KEY');
  });

  it('une adresse en erreur ne prive pas les autres', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      const u = String(url);
      if (u.includes('/rest/v1/profils') && options?.method === 'PATCH') return new Response('[]');
      if (u.includes('/rest/v1/profils')) return Response.json([PROFIL, { ...PROFIL, id: 'u2' }]);
      if (u.includes('/auth/v1/admin/users/u1')) return new Response('nope', { status: 500 });
      if (u.includes('/auth/v1/admin/users/')) return Response.json({ email: 'papa2@exemple.fr' });
      if (u.includes('/top?')) return Response.json({ top: TOP });
      if (u.includes('api.resend.com')) return Response.json({ id: 'msg' });
      throw new Error(`appel inattendu : ${u}`);
    }));
    const resume = await envoyerAlertes(envComplet(), new Date('2026-09-25T15:00:00Z'));
    expect(resume).toMatchObject({ destinataires: 2, envoyes: 1, silences: 1 });
  });
});

describe('désabonnement', () => {
  it('refuse un jeton qui n’a pas la forme d’un identifiant', async () => {
    const r = await desabonner({ SUPABASE_URL: 'x', SUPABASE_SERVICE_KEY: 'y' }, 'bidon');
    expect(r.ok).toBe(false);
  });

  it('coupe l’alerte quand le jeton correspond', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json([{ id: 'u1' }])));
    const r = await desabonner(
      { SUPABASE_URL: 'https://p.test', SUPABASE_SERVICE_KEY: 'k' },
      '11111111-2222-4333-8444-555555555555',
    );
    expect(r.ok).toBe(true);
  });

  it('dit non quand le jeton ne correspond à personne', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json([])));
    const r = await desabonner(
      { SUPABASE_URL: 'https://p.test', SUPABASE_SERVICE_KEY: 'k' },
      '11111111-2222-4333-8444-555555555555',
    );
    expect(r.ok).toBe(false);
  });
});

describe('villes du worker', () => {
  it('reste alignée sur la liste de l’app (18 villes, 8 départements)', () => {
    // Si ce test tombe, c'est qu'une zone a été ouverte d'un seul côté :
    // mettre à jour apps/on-sort/src/config.js ET workers/on-sort/src/villes.js.
    expect(VILLES).toHaveLength(18);
    expect(new Set(VILLES.map((v) => v.code)).size).toBe(8);
  });
});
