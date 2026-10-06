import { describe, it, expect } from 'vitest';
import worker from '../src/index.js';
import {
  cleEvenement, nettoyerChamps, nettoyerManuel, manuelActif, appliquerSurcouche,
  appliquerAction, surcoucheVide,
} from '../src/admin/surcouche.js';
import { evaluer, top } from '../src/scoring.js';

const CTX = { waitUntil() {} };
const JETON = 'jeton-de-test-assez-long';

function kvSimule() {
  const donnees = new Map();
  return {
    get: async (cle) => (donnees.has(cle) ? donnees.get(cle) : null),
    put: async (cle, valeur) => { donnees.set(cle, valeur); },
    list: async ({ prefix }) => ({ keys: [...donnees.keys()].filter((c) => c.startsWith(prefix)).map((name) => ({ name })) }),
  };
}

function envAdmin(extra = {}) {
  return { MOCK_MODE: 'true', ALLOWED_ORIGINS: '*', ADMIN_TOKEN: JETON, VOTES: kvSimule(), ...extra };
}

async function appel(env, path, { jeton = JETON, corps } = {}) {
  const headers = {};
  if (jeton) headers.Authorization = `Bearer ${jeton}`;
  if (corps) headers['Content-Type'] = 'application/json';
  const res = await worker.fetch(new Request(`https://on-sort-poc.test${path}`, {
    method: corps ? 'POST' : 'GET', headers, body: corps ? JSON.stringify(corps) : undefined,
  }), env, CTX);
  const texte = await res.text();
  let body = texte;
  try { body = JSON.parse(texte); } catch { /* HTML */ }
  return { res, body };
}

const titresTop = async (env, q = '') => (await appel(env, `/top?date=2026-10-10${q}`, { jeton: null })).body.top.map((e) => e.id);

describe('surcouche : fonctions pures', () => {
  it('clé = source + identifiant, ou titre + jour sans identifiant', () => {
    expect(cleEvenement({ origine: 'openagenda', id: '42' })).toBe('openagenda:42');
    expect(cleEvenement({ origine: 'datatourisme', titre: 'Heure du Conte !', dateDebut: '2026-10-10' }))
      .toBe('datatourisme:heure-du-conte@2026-10-10');
  });

  it('nettoie les champs corrigés et refuse les valeurs louches', () => {
    expect(nettoyerChamps({ titre: '  Atelier  ', inconnu: 'x', lat: '48.1', gratuit: 'true', ageMin: '3', description: '' }))
      .toEqual({ champs: { titre: 'Atelier', lat: 48.1, gratuit: true, ageMin: 3 } });
    expect(nettoyerChamps({ url: 'javascript:alert(1)' }).erreur).toMatch(/url/);
    expect(nettoyerChamps({ lat: 120 }).erreur).toMatch(/lat/);
    expect(nettoyerChamps({ ageMin: 6, ageMax: 3 }).erreur).toMatch(/ageMax/);
    expect(nettoyerChamps({ dateDebut: '10/10/2026' }).erreur).toMatch(/AAAA/);
  });

  it('une sortie manuelle exige titre, date et position', () => {
    expect(nettoyerManuel({ titre: 'X', dateDebut: '2026-10-10' }).erreur).toMatch(/position/);
    const { manuel } = nettoyerManuel({ titre: 'X', dateDebut: '2026-10-10', lat: 48, lon: -1.6, jours: [6, 6, 9] });
    expect(manuel).toMatchObject({ dateFin: '2026-10-10', jours: [6] });
  });

  it('récurrence : plage de dates et jours de la semaine', () => {
    const chaqueSamedi = { dateDebut: '2026-10-01', dateFin: '2026-12-31', jours: [6] };
    expect(manuelActif(chaqueSamedi, '2026-10-10')).toBe(true); // samedi
    expect(manuelActif(chaqueSamedi, '2026-10-11')).toBe(false); // dimanche
    expect(manuelActif(chaqueSamedi, '2027-01-02')).toBe(false); // après la plage
    expect(manuelActif({ dateDebut: '2026-10-10', dateFin: '2026-10-12', jours: [] }, '2026-10-11')).toBe(true);
  });

  it('applique masquage, correction, épingle et ajoute les manuelles en tête', () => {
    const s = surcoucheVide();
    s.masques['oa:1'] = { le: 'x' };
    s.corrections['oa:2'] = { champs: { titre: 'Titre corrigé' } };
    s.epingles['oa:3'] = { le: 'x' };
    s.manuels['manuel:abc'] = { titre: 'Ma sortie', dateDebut: '2026-10-10', dateFin: '2026-10-10', jours: [], lat: 48, lon: -1 };
    const evs = [1, 2, 3].map((i) => ({ origine: 'oa', id: String(i), titre: `T${i}` }));

    const vus = appliquerSurcouche(evs, s, '2026-10-10');
    expect(vus.map((e) => e.cle)).toEqual(['manuel:abc', 'oa:2', 'oa:3']);
    expect(vus[0]).toMatchObject({ origine: 'manuel', force: true });
    expect(vus[1]).toMatchObject({ titre: 'Titre corrigé', corrige: ['titre'] });
    expect(vus[2]).toMatchObject({ epingle: true, force: true });

    const admin = appliquerSurcouche(evs, s, '2026-10-10', { garderMasques: true });
    expect(admin.find((e) => e.cle === 'oa:1').masque).toBe(true);
    expect(appliquerSurcouche(evs, s, '2026-10-11').some((e) => e.origine === 'manuel')).toBe(false);
  });

  it('chaque action passe au journal avec l’état d’avant ; annuler le remet', () => {
    const r1 = appliquerAction(surcoucheVide(), { type: 'masquer', cle: 'oa:1', titre: 'T1', raison: 'adulte' });
    expect(r1.surcouche.masques['oa:1'].raison).toBe('adulte');
    expect(r1.entree).toMatchObject({ type: 'masquer', section: 'masques', cle: 'oa:1', avant: null });
    expect(r1.surcouche.version).toBe(1);

    const r2 = appliquerAction(r1.surcouche, { type: 'annuler', journalId: r1.entree.id }, new Date(), [r1.entree]);
    expect(r2.surcouche.masques['oa:1']).toBeUndefined();
    expect(r2.entree.type).toBe('annuler');

    expect(appliquerAction(surcoucheVide(), { type: 'corriger', cle: 'oa:1', champs: {} }).surcouche.corrections)
      .toEqual({}); // une correction vide efface
    expect(appliquerAction(surcoucheVide(), { type: 'detruire', cle: 'x' }).erreur).toBeTruthy();
    expect(appliquerAction(surcoucheVide(), { type: 'enregistrer-manuel', cle: 'openagenda:1', manuel: { titre: 'X', dateDebut: '2026-10-10', lat: 1, lon: 1 } }).erreur)
      .toMatch(/clé/);
  });
});

describe('scoring : motif d’exclusion et sorties forcées', () => {
  const ctx = { dateISO: '2026-10-10', lat: 48.1173, lon: -1.6778, age: 3, rayonKm: 40, meteo: null };
  const neutre = { titre: 'Réunion publique', description: 'Ordre du jour', lat: 48.11, lon: -1.68 };

  it('dit pourquoi une sortie est écartée', () => {
    expect(evaluer(neutre, ctx).exclu).toBe('pas-de-signal-enfant');
    expect(evaluer({ ...neutre, titre: 'Atelier enfants dès 3 ans', lat: 47.2, lon: -1.55 }, ctx))
      .toMatchObject({ exclu: 'hors-rayon' });
    expect(evaluer({ ...neutre, titre: 'Spectacle jeune public', ageMin: 6 }, ctx).exclu).toBe('trop-jeune');
  });

  it('une sortie forcée passe le filtre de contenu, pas celui de distance', () => {
    expect(evaluer({ ...neutre, force: true }, ctx).exclu).toBeUndefined();
    expect(evaluer({ ...neutre, force: true, lat: 47.2, lon: -1.55 }, ctx).exclu).toBe('hors-rayon');
  });

  it('une épinglée passe devant un meilleur score', () => {
    const fort = { titre: 'Spectacle jeune public marionnettes dès 3 ans, gratuit', lat: 48.11, lon: -1.68 };
    const faible = { ...neutre, titre: 'Lecture', epingle: true, force: true };
    expect(top([fort, faible], ctx).top[0].titre).toBe('Lecture');
  });
});

describe('/admin : accès', () => {
  it('sert la page sans donnée, non indexable', async () => {
    const { res, body } = await appel(envAdmin(), '/admin', { jeton: null });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toMatch(/text\/html/);
    expect(res.headers.get('Content-Security-Policy')).toMatch(/frame-ancestors 'none'/);
    expect(body).toContain('QG Admin');
  });

  it('fermée (503) tant que ADMIN_TOKEN n’est pas posé', async () => {
    const { res } = await appel(envAdmin({ ADMIN_TOKEN: undefined }), '/admin/api/moi');
    expect(res.status).toBe(503);
  });

  it('401 sans jeton ou avec un mauvais jeton', async () => {
    expect((await appel(envAdmin(), '/admin/api/moi', { jeton: null })).res.status).toBe(401);
    expect((await appel(envAdmin(), '/admin/api/moi', { jeton: 'faux' })).res.status).toBe(401);
    expect((await appel(envAdmin(), '/admin/api/moi', { jeton: `${JETON}x` })).res.status).toBe(401);
  });

  it('200 avec le bon jeton : villes et mode', async () => {
    const { res, body } = await appel(envAdmin(), '/admin/api/moi');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(body.villes.length).toBeGreaterThan(10);
    expect(body.mock).toBe(true);
  });
});

describe('/admin : les consignes s’appliquent à /top', () => {
  it('masquer retire une sortie du top, annuler la remet', async () => {
    const env = envAdmin();
    const avant = await titresTop(env);
    expect(avant).toContain('demo-1');

    const { body } = await appel(env, '/admin/api/action', { corps: { type: 'masquer', cle: 'mock:demo-1', titre: 'démo' } });
    expect(body.ok).toBe(true);
    expect(await titresTop(env)).not.toContain('demo-1');

    await appel(env, '/admin/api/action', { corps: { type: 'annuler', journalId: body.entree.id } });
    expect(await titresTop(env)).toContain('demo-1');

    const { body: j } = await appel(env, '/admin/api/journal');
    expect(j.journal.map((e) => e.type)).toEqual(['annuler', 'masquer']);
  });

  it('épingler met la sortie en préférée ; corriger change ce que voit le papa', async () => {
    const env = envAdmin();
    const dernier = (await titresTop(env)).at(-1);
    await appel(env, '/admin/api/action', { corps: { type: 'epingler', cle: `mock:${dernier}` } });
    await appel(env, '/admin/api/action', { corps: { type: 'corriger', cle: `mock:${dernier}`, champs: { titre: 'Titre revu' } } });
    const { body } = await appel(env, '/top?date=2026-10-10', { jeton: null });
    expect(body.preferee).toMatchObject({ id: dernier, titre: 'Titre revu', epingle: true });
  });

  it('un horaire corrigé remplace les créneaux structurés de la source', () => {
    const s = surcoucheVide();
    s.corrections['oa:1'] = { champs: { horaires: 'Samedi 10h30' } };
    const [ev] = appliquerSurcouche([{ origine: 'oa', id: '1', titre: 'T', creneaux: [{ debut: '2026-10-10T10:45' }] }], s, '2026-10-10');
    expect(ev).toMatchObject({ horaires: 'Samedi 10h30', creneaux: [] });
  });

  it('une sortie manuelle récurrente apparaît les bons jours seulement', async () => {
    const env = envAdmin();
    const manuel = {
      titre: 'Bébés lecteurs à la médiathèque', dateDebut: '2026-10-01', dateFin: '2026-12-31', jours: [6],
      lat: 48.111, lon: -1.68, ville: 'Rennes', horaires: 'Samedi 10h30',
    };
    const { body } = await appel(env, '/admin/api/action', { corps: { type: 'enregistrer-manuel', manuel } });
    expect(body.entree.cle).toMatch(/^manuel:/);
    const id = body.entree.cle.slice('manuel:'.length);

    expect(await titresTop(env)).toContain(id); // samedi 10/10
    expect(await titresTopJour(env, '2026-10-11')).not.toContain(id); // dimanche
  });

  it('refuse une action invalide (400, message lisible)', async () => {
    const { res, body } = await appel(envAdmin(), '/admin/api/action', { corps: { type: 'enregistrer-manuel', manuel: { titre: 'X' } } });
    expect(res.status).toBe(400);
    expect(body.message).toMatch(/dateDebut/);
  });
});

async function titresTopJour(env, date) {
  return (await appel(env, `/top?date=${date}`, { jeton: null })).body.top.map((e) => e.id);
}

describe('/admin/api/ville', () => {
  it('rend toutes les sorties, avec état admin, score ou motif et rang', async () => {
    const env = envAdmin();
    await appel(env, '/admin/api/action', { corps: { type: 'masquer', cle: 'mock:demo-2' } });
    const { res, body } = await appel(env, '/admin/api/ville?ville=rennes&date=2026-10-10&age=3');
    expect(res.status).toBe(200);
    expect(body.ville.id).toBe('rennes');
    const masquee = body.evenements.find((e) => e.cle === 'mock:demo-2');
    expect(masquee).toMatchObject({ masque: true, rang: null });
    const classees = body.evenements.filter((e) => e.rang);
    expect(classees.length).toBe(body.top.length);
    for (const e of body.evenements) expect(e.score !== null || e.motif !== null || e.masque).toBe(true);
  });

  it('400 sur une ville inconnue', async () => {
    expect((await appel(envAdmin(), '/admin/api/ville?ville=tombouctou')).res.status).toBe(400);
  });

  it('stats : mesures, votes, villes demandées', async () => {
    const { body } = await appel(envAdmin(), '/admin/api/stats?jours=7');
    expect(body.mesures.lignes).toHaveLength(7);
    expect(body.votes).toEqual({ couple: 0, moi: 0, tribu: 0 });
    expect(body.villesDemandees).toEqual([]);
  });
});
