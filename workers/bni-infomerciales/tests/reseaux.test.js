// Réseaux sociaux : responsable désigné par l'admin, dépôt de plusieurs
// fichiers par morceaux avant jeudi 12:00 (Paris), pose par le job, nettoyage
// du samedi, mails du mercredi et du jeudi. Noms et emails fictifs (dépôt public).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import worker from '../src/index.js';
import { TAILLE_MORCEAU, signatureValide } from '../src/reseaux.js';

class KVMemoire {
  constructor() { this.donnees = new Map(); this.options = new Map(); }
  async get(cle, type) {
    if (!this.donnees.has(cle)) return null;
    const v = this.donnees.get(cle);
    if (type === 'json') return JSON.parse(v);
    if (type === 'arrayBuffer') return v instanceof Uint8Array ? v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength) : v;
    return v;
  }
  async put(cle, valeur, options) { this.donnees.set(cle, valeur); if (options) this.options.set(cle, options); else this.options.delete(cle); }
  async delete(cle) { this.donnees.delete(cle); this.options.delete(cle); }
  async list({ prefix }) { return { keys: [...this.donnees.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })) }; }
}

const ADMIN = 'admin-secret';
let env;

async function appel(path, { methode = 'GET', corps, admin, brut } = {}) {
  const headers = {};
  if (admin) headers['X-Wassim-Auth'] = admin;
  let body;
  if (brut) { body = brut; headers['Content-Type'] = 'application/octet-stream'; }
  else if (corps !== undefined) { body = JSON.stringify(corps); headers['Content-Type'] = 'application/json'; }
  const res = await worker.fetch(new Request(`https://bni.test${path}`, { method: methode, headers, body }), env);
  const ct = res.headers.get('Content-Type') || '';
  return { res, body: ct.includes('json') ? await res.json() : await res.text() };
}
const admin = (path, options = {}) => appel(path, { admin: ADMIN, ...options });
const octetsDe = async (res) => new Uint8Array(await res.arrayBuffer());

const MEMBRES = [
  { slide_id: 101, nom: 'Paul MARTIN', metier: 'Conseil', recherche: '', a_une_photo: false },
  { slide_id: 202, nom: 'Céline DURAND', metier: 'Prévoyance', recherche: '', a_une_photo: false },
  { slide_id: 303, nom: 'Alex PETIT', metier: 'Menuiserie', recherche: '', a_une_photo: false },
];
const EMAILS = { 101: 'paul@exemple.test', 202: 'celine@exemple.test' };

// mercredi 25/11/2026 9:00 à Paris (heure d'hiver : UTC+1) ; réunion le vendredi 27
const MERCREDI = '2026-11-25T08:00:00Z';
const JEUDI_9H = '2026-11-26T08:00:00Z';

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(MERCREDI));
  env = { KV: new KVMemoire(), WASSIM_AUTH_TOKEN: ADMIN };
  await admin('/api/job/resultat', { methode: 'POST', corps: { ok: true, message: 'sync', membres: MEMBRES } });
  await admin('/api/admin/emails', { methode: 'PUT', corps: { emails: EMAILS } });
});
afterEach(() => vi.useRealTimers());

async function designer(slideId = 202, email) {
  const { res, body } = await admin('/api/admin/reseaux/responsable', { methode: 'PUT', corps: { slide_id: slideId, email } });
  return { res, body, r: body.lien ? new URL(body.lien).searchParams.get('r') : null };
}

// fichiers fictifs avec la bonne signature
function avecDebut(taille, debut, remplissage = 65) {
  const o = new Uint8Array(taille).fill(remplissage);
  o.set(debut);
  return o;
}
const pdf = (taille = 50) => avecDebut(taille, [0x25, 0x50, 0x44, 0x46]);
const png = (taille = 50) => avecDebut(taille, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const jpg = (taille = 50) => avecDebut(taille, [0xff, 0xd8, 0xff, 0xe0]);
const pptx = (taille = 80) => avecDebut(taille, [0x50, 0x4b, 0x03, 0x04, ...new TextEncoder().encode('xxxxxxxxxxxxxxxxxxxxxxxxxx[Content_Types].xml')]);

async function commencer(r, fichiers) {
  return appel(`/api/reseaux/envoi?r=${r}`, { methode: 'POST', corps: { fichiers: fichiers.map(([nom, o]) => ({ nom, taille: o.byteLength })) } });
}
async function envoyerMorceaux(r, e, fichiers) {
  for (let i = 0; i < fichiers.length; i += 1) {
    const { envoi, morceaux } = e.body.fichiers[i];
    const o = fichiers[i][1];
    for (let n = 0; n < morceaux; n += 1) {
      const rep = await appel(`/api/reseaux/morceau?r=${r}&envoi=${envoi}&n=${n}`, { methode: 'PUT', brut: o.slice(n * TAILLE_MORCEAU, (n + 1) * TAILLE_MORCEAU) });
      if (!rep.res.ok) return rep;
    }
  }
  return null;
}
async function deposer(r, fichiers) {
  const e = await commencer(r, fichiers);
  if (!e.res.ok) return e;
  const ko = await envoyerMorceaux(r, e, fichiers);
  if (ko) return ko;
  return appel(`/api/reseaux/valider?r=${r}`, { methode: 'POST', corps: { brouillon: e.body.brouillon } });
}
const morceauxKV = () => [...env.KV.donnees.keys()].filter((k) => k.startsWith('reseaux_morceau:'));
const temoinsKV = () => [...env.KV.donnees.keys()].filter((k) => k.startsWith('reseaux_temoin:'));

describe('responsable réseaux sociaux', () => {
  it('l’admin désigne un membre (email repris des rappels) et obtient son lien', async () => {
    const { body, r } = await designer(202);
    expect(body).toMatchObject({ slide_id: 202, nom: 'Céline DURAND', email: 'celine@exemple.test', remplace_le: null });
    expect(body.jeton).toBeUndefined();
    expect(body.lien).toBe(`https://bni.test/reseaux?r=${r}`);
    expect(r.length).toBeGreaterThanOrEqual(24); // 18 octets aléatoires
    const etat = (await admin('/api/admin/etat')).body.reseaux;
    expect(etat.responsable).toMatchObject({ nom: 'Céline DURAND', lien: body.lien });
    expect(etat).toMatchObject({ vendredi: '2026-11-27', limite: 'jeudi 26 novembre 12h', ferme: false });
  });

  it('un nouveau responsable invalide l’ancien lien ; l’historique est gardé sans jeton', async () => {
    const { r: ancien } = await designer(202);
    const { r: nouveau } = await designer(101, 'autre@exemple.test');
    expect((await appel(`/api/reseaux/moi?r=${ancien}`)).res.status).toBe(403);
    expect((await appel(`/api/reseaux/moi?r=${nouveau}`)).body).toMatchObject({ prenom: 'Paul' });
    const etat = (await admin('/api/admin/etat')).body.reseaux;
    expect(etat.responsables.map((x) => [x.nom, x.email, Boolean(x.remplace_le)])).toEqual([
      ['Paul MARTIN', 'autre@exemple.test', false],
      ['Céline DURAND', 'celine@exemple.test', true],
    ]);
    expect(JSON.stringify(etat.responsables)).not.toContain('jeton');
  });

  it('redésigner le même membre garde son lien', async () => {
    const { r } = await designer(202);
    const { r: encore } = await designer(202);
    expect(encore).toBe(r);
  });

  it('refuse un membre inconnu ou un email invalide ; réservé à l’admin', async () => {
    expect((await designer(999)).res.status).toBe(400);
    expect((await designer(202, 'pas-un-email')).res.status).toBe(400);
    expect((await appel('/api/admin/reseaux/responsable', { methode: 'PUT', corps: { slide_id: 202 } })).res.status).toBe(401);
  });

  it('jeton absent, faux ou ancien : refusé sur toutes les routes publiques', async () => {
    expect((await appel('/api/reseaux/moi')).res.status).toBe(403); // personne de désigné
    await designer(202);
    for (const r of ['', 'faux']) {
      expect((await appel(`/api/reseaux/moi?r=${r}`)).res.status).toBe(403);
      expect((await appel(`/api/reseaux/envoi?r=${r}`, { methode: 'POST', corps: { fichiers: [{ nom: 'a.pdf', taille: 10 }] } })).res.status).toBe(403);
      expect((await appel(`/api/reseaux/morceau?r=${r}&envoi=x&n=0`, { methode: 'PUT', brut: pdf(10) })).res.status).toBe(403);
      expect((await appel(`/api/reseaux/valider?r=${r}`, { methode: 'POST', corps: { brouillon: 'x' } })).res.status).toBe(403);
    }
  });

  it('sert la page /reseaux', async () => {
    const { body } = await appel('/reseaux');
    expect(body).toContain('Réseaux sociaux');
    expect(body).toContain('textContent');
  });
});

describe('dépôt', () => {
  let r;
  beforeEach(async () => { ({ r } = await designer(202)); });

  it('plusieurs fichiers (PDF en 2 morceaux, PNG, JPG, PowerPoint) : ordre conservé, rien de lisible publiquement', async () => {
    const gros = pdf(TAILLE_MORCEAU + 5);
    const fichiers = [['2-programme.pdf', gros], ['1-visuel.png', png()], ['photo.JPEG', jpg()], ['deck.pptx', pptx()]];
    const v = await deposer(r, fichiers);
    expect(v.body).toMatchObject({ ok: true, fichiers: 4 });
    const moi = (await appel(`/api/reseaux/moi?r=${r}`)).body;
    expect(moi.depot.fichiers).toEqual([
      { nom: '2-programme.pdf', type: 'pdf', taille: gros.byteLength },
      { nom: '1-visuel.png', type: 'png', taille: 50 },
      { nom: 'photo.JPEG', type: 'jpg', taille: 50 },
      { nom: 'deck.pptx', type: 'pptx', taille: 80 },
    ]);
    expect(JSON.stringify(moi)).not.toContain('envoi');
    expect((await appel(`/api/reseaux/fichier?r=${r}`)).res.status).toBe(404);
    // l’admin télécharge chaque fichier reconstitué
    const { semaines } = (await admin('/api/admin/etat')).body.reseaux;
    const d = semaines[0].depot;
    expect(d.par_nom).toBe('Céline DURAND');
    const f = await worker.fetch(new Request(`https://bni.test/api/admin/reseaux/fichier?vendredi=2026-11-27&envoi=${d.fichiers[0].envoi}`, { headers: { 'X-Wassim-Auth': ADMIN } }), env);
    expect(f.headers.get('Content-Type')).toBe('application/pdf');
    expect(await octetsDe(f)).toEqual(gros);
    const sansAuth = await worker.fetch(new Request(`https://bni.test/api/admin/reseaux/fichier?vendredi=2026-11-27&envoi=${d.fichiers[0].envoi}`), env);
    expect(sansAuth.status).toBe(401);
  });

  it('signatures vérifiées au premier morceau : faux PDF, faux PNG, faux JPG, faux PowerPoint refusés', async () => {
    const faux = new Uint8Array(40).fill(65);
    const loin = new Uint8Array(2000).fill(65);
    loin.set([0x25, 0x50, 0x44, 0x46], 1500); // %PDF au-delà des 1024 premiers octets
    for (const [nom, o] of [['a.pdf', faux], ['b.pdf', loin], ['a.png', jpg()], ['a.jpg', png()], ['a.pptx', faux]]) {
      const rep = await deposer(r, [[nom, o]]);
      expect(rep.res.status).toBe(400);
      expect(rep.body.erreur).toContain("n'est pas un vrai fichier");
    }
    expect(morceauxKV()).toEqual([]);
    expect((await appel(`/api/reseaux/moi?r=${r}`)).body.depot).toBeNull();
    expect(signatureValide('pptx', pptx())).toBe(true);
    expect(signatureValide('pptx', avecDebut(40, [0x50, 0x4b, 0x03, 0x04]))).toBe(true); // en-tête zip suffit
    const decale = new Uint8Array(300).fill(32);
    decale.set([0x25, 0x50, 0x44, 0x46], 200); // %PDF dans les 1024 premiers octets : toléré
    expect((await deposer(r, [['decale.pdf', decale]])).body).toMatchObject({ ok: true });
  });

  it('morceaux et témoins : expiration 21 jours, validation par les témoins, effacés avec les morceaux', async () => {
    await deposer(r, [['a.pdf', pdf()], ['b.png', png()]]);
    expect(temoinsKV()).toHaveLength(2);
    for (const k of [...morceauxKV(), ...temoinsKV()]) expect(env.KV.options.get(k)).toEqual({ expirationTtl: 21 * 24 * 3600 });
    // sans témoin, l'envoi est incomplet même si le morceau est là
    const e = await commencer(r, [['c.pdf', pdf()]]);
    await envoyerMorceaux(r, e, [['c.pdf', pdf()]]);
    env.KV.donnees.delete(`reseaux_temoin:${e.body.fichiers[0].envoi}:0`);
    expect((await appel(`/api/reseaux/valider?r=${r}`, { methode: 'POST', corps: { brouillon: e.body.brouillon } })).res.status).toBe(409);
    vi.advanceTimersByTime(1000);
    await deposer(r, [['d.jpg', jpg()]]);
    expect(morceauxKV()).toHaveLength(1);
    expect(temoinsKV()).toHaveLength(1);
  });

  it('nom de fichier coupé sans casser de caractère (paire de substitution UTF-16)', async () => {
    await deposer(r, [[`${'😀'.repeat(130)}.png`, png()]]);
    const [f] = (await appel(`/api/reseaux/moi?r=${r}`)).body.depot.fichiers;
    expect(Array.from(f.nom)).toHaveLength(120);
    expect(f.nom.endsWith('.png')).toBe(true);
    expect(f.nom.isWellFormed ? f.nom.isWellFormed() : !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(f.nom)).toBe(true);
  });

  it('bornes : formats, nombre de fichiers, taille totale, morceaux', async () => {
    const envoi = (fichiers) => appel(`/api/reseaux/envoi?r=${r}`, { methode: 'POST', corps: { fichiers } });
    expect((await envoi([])).res.status).toBe(400);
    expect((await envoi([{ nom: 'a.gif', taille: 10 }])).res.status).toBe(400);
    expect((await envoi([{ nom: 'a.ppt', taille: 10 }])).res.status).toBe(400);
    expect((await envoi([{ nom: 'a.pdf', taille: 0 }])).res.status).toBe(400);
    expect((await envoi(Array.from({ length: 11 }, (_, i) => ({ nom: `${i}.png`, taille: 10 })))).res.status).toBe(400);
    expect((await envoi(Array.from({ length: 10 }, (_, i) => ({ nom: `${i}.png`, taille: 10 })))).res.status).toBe(200);
    expect((await envoi([{ nom: 'a.pdf', taille: 50 * 1024 * 1024 }, { nom: 'b.pdf', taille: 31 * 1024 * 1024 }])).res.status).toBe(413);
    // morceau hors bornes ou de mauvaise taille
    const e = await commencer(r, [['a.pdf', pdf(30)]]);
    const { envoi: id } = e.body.fichiers[0];
    expect((await appel(`/api/reseaux/morceau?r=${r}&envoi=${id}&n=1`, { methode: 'PUT', brut: pdf(30) })).res.status).toBe(400);
    expect((await appel(`/api/reseaux/morceau?r=${r}&envoi=${id}&n=0`, { methode: 'PUT', brut: pdf(31) })).res.status).toBeGreaterThanOrEqual(400);
    expect((await appel(`/api/reseaux/morceau?r=${r}&envoi=inconnu&n=0`, { methode: 'PUT', brut: pdf(30) })).res.status).toBe(409);
  });

  it('refuse de valider un envoi incomplet ou inconnu', async () => {
    const e = await commencer(r, [['a.pdf', pdf(TAILLE_MORCEAU + 10)]]);
    await appel(`/api/reseaux/morceau?r=${r}&envoi=${e.body.fichiers[0].envoi}&n=0`, { methode: 'PUT', brut: pdf(TAILLE_MORCEAU) });
    expect((await appel(`/api/reseaux/valider?r=${r}`, { methode: 'POST', corps: { brouillon: e.body.brouillon } })).res.status).toBe(409);
    expect((await appel(`/api/reseaux/valider?r=${r}`, { methode: 'POST', corps: { brouillon: 'autre' } })).res.status).toBe(409);
  });

  it('un nouveau dépôt remplace intégralement le précédent (anciens morceaux effacés)', async () => {
    await deposer(r, [['a.pdf', pdf()], ['b.png', png()]]);
    const avant = morceauxKV();
    expect(avant).toHaveLength(2);
    vi.advanceTimersByTime(60_000);
    // un envoi commencé puis abandonné ne laisse rien non plus
    await commencer(r, [['abandon.jpg', jpg()]]);
    await deposer(r, [['c.jpg', jpg()]]);
    const apres = morceauxKV();
    expect(apres).toHaveLength(1);
    expect(apres.some((k) => avant.includes(k))).toBe(false);
    const moi = (await appel(`/api/reseaux/moi?r=${r}`)).body;
    expect(moi.depot.fichiers.map((f) => f.nom)).toEqual(['c.jpg']);
  });

  it('limite jeudi 12:00 heure de Paris, puis ouvert pour la réunion suivante dès vendredi 12:00', async () => {
    vi.setSystemTime(new Date('2026-11-26T10:59:00Z')); // jeudi 11:59 Paris
    const e = await commencer(r, [['a.pdf', pdf()]]);
    expect(e.res.status).toBe(200);
    await envoyerMorceaux(r, e, [['a.pdf', pdf()]]);
    vi.setSystemTime(new Date('2026-11-26T11:00:00Z')); // jeudi 12:00 Paris
    const v = await appel(`/api/reseaux/valider?r=${r}`, { methode: 'POST', corps: { brouillon: e.body.brouillon } });
    expect(v.res.status).toBe(409);
    expect(v.body.erreur).toContain('jeudi 26 novembre 12h');
    expect((await commencer(r, [['a.pdf', pdf()]])).res.status).toBe(409);
    expect((await appel(`/api/reseaux/moi?r=${r}`)).body).toMatchObject({ vendredi: '2026-11-27', ferme: true, depot: null });
    vi.setSystemTime(new Date('2026-11-27T10:59:00Z')); // vendredi 11:59 Paris : toujours fermé
    expect((await appel(`/api/reseaux/moi?r=${r}`)).body).toMatchObject({ vendredi: '2026-11-27', ferme: true });
    vi.setSystemTime(new Date('2026-11-27T11:00:00Z')); // vendredi 12:00 Paris : réunion suivante
    expect((await appel(`/api/reseaux/moi?r=${r}`)).body).toMatchObject({ vendredi: '2026-12-04', ferme: false, limite: 'jeudi 3 décembre 12h' });
    expect((await deposer(r, [['a.pdf', pdf()]])).body).toMatchObject({ ok: true });
  });
});

describe('job', () => {
  let r;
  beforeEach(async () => { ({ r } = await designer(202)); });

  it('entree : rien sans dépôt validé', async () => {
    expect((await admin('/api/job/entree')).body.reseaux).toBeNull();
    await commencer(r, [['a.pdf', pdf()]]); // pas validé
    expect((await admin('/api/job/entree')).body.reseaux).toBeNull();
  });

  it('entree → morceaux → resultat ok : plus rien à poser ; l’admin voit la pose', async () => {
    const gros = png(TAILLE_MORCEAU + 3);
    await deposer(r, [['a.png', gros], ['b.pdf', pdf()]]);
    const { reseaux } = (await admin('/api/job/entree')).body;
    expect(Object.keys(reseaux).sort()).toEqual(['fichiers', 'valide_le', 'vendredi']);
    expect(reseaux.vendredi).toBe('2026-11-27');
    expect(reseaux.fichiers.map(({ envoi, ...f }) => f)).toEqual([
      { morceaux: 2, taille: gros.byteLength, type: 'png', nom: 'a.png' },
      { morceaux: 1, taille: 50, type: 'pdf', nom: 'b.pdf' },
    ]);
    const lireMorceau = (envoi, n, auth = ADMIN) => worker.fetch(new Request(`https://bni.test/api/job/reseaux/morceau/${envoi}/${n}`, { headers: auth ? { 'X-Wassim-Auth': auth } : {} }), env);
    const m0 = await lireMorceau(reseaux.fichiers[0].envoi, 0);
    const m1 = await lireMorceau(reseaux.fichiers[0].envoi, 1);
    const recolle = new Uint8Array([...(await octetsDe(m0)), ...(await octetsDe(m1))]);
    expect(recolle).toEqual(gros);
    expect((await lireMorceau(reseaux.fichiers[0].envoi, 2)).status).toBe(404);
    expect((await lireMorceau(reseaux.fichiers[0].envoi, 0, '')).status).toBe(401);

    await admin('/api/job/resultat', { methode: 'POST', corps: { ok: true, message: 'ok', reseaux: { vendredi: reseaux.vendredi, valide_le: reseaux.valide_le, ok: true, slides: 3, message: '3 slides posées' } } });
    expect((await admin('/api/job/entree')).body.reseaux).toBeNull();
    // résultat dans sa propre clé : la fiche du dépôt n'est jamais réécrite par le job
    expect(JSON.parse(env.KV.donnees.get('reseaux_applique:2026-11-27'))).toMatchObject({ valide_le: reseaux.valide_le, ok: true, slides: 3, message: '3 slides posées' });
    expect(JSON.parse(env.KV.donnees.get('reseaux:2026-11-27')).applique).toBeUndefined();
    const [s] = (await admin('/api/admin/etat')).body.reseaux.semaines;
    expect(s).toMatchObject({ pose: true, applique: { ok: true, slides: 3, valide_le: reseaux.valide_le } });
    expect((await appel(`/api/reseaux/moi?r=${r}`)).body.sur_la_presentation).toMatchObject({ slides: 3 });
  });

  it('resultat ok=false : erreur visible dans l’admin, reposé au passage suivant', async () => {
    await deposer(r, [['a.pdf', pdf()]]);
    const { reseaux } = (await admin('/api/job/entree')).body;
    await admin('/api/job/resultat', { methode: 'POST', corps: { ok: true, reseaux: { vendredi: reseaux.vendredi, valide_le: reseaux.valide_le, ok: false, message: 'repère Réseaux sociaux introuvable' } } });
    expect((await admin('/api/job/entree')).body.reseaux).not.toBeNull();
    const [s] = (await admin('/api/admin/etat')).body.reseaux.semaines;
    expect(s).toMatchObject({ pose: false, applique: { ok: false, message: 'repère Réseaux sociaux introuvable' } });
  });

  it('dépôt remplacé pendant le job : le résultat de l’ancien est ignoré, le nouveau sera posé', async () => {
    await deposer(r, [['a.pdf', pdf()]]);
    const { reseaux: v1 } = (await admin('/api/job/entree')).body;
    vi.advanceTimersByTime(1000);
    await deposer(r, [['b.pdf', pdf()]]);
    await admin('/api/job/resultat', { methode: 'POST', corps: { ok: true, reseaux: { vendredi: v1.vendredi, valide_le: v1.valide_le, ok: true, slides: 1 } } });
    const { reseaux: v2 } = (await admin('/api/job/entree')).body;
    expect(v2.valide_le).not.toBe(v1.valide_le);
    expect(v2.fichiers.map((f) => f.nom)).toEqual(['b.pdf']);
  });

  it('pose enregistrée juste après un nouveau dépôt validé : le nouveau dépôt reste intact', async () => {
    await deposer(r, [['a.pdf', pdf()]]);
    const { reseaux: v1 } = (await admin('/api/job/entree')).body;
    await admin('/api/job/resultat', { methode: 'POST', corps: { ok: true, reseaux: { vendredi: v1.vendredi, valide_le: v1.valide_le, ok: true, slides: 1 } } });
    vi.advanceTimersByTime(1000);
    await deposer(r, [['b.pdf', pdf()], ['c.png', png()]]);
    const fiche = JSON.parse(env.KV.donnees.get('reseaux:2026-11-27'));
    expect(fiche.depot.fichiers.map((f) => f.nom)).toEqual(['b.pdf', 'c.png']);
    expect((await admin('/api/job/entree')).body.reseaux.fichiers).toHaveLength(2); // pas encore posé
  });
});

describe('nettoyage du samedi', () => {
  it('plan : reseaux_jusqu_au = réunion passée ; retrait unique seulement le samedi 28/11/2026 (Paris)', async () => {
    const plan = async (iso) => (await admin(`/api/job/nettoyage?maintenant=${iso}`)).body;
    expect(await plan('2026-11-28T06:30:00Z')).toMatchObject({ semaine: '2026-11-23', reseaux_jusqu_au: '2026-11-27', reseaux_retrait_unique: [2113419610, 2113419611] });
    expect((await plan('2026-11-28T22:59:00Z')).reseaux_retrait_unique).toHaveLength(2); // 23:59 Paris
    expect((await plan('2026-11-28T23:00:00Z')).reseaux_retrait_unique).toEqual([]); // dimanche 0:00 Paris
    expect((await plan('2026-11-27T22:59:00Z')).reseaux_retrait_unique).toEqual([]); // vendredi 23:59 Paris
    expect((await plan('2026-11-21T06:30:00Z')).reseaux_retrait_unique).toEqual([]);
    expect((await plan('2026-12-05T06:30:00Z'))).toMatchObject({ reseaux_jusqu_au: '2026-12-04', reseaux_retrait_unique: [] });
  });

  it('nettoyage réussi : fichiers des réunions passées effacés, la fiche reste ; dépôt de la réunion suivante gardé', async () => {
    const { r } = await designer(202);
    await deposer(r, [['a.pdf', pdf()], ['b.png', png()]]); // pour le 27/11
    vi.setSystemTime(new Date('2026-11-27T15:00:00Z')); // vendredi après-midi : pour le 04/12
    await deposer(r, [['suivant.jpg', jpg()]]);
    vi.setSystemTime(new Date('2026-11-28T06:30:00Z')); // samedi 7h30 Paris
    const plan = (await admin('/api/job/nettoyage')).body;
    const res = (await admin('/api/job/nettoyage', { methode: 'POST', corps: { ok: true, semaine: plan.semaine, reseaux: 2 } })).body;
    expect(res).toMatchObject({ ok: true, reseaux: 2, fichiers_reseaux_effaces: 1 });
    expect(morceauxKV()).toHaveLength(1); // celui de la réunion du 04/12
    expect(temoinsKV()).toHaveLength(1);
    const fiche = JSON.parse(env.KV.donnees.get('reseaux:2026-11-27'));
    expect(fiche.depot).toMatchObject({ fichier_efface: true });
    expect(fiche.depot.fichiers).toHaveLength(2);
    const envoi = fiche.depot.fichiers[0].envoi;
    expect((await admin(`/api/admin/reseaux/fichier?vendredi=2026-11-27&envoi=${envoi}`)).res.status).toBe(404);
    expect((await admin('/api/job/entree')).body.reseaux.fichiers.map((f) => f.nom)).toEqual(['suivant.jpg']);
  });

  it('nettoyage en échec : rien n’est effacé', async () => {
    const { r } = await designer(202);
    await deposer(r, [['a.pdf', pdf()]]);
    vi.setSystemTime(new Date('2026-11-28T06:30:00Z'));
    const plan = (await admin('/api/job/nettoyage')).body;
    await admin('/api/job/nettoyage', { methode: 'POST', corps: { ok: false, semaine: plan.semaine, message: 'deck ouvert' } });
    expect(morceauxKV()).toHaveLength(1);
  });
});

describe('mails du mercredi et du jeudi', () => {
  const rappels = async (type, iso) => (await admin(`/api/admin/rappels?type=${type}&maintenant=${iso}`)).body;

  it('mercredi 9h : invitation avec lien, limite jeudi 12h, formats, plusieurs fichiers, remplacement', async () => {
    const { r } = await designer(202);
    const rep = await rappels('reseaux_mercredi', MERCREDI);
    expect(rep).toMatchObject({ type: 'reseaux_mercredi', vendredi: '2026-11-27', recap: { responsable: 'ok', depose: false, a_envoyer: 1 } });
    const [m] = rep.mails;
    expect(m).toMatchObject({ nom: 'Céline DURAND', email: 'celine@exemple.test' });
    expect(m.sujet).toContain('vendredi 27 novembre');
    for (const attendu of ['Bonjour Céline,', `https://bni.test/reseaux?r=${r}`, 'jeudi 26 novembre 12h', 'PowerPoint (.pptx), PDF, images (JPG, PNG)', 'plusieurs fichiers', 'remplace entièrement le précédent', 'Wassim']) {
      expect(m.texte).toContain(attendu);
    }
    for (const t of [m.sujet, m.texte]) expect(t).not.toMatch(/·e|\(e\)|ier\.ère|eur\.rice/);
  });

  it('jeudi 9h : relance courte seulement si rien n’est validé', async () => {
    const { r } = await designer(202);
    let rep = await rappels('reseaux_jeudi', JEUDI_9H);
    expect(rep.mails).toHaveLength(1);
    expect(rep.mails[0].sujet).toContain('avant 12h');
    expect(rep.mails[0].texte).toContain(`https://bni.test/reseaux?r=${r}`);
    await commencer(r, [['a.pdf', pdf()]]); // envoi commencé, pas validé : relance quand même
    expect((await rappels('reseaux_jeudi', JEUDI_9H)).mails).toHaveLength(1);
    await deposer(r, [['a.pdf', pdf()]]);
    rep = await rappels('reseaux_jeudi', JEUDI_9H);
    expect(rep).toMatchObject({ mails: [], recap: { depose: true, a_envoyer: 0 } });
    // le mercredi part quand même, en signalant ce qui est déjà reçu
    expect((await rappels('reseaux_mercredi', MERCREDI)).mails[0].texte).toContain('déjà reçu 1 fichier(s)');
  });

  it('sans responsable, ou responsable sans email : pas de mail, le recap le dit', async () => {
    expect(await rappels('reseaux_mercredi', MERCREDI)).toMatchObject({ mails: [], recap: { responsable: 'aucun responsable désigné', a_envoyer: 0 } });
    expect((await rappels('reseaux_jeudi', JEUDI_9H)).mails).toEqual([]);
    await designer(303); // pas d'email connu
    expect(await rappels('reseaux_mercredi', MERCREDI)).toMatchObject({ mails: [], recap: { responsable: 'sans email' } });
    expect((await rappels('reseaux_jeudi', JEUDI_9H)).mails).toEqual([]);
  });

  it('les autres types de rappels restent inchangés', async () => {
    expect((await admin('/api/admin/rappels?type=lundi')).body.type).toBe('lundi');
    expect((await admin('/api/admin/rappels?type=conferencier_mercredi')).body.type).toBe('conferencier_mercredi');
    expect((await admin('/api/admin/rappels?type=reseaux_vendredi')).res.status).toBe(400);
  });
});

describe('admin', () => {
  it('la page admin contient la section Réseaux sociaux', async () => {
    const { body } = await appel('/admin');
    expect(body).toContain('Réseaux sociaux');
    expect(body).toContain('/api/admin/reseaux/responsable');
  });
});
