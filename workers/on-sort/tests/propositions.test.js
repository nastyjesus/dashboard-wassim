import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  lireFormulaire, villeOuverte, versManuel, recevoirProposition, deciderProposition, listerPropositions, servirPhoto,
} from '../src/propositions.js';
import { lireSurcouche, appliquerSurcouche, manuelActif } from '../src/admin/surcouche.js';

afterEach(() => vi.unstubAllGlobals());

// Une date dans un mois : le formulaire n'accepte que les 12 prochains mois.
const BIENTOT = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

function formulaire(champs = {}, multiples = {}) {
  const f = new FormData();
  const base = {
    type: 'evenement', titre: 'La petite sorcière', lieuNom: 'Comédie de Rennes', adresse: '7 rue Jean-Marie Huchet',
    codePostal: '35000', ville: 'Rennes', description: 'Fifi, la petite sorcière, a perdu sa baguette. Un spectacle drôle et tendre pour les petits.',
    prixEnfant: '8', prixAdulte: '12', organisme: 'Comédie de Rennes', contactNom: 'Alex Martin', contactEmail: 'alex@example.org',
    ...champs,
  };
  for (const [k, v] of Object.entries(base)) if (v !== null) f.append(k, v);
  const m = { ages: ['3-6'], date: ['2026-10-10'], heureDebut: ['10:30'], heureFin: ['11:15'], ...multiples };
  for (const [k, vs] of Object.entries(m)) for (const v of vs) f.append(k, v);
  return f;
}

describe('lecture du formulaire', () => {
  it('accepte une proposition complète et en tire l\'âge et les séances', () => {
    const { proposition: p, erreurs } = lireFormulaire(formulaire({}, { ages: ['3-6', '6-10'] }), '2026-10-06');
    expect(erreurs).toBeUndefined();
    expect(p).toMatchObject({ ageMin: 3, ageMax: 10, prixEnfant: 8, prixAdulte: 12, seances: [{ date: '2026-10-10', debut: '10:30', fin: '11:15' }] });
  });

  it('refuse un public uniquement 10 ans et plus, un prix absent, une date passée', () => {
    const { erreurs } = lireFormulaire(formulaire({ prixEnfant: null, prixAdulte: null }, { ages: ['10+'], date: ['2026-09-01'] }), '2026-10-06');
    expect(Object.keys(erreurs).sort()).toEqual(['ages', 'date', 'prixEnfant']);
  });

  it('un lieu permanent demande jours et horaires, et ouvre un an par défaut', () => {
    const f = formulaire({ type: 'lieu', horaires: '10h – 18h' }, { date: [], heureDebut: [], heureFin: [], jours: ['3', '6', '0'] });
    const { proposition: p } = lireFormulaire(f, '2026-10-06');
    expect(p).toMatchObject({ type: 'lieu', jours: [0, 3, 6], periodeDebut: '2026-10-06', periodeFin: '2027-10-06' });
  });
});

describe('vers une sortie manuelle', () => {
  const geo = { lat: 48.11, lon: -1.68, villeId: 'rennes', photo: null };

  it('séances toutes à l\'heure → créneaux et dates précises', () => {
    const { proposition: p } = lireFormulaire(formulaire({}, { date: ['2026-10-10', '2026-10-17'], heureDebut: ['10:30', '15:00'], heureFin: ['', ''] }), '2026-10-06');
    const m = versManuel({ ...p, ...geo });
    expect(m).toMatchObject({ dateDebut: '2026-10-10', dateFin: '2026-10-17', dates: ['2026-10-10', '2026-10-17'], prixEnfant: 8, proposePar: 'Comédie de Rennes' });
    expect(m.creneaux).toEqual([{ debut: '2026-10-10T10:30', fin: null }, { debut: '2026-10-17T15:00', fin: null }]);
    expect(manuelActif(m, '2026-10-13')).toBe(false); // entre les deux dates : pas joué
    expect(manuelActif(m, '2026-10-17')).toBe(true);
  });

  it('une séance sans heure : pas de créneau à 00:00, un libellé lisible', () => {
    const { proposition: p } = lireFormulaire(formulaire({}, { date: ['2026-10-10', '2026-10-17'], heureDebut: ['10:30', ''], heureFin: ['', ''] }), '2026-10-06');
    const m = versManuel({ ...p, ...geo });
    expect(m.creneaux).toBeUndefined();
    expect(m.horaires).toBe('Le 10/10 à 10h30, le 17/10');
  });
});

describe('zone', () => {
  it('Bruz est dans la zone de Rennes, Clermont-Ferrand non', () => {
    expect(villeOuverte(48.024, -1.745)?.id).toBe('bruz');
    expect(villeOuverte(45.777, 3.087)).toBeNull();
  });
});

function kvMemoire() {
  const m = new Map();
  return {
    m,
    get: async (k, t) => (m.has(k) ? (t === 'json' ? JSON.parse(m.get(k).v) : m.get(k).v) : null),
    getWithMetadata: async (k) => (m.has(k) ? { value: m.get(k).v, metadata: m.get(k).meta } : { value: null, metadata: null }),
    put: async (k, v, o) => { m.set(k, { v, meta: o?.metadata }); },
    list: async ({ prefix }) => ({ keys: [...m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })) }),
  };
}

function reseau({ lat = 48.1067, lon = -1.6823, score = 0.9 } = {}) {
  const mails = [];
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
    const u = String(url);
    if (u.startsWith('https://api-adresse.data.gouv.fr/')) {
      return Response.json({ features: [{ geometry: { coordinates: [lon, lat] }, properties: { score } }] });
    }
    if (u.startsWith('https://api.resend.com/')) { mails.push(JSON.parse(init.body)); return Response.json({ id: 'x' }); }
    return new Response('?', { status: 404 });
  }));
  return mails;
}

const requete = (form, ip = '1.2.3.4') => new Request('https://w.test/propositions', { method: 'POST', body: form, headers: { 'CF-Connecting-IP': ip } });

describe('parcours complet', () => {
  it('reçoit, prévient, puis la validation crée la sortie et prévient l\'organisateur', async () => {
    const mails = reseau();
    const env = { VOTES: kvMemoire(), RESEND_KEY: 'k' };
    const attentes = [];
    const ctx = { waitUntil: (p) => attentes.push(p) };
    const form = formulaire({}, { date: [BIENTOT] });
    form.append('photo', new File([new Uint8Array([1, 2, 3])], 'affiche.jpg', { type: 'image/jpeg' }));

    const r = await recevoirProposition(requete(form), env, ctx);
    await Promise.all(attentes);
    expect(r).toMatchObject({ status: 200, corps: { ok: true, ville: 'Rennes' } });
    expect(mails.map((m) => m.to[0]).sort()).toEqual(['alex@example.org', 'contact@papaparfait.fr']);

    const photo = await servirPhoto(env, r.corps.id);
    expect(photo.headers.get('Content-Type')).toBe('image/jpeg');

    const [fiche] = await listerPropositions(env);
    expect(fiche).toMatchObject({ statut: 'attente', villeId: 'rennes', photo: r.corps.id });

    const d = await deciderProposition(env, { id: r.corps.id, action: 'valider', champs: { titre: 'La Petite Sorcière' } });
    expect(d).toMatchObject({ ok: true, statut: 'publiee' });
    expect(mails.at(-1)).toMatchObject({ to: ['alex@example.org'], subject: 'C’est en ligne : La Petite Sorcière' });

    const s = await lireSurcouche(env);
    const [ev] = appliquerSurcouche([], s, BIENTOT);
    expect(ev).toMatchObject({ titre: 'La Petite Sorcière', prixEnfant: 8, prixAdulte: 12, proposePar: 'Comédie de Rennes', photo: r.corps.id, ageMin: 3, ageMax: 6 });
    expect(await deciderProposition(env, { id: r.corps.id, action: 'refuser' })).toEqual({ erreur: 'déjà traitée' });
  });

  it('le champ piège répond « merci » sans rien enregistrer', async () => {
    reseau();
    const env = { VOTES: kvMemoire() };
    const r = await recevoirProposition(requete(formulaire({ site_web: 'http://spam' })), env);
    expect(r.corps).toEqual({ ok: true });
    expect(env.VOTES.m.size).toBe(0);
  });

  it('5 envois par heure et par IP, puis 429', async () => {
    reseau();
    const env = { VOTES: kvMemoire() };
    for (let i = 0; i < 5; i++) await recevoirProposition(requete(formulaire({}, { date: [BIENTOT] })), env);
    const r = await recevoirProposition(requete(formulaire({}, { date: [BIENTOT] })), env);
    expect(r.status).toBe(429);
  });

  it('hors des villes ouvertes : refus immédiat avec la liste des villes', async () => {
    reseau({ lat: 45.777, lon: 3.087 });
    const r = await recevoirProposition(requete(formulaire({ ville: 'Clermont-Ferrand', codePostal: '63000' }, { date: [BIENTOT] })), { VOTES: kvMemoire() });
    expect(r).toMatchObject({ status: 400, corps: { erreur: 'hors_zone' } });
    expect(r.corps.message).toContain('Rennes');
  });

  it('photo trop lourde ou d\'un autre format : refusée', async () => {
    reseau();
    const form = formulaire({}, { date: [BIENTOT] });
    form.append('photo', new File(['<svg/>'], 'a.svg', { type: 'image/svg+xml' }));
    const r = await recevoirProposition(requete(form), { VOTES: kvMemoire() });
    expect(r.corps.erreurs.photo).toMatch(/JPG/);
  });
});
