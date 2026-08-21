import { describe, it, expect, vi, afterEach } from 'vitest';
import worker from '../src/index.js';

const CTX = { waitUntil() {} };

function envMock(extra = {}) {
  return {
    MOCK_MODE: 'true',
    ALLOWED_ORIGINS: 'http://localhost:3000',
    ODS_BASE: 'https://ods.example/records',
    DATATOURISME_ENDPOINTS: 'https://dt.example/api/open/evenements.json',
    METEO_BASE: 'https://meteo.example/v1/forecast',
    ...extra,
  };
}

async function appel(path, env) {
  const res = await worker.fetch(new Request(`https://on-sort-poc.test${path}`), env, CTX);
  return { res, body: await res.json() };
}

// Réponses simulées des APIs externes pour le mode live.
function stubFetchLive() {
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    const u = String(url);
    if (u.startsWith('https://ods.example/')) {
      return Response.json({
        results: [
          {
            uid: 1, title_fr: 'Heure du conte des tout-petits',
            description_fr: 'Contes et comptines pour les enfants de 0 à 3 ans. Entrée libre.',
            keywords_fr: ['jeune public'],
            firstdate_begin: '2026-08-22T10:30:00+02:00', lastdate_end: '2026-08-22T11:30:00+02:00',
            daterange_fr: 'Samedi 22 août, 10h30',
            location_name: 'Médiathèque', location_address: '2 rue du Théâtre',
            location_postalcode: '35170', location_city: 'Bruz',
            location_coordinates: { lat: 48.024, lon: -1.745 },
            canonicalurl: 'https://openagenda.example/e/1',
            conditions_fr: 'Gratuit',
          },
          {
            uid: 2, title_fr: 'Balade nature en famille',
            description_fr: 'Sortie plein air dès 3 ans dans le parc.',
            keywords_fr: ['famille'],
            firstdate_begin: '2026-08-20T14:00:00+02:00', lastdate_end: '2026-08-23T18:00:00+02:00',
            location_city: 'Rennes', location_coordinates: { lat: 48.13, lon: -1.65 },
          },
          {
            uid: 3, title_fr: 'Conférence fiscalité des entreprises',
            description_fr: 'Public adulte.',
            firstdate_begin: '2026-08-22T18:00:00+02:00', lastdate_end: '2026-08-22T20:00:00+02:00',
            location_city: 'Rennes', location_coordinates: { lat: 48.11, lon: -1.67 },
          },
        ],
      });
    }
    if (u.startsWith('https://meteo.example/')) {
      return Response.json({
        daily: {
          time: ['2026-08-22'], weather_code: [61],
          temperature_2m_max: [15.2], precipitation_probability_max: [80],
        },
      });
    }
    // DATAtourisme : la sonde échoue proprement (endpoint pas encore confirmé)
    return new Response('not found', { status: 404 });
  }));
}

afterEach(() => vi.unstubAllGlobals());

describe('/health', () => {
  it('répond ok avec l’état mock', async () => {
    const { res, body } = await appel('/health', envMock());
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.mock).toBe(true);
  });
});

describe('/top en mode mock', () => {
  it('renvoie un top marqué mock:true, scoré et trié', async () => {
    const { res, body } = await appel('/top?date=2026-08-22', envMock());
    expect(res.status).toBe(200);
    expect(body.mock).toBe(true);
    expect(body.top.length).toBeGreaterThanOrEqual(4);
    expect(body.preferee.titre).toContain('DÉMO');
    // La conférence adulte du jeu de démo est exclue par le scoring.
    expect(body.top.every((e) => !e.titre.includes('Conférence'))).toBe(true);
    // Il pleut dans la météo de démo : la préférée est un événement intérieur.
    expect(body.preferee.lieuType).toBe('interieur');
  });
});

describe('/top en mode live (APIs simulées)', () => {
  it('agrège OpenAgenda, filtre par date, score avec la météo', async () => {
    stubFetchLive();
    const { res, body } = await appel('/top?date=2026-08-22&age=3', envMock({ MOCK_MODE: 'false' }));
    expect(res.status).toBe(200);
    expect(body.mock).toBe(false);
    expect(body.sources.openagenda).toMatchObject({ ok: true, count: 3 });
    expect(body.sources.datatourisme.ok).toBe(false);
    expect(body.meteo.pluie).toBe(true);
    // La conférence adulte est exclue, le conte (intérieur) passe devant la
    // balade (extérieur) puisqu'il pleut.
    expect(body.stats.retenus).toBe(2);
    expect(body.preferee.titre).toContain('conte');
    expect(body.preferee.raisons).toContain('Gratuit');
  });

  it('survit à une panne des sources (réponse vide, pas de 500)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 503 })));
    const { res, body } = await appel('/top?date=2026-08-22', envMock({ MOCK_MODE: 'false' }));
    expect(res.status).toBe(200);
    expect(body.top).toEqual([]);
    expect(body.sources.openagenda.ok).toBe(false);
  });
});

describe('/diagnostic', () => {
  it('en mock : dit que le diagnostic ne se lit pas sur du fictif', async () => {
    const { body } = await appel('/diagnostic', envMock());
    expect(body.mock).toBe(true);
  });

  it('en live : comptages famille, erreurs de sonde DATAtourisme et verdict', async () => {
    stubFetchLive();
    const { body } = await appel('/diagnostic?date=2026-08-22', envMock({ MOCK_MODE: 'false' }));
    expect(body.openagenda.count).toBe(3);
    expect(body.openagenda.familleExplicite).toBeGreaterThanOrEqual(2);
    expect(body.openagenda.echantillonFamille.length).toBeGreaterThan(0);
    expect(body.datatourisme.ok).toBe(false);
    expect(body.datatourisme.erreursSondees.length).toBeGreaterThan(0);
    expect(body.verdict).toContain('re-tester');
  });
});

describe('routes inconnues', () => {
  it('404 JSON', async () => {
    const { res, body } = await appel('/nimporte', envMock());
    expect(res.status).toBe(404);
    expect(body.error).toBe('not_found');
  });
});
