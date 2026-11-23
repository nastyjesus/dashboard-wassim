// Conférencier de la semaine : mandat du secrétaire trésorier, désignation,
// dépôt des slides par morceaux, mails (liste fournie au script Apps Script),
// pose par le job, nettoyage. Noms et emails fictifs (dépôt public).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import worker from '../src/index.js';
import { vendrediCible, finMandatParDefaut, TAILLE_MORCEAU } from '../src/conference.js';

class KVMemoire {
  constructor() { this.donnees = new Map(); }
  async get(cle, type) {
    if (!this.donnees.has(cle)) return null;
    const v = this.donnees.get(cle);
    if (type === 'json') return JSON.parse(v);
    if (type === 'arrayBuffer') return v instanceof Uint8Array ? v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength) : v;
    return v;
  }
  async put(cle, valeur) { this.donnees.set(cle, valeur); }
  async delete(cle) { this.donnees.delete(cle); }
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

const MEMBRES = [
  { slide_id: 101, nom: 'Paul MARTIN', metier: 'Conseil', recherche: '', a_une_photo: false },
  { slide_id: 202, nom: 'Céline DURAND', metier: 'Prévoyance', recherche: '', a_une_photo: false },
  { slide_id: 303, nom: 'Alex PETIT', metier: 'Menuiserie', recherche: '', a_une_photo: false },
];
const EMAILS = { 101: 'paul@exemple.test', 202: 'celine@exemple.test' };

// mercredi 18/11/2026 10:00 à Paris (heure d'hiver : UTC+1)
const MERCREDI = '2026-11-18T09:00:00Z';

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(MERCREDI));
  env = { KV: new KVMemoire(), WASSIM_AUTH_TOKEN: ADMIN };
  await admin('/api/job/resultat', { methode: 'POST', corps: { ok: true, message: 'sync', membres: MEMBRES } });
  await admin('/api/admin/emails', { methode: 'PUT', corps: { emails: EMAILS } });
});
afterEach(() => vi.useRealTimers());

async function nommerSecretaire(slideId = 101) {
  const { body } = await admin('/api/admin/secretaire', { methode: 'PUT', corps: { slide_id: slideId, fin: '2027-03-30' } });
  return new URL(body.lien).searchParams.get('s');
}
async function designerParSecretaire(slideId = 202) {
  const s = await nommerSecretaire();
  return appel(`/api/secretaire/designer?s=${s}`, { methode: 'POST', corps: { slide_id: slideId } });
}
async function lienConferencier() {
  const { body } = await admin('/api/admin/etat');
  return new URL(body.conference.conferences[0].lien).searchParams.get('c');
}
// fichier PDF fictif (commence par %PDF), coupé en morceaux comme le fait la page
function pdf(taille) {
  const octets = new Uint8Array(taille).fill(65);
  octets.set([0x25, 0x50, 0x44, 0x46]);
  return octets;
}
async function deposer(c, octets, nom = 'conference.pdf', contacts = ['Jeanne TEST – Directrice – Exemple SA (Rennes)']) {
  const e = await appel(`/api/conference/envoi?c=${c}`, { methode: 'POST', corps: { nom_fichier: nom, taille: octets.byteLength } });
  if (!e.res.ok) return e;
  for (let n = 0; n < e.body.morceaux; n += 1) {
    const r = await appel(`/api/conference/morceau?c=${c}&envoi=${e.body.envoi}&n=${n}`, { methode: 'PUT', brut: octets.slice(n * TAILLE_MORCEAU, (n + 1) * TAILLE_MORCEAU) });
    if (!r.res.ok) return r;
  }
  return appel(`/api/conference/valider?c=${c}`, { methode: 'POST', corps: { envoi: e.body.envoi, contacts } });
}

describe('dates', () => {
  it('prochaine réunion : le vendredi de la semaine jusqu’à vendredi 12:00 Paris, puis le suivant', () => {
    expect(vendrediCible(new Date('2026-11-16T08:00:00Z'))).toBe('2026-11-20'); // lundi
    expect(vendrediCible(new Date('2026-11-20T10:59:00Z'))).toBe('2026-11-20'); // vendredi 11:59 Paris
    expect(vendrediCible(new Date('2026-11-20T13:00:00Z'))).toBe('2026-11-27'); // vendredi 14:00 Paris
    expect(vendrediCible(new Date('2026-11-22T10:00:00Z'))).toBe('2026-11-27'); // dimanche
  });

  it('fin de mandat proposée : prochain 30 mars ou 30 septembre', () => {
    expect(finMandatParDefaut(new Date('2026-11-22T10:00:00Z'))).toBe('2027-03-30');
    expect(finMandatParDefaut(new Date('2027-04-02T10:00:00Z'))).toBe('2027-09-30');
  });
});

describe('secrétaire trésorier', () => {
  it('l’admin désigne un mandat (email repris des rappels) et garde l’historique', async () => {
    await nommerSecretaire(101);
    const { body } = await admin('/api/admin/secretaire', { methode: 'PUT', corps: { slide_id: 202, fin: '2027-09-30', email: 'autre@exemple.test' } });
    expect(body).toMatchObject({ nom: 'Céline DURAND', email: 'autre@exemple.test', fin: '2027-09-30' });
    const etat = (await admin('/api/admin/etat')).body.conference;
    expect(etat.secretaire).toMatchObject({ nom: 'Céline DURAND' });
    expect(etat.secretaires.map((s) => [s.nom, s.email, Boolean(s.remplace_le)])).toEqual([
      ['Céline DURAND', 'autre@exemple.test', false],
      ['Paul MARTIN', 'paul@exemple.test', true],
    ]);
    expect(JSON.stringify(etat.secretaires)).not.toContain('jeton');
  });

  it('refuse une fin de mandat passée ou un membre inconnu', async () => {
    expect((await admin('/api/admin/secretaire', { methode: 'PUT', corps: { slide_id: 101, fin: '2026-01-01' } })).res.status).toBe(400);
    expect((await admin('/api/admin/secretaire', { methode: 'PUT', corps: { slide_id: 999, fin: '2027-03-30' } })).res.status).toBe(400);
  });

  it('sa page liste tous les membres ; l’ancien lien ne marche plus après un nouveau mandat', async () => {
    const ancien = await nommerSecretaire(101);
    const page = await appel(`/api/secretaire/etat?s=${ancien}`);
    expect(page.body).toMatchObject({ prenom: 'Paul', vendredi: '2026-11-20', designe: null });
    expect(page.body.membres.map((m) => m.nom)).toEqual(['Alex PETIT', 'Céline DURAND', 'Paul MARTIN']);
    await nommerSecretaire(202);
    expect((await appel(`/api/secretaire/etat?s=${ancien}`)).res.status).toBe(403);
    expect((await appel('/api/secretaire/etat?s=faux')).res.status).toBe(403);
  });

  it('mandat terminé : lien refusé', async () => {
    const s = await nommerSecretaire(101);
    vi.setSystemTime(new Date('2027-04-01T10:00:00Z'));
    expect((await appel(`/api/secretaire/etat?s=${s}`)).res.status).toBe(403);
  });

  it('sert les pages secrétaire et conférencier, avec la note sur les sphères', async () => {
    expect((await appel('/secretaire')).body).toContain('choisir un seul membre de la sphère pour éviter les doublons');
    expect((await appel('/conference')).body).toContain('contacts spécifiques');
  });
});

describe('désignation du conférencier', () => {
  it('le secrétaire désigne ; l’admin voit le conférencier et son lien', async () => {
    const r = await designerParSecretaire(202);
    expect(r.body).toMatchObject({ vendredi: '2026-11-20', nom: 'Céline DURAND', a_depose: false });
    const [conf] = (await admin('/api/admin/etat')).body.conference.conferences;
    expect(conf).toMatchObject({ vendredi: '2026-11-20', nom: 'Céline DURAND', designe_par: 'secretaire', email: 'celine@exemple.test', mail_designation: null });
    const c = await lienConferencier();
    expect((await appel(`/api/conference/moi?c=${c}`)).body).toMatchObject({ prenom: 'Céline', vendredi: '2026-11-20', depot: null, passee: false });
  });

  it('changer de conférencier invalide l’ancien lien et supprime son dépôt', async () => {
    await designerParSecretaire(202);
    const ancien = await lienConferencier();
    await deposer(ancien, pdf(100));
    const s = (await admin('/api/admin/etat')).body.conference.secretaire.lien.split('s=')[1];
    await appel(`/api/secretaire/designer?s=${s}`, { methode: 'POST', corps: { slide_id: 303 } });
    expect((await appel(`/api/conference/moi?c=${ancien}`)).res.status).toBe(403);
    expect([...env.KV.donnees.keys()].filter((k) => k.startsWith('conf_morceau:'))).toEqual([]);
    const [conf] = (await admin('/api/admin/etat')).body.conference.conferences;
    expect(conf).toMatchObject({ nom: 'Alex PETIT', depot: null });
  });

  it('l’admin peut désigner à la place du secrétaire', async () => {
    const r = await admin('/api/admin/conference/designer', { methode: 'POST', corps: { slide_id: 101 } });
    expect(r.body).toMatchObject({ nom: 'Paul MARTIN' });
  });
});

describe('dépôt des slides', () => {
  beforeEach(() => designerParSecretaire(202));

  it('PDF en plusieurs morceaux + contacts : validé, contacts jamais renvoyés au conférencier', async () => {
    const c = await lienConferencier();
    const octets = pdf(TAILLE_MORCEAU + 1000);
    const r = await deposer(c, octets, 'ma conf.pdf', ['Contact UN', 'Contact DEUX']);
    expect(r.body).toMatchObject({ ok: true, nb_contacts: 2 });
    const moi = (await appel(`/api/conference/moi?c=${c}`)).body;
    expect(moi.depot).toMatchObject({ nom_fichier: 'ma conf.pdf', type: 'pdf', taille: octets.byteLength, nb_contacts: 2 });
    expect(JSON.stringify(moi)).not.toContain('Contact UN');
    const [conf] = (await admin('/api/admin/etat')).body.conference.conferences;
    expect(conf.depot.contacts).toEqual(['Contact UN', 'Contact DEUX']);
    // l’admin télécharge le fichier reconstitué
    const f = await worker.fetch(new Request('https://bni.test/api/admin/conference/fichier?vendredi=2026-11-20', { headers: { 'X-Wassim-Auth': ADMIN } }), env);
    expect(new Uint8Array(await f.arrayBuffer())).toEqual(octets);
  });

  it('PowerPoint accepté, autres formats refusés, faux PDF refusé', async () => {
    const c = await lienConferencier();
    const pptx = new Uint8Array(50).fill(1);
    pptx.set([0x50, 0x4b, 3, 4]);
    expect((await deposer(c, pptx, 'conf.pptx')).body).toMatchObject({ ok: true });
    expect((await appel(`/api/conference/envoi?c=${c}`, { methode: 'POST', corps: { nom_fichier: 'conf.ppt', taille: 10 } })).res.status).toBe(400);
    expect((await appel(`/api/conference/envoi?c=${c}`, { methode: 'POST', corps: { nom_fichier: 'conf.pdf', taille: 200 * 1024 * 1024 } })).res.status).toBe(413);
    expect((await deposer(c, new Uint8Array(20).fill(65), 'faux.pdf')).res.status).toBe(400);
  });

  it('exige 1 à 3 contacts, et un fichier', async () => {
    const c = await lienConferencier();
    expect((await deposer(c, pdf(10), 'a.pdf', [])).res.status).toBe(400);
    expect((await deposer(c, pdf(10), 'a.pdf', ['1', '2', '3', '4'])).res.status).toBe(400);
    expect((await appel(`/api/conference/valider?c=${c}`, { methode: 'POST', corps: { contacts: ['X'] } })).res.status).toBe(400);
  });

  it('refuse un dépôt incomplet', async () => {
    const c = await lienConferencier();
    const e = await appel(`/api/conference/envoi?c=${c}`, { methode: 'POST', corps: { nom_fichier: 'a.pdf', taille: TAILLE_MORCEAU + 10 } });
    await appel(`/api/conference/morceau?c=${c}&envoi=${e.body.envoi}&n=0`, { methode: 'PUT', brut: pdf(TAILLE_MORCEAU) });
    const r = await appel(`/api/conference/valider?c=${c}`, { methode: 'POST', corps: { envoi: e.body.envoi, contacts: ['X'] } });
    expect(r.res.status).toBe(409);
  });

  it('plus de dépôt une fois la réunion passée', async () => {
    const c = await lienConferencier();
    vi.setSystemTime(new Date('2026-11-20T12:00:00Z')); // vendredi 13h Paris
    expect((await deposer(c, pdf(10))).res.status).toBe(409);
    expect((await appel(`/api/conference/moi?c=${c}`)).body.passee).toBe(true);
  });
});

describe('mails', () => {
  it('vendredi 14h : mail au secrétaire avec son lien et la note sur les sphères', async () => {
    await nommerSecretaire(101);
    const { body } = await admin('/api/admin/rappels?type=secretaire_vendredi&maintenant=2026-11-20T13:00:00Z');
    expect(body.vendredi).toBe('2026-11-27');
    expect(body.mails).toHaveLength(1);
    expect(body.mails[0]).toMatchObject({ email: 'paul@exemple.test' });
    expect(body.mails[0].sujet).toContain('vendredi 27 novembre');
    expect(body.mails[0].texte).toContain('https://bni.test/secretaire?s=');
    expect(body.mails[0].texte).toContain('un seul membre de la sphère');
  });

  it('lundi 9h : seulement si personne n’est désigné', async () => {
    await nommerSecretaire(101);
    const lundi = '2026-11-23T08:00:00Z'; // mandat commencé le 18
    expect((await admin(`/api/admin/rappels?type=secretaire_lundi&maintenant=${lundi}`)).body.mails).toHaveLength(1);
    await admin(`/api/admin/conference/designer?maintenant=${lundi}`, { methode: 'POST', corps: { slide_id: 202 } });
    expect((await admin(`/api/admin/rappels?type=secretaire_lundi&maintenant=${lundi}`)).body.mails).toHaveLength(0);
  });

  it('accord : trésorière / conférencière si renseigné, tournure neutre sinon (jamais d’écriture inclusive)', async () => {
    await nommerSecretaire(202);
    let r = (await admin('/api/admin/rappels?type=secretaire_vendredi&maintenant=2026-11-20T13:00:00Z')).body.mails[0].texte;
    expect(r).toContain("C'est à toi de désigner");
    await admin('/api/admin/genres', { methode: 'PUT', corps: { genres: { 202: 'f' } } });
    r = (await admin('/api/admin/rappels?type=secretaire_vendredi&maintenant=2026-11-20T13:00:00Z')).body.mails[0].texte;
    expect(r).toContain('En tant que secrétaire trésorière');
    await admin('/api/admin/conference/designer', { methode: 'POST', corps: { slide_id: 202 } });
    const [m] = (await admin('/api/admin/conference/notifications')).body.mails;
    expect(m.sujet).toContain("c'est toi la conférencière");
    expect(m.texte).toContain('cadeau de la conférencière');
    for (const t of [r, m.texte, m.sujet]) expect(t).not.toMatch(/·e|\(e\)|ier\.ère|eur\.rice/);
  });

  it('désignation : mail au conférencier (cadeau, contacts, lien), une seule fois après accusé', async () => {
    await designerParSecretaire(101);
    const { body } = await admin('/api/admin/conference/notifications');
    expect(body.mails).toHaveLength(1);
    const [m] = body.mails;
    expect(m).toMatchObject({ a: 'email', email: 'paul@exemple.test' });
    expect(m.sujet).toContain("c'est toi qui fais la conférence");
    expect(m.texte).toContain('cadeau du membre à l\'honneur');
    expect(m.texte).toContain('1 à 3 contacts spécifiques');
    expect(m.texte).toContain('https://bni.test/conference?c=');
    expect(m.texte).toContain('mercredi 18 novembre 19h');
    await admin('/api/admin/conference/notifications', { methode: 'POST', corps: { ids: [m.id] } });
    expect((await admin('/api/admin/conference/notifications')).body.mails).toHaveLength(0);
  });

  it('conférencier sans email : pas de mail, signalé', async () => {
    await designerParSecretaire(303);
    const { body } = await admin('/api/admin/conference/notifications');
    expect(body).toMatchObject({ mails: [], sans_email: ['Alex PETIT'] });
  });

  it('email ajouté après la désignation : la désignation et la relance partent quand même', async () => {
    await designerParSecretaire(303);
    await admin('/api/admin/emails', { methode: 'PUT', corps: { emails: { ...EMAILS, 303: 'alex@exemple.test' } } });
    const { body } = await admin('/api/admin/conference/notifications');
    expect(body.sans_email).toEqual([]);
    expect(body.mails).toHaveLength(1);
    expect(body.mails[0]).toMatchObject({ a: 'email', email: 'alex@exemple.test' });
    const relance = (await admin('/api/admin/rappels?type=conferencier_mercredi&maintenant=2026-11-18T13:00:00Z')).body;
    expect(relance.mails.map((m) => m.email)).toEqual(['alex@exemple.test']);
  });

  it('dépôt validé : mail à Wassim (« moi ») avec les demandes spécifiques', async () => {
    await designerParSecretaire(202);
    await deposer(await lienConferencier(), pdf(10), 'conf.pdf', ['Jeanne TEST – DRH – Exemple SA', 'Marc ESSAI – Gérant – Démo SARL']);
    const mails = (await admin('/api/admin/conference/notifications')).body.mails;
    const m = mails.find((x) => x.a === 'moi');
    expect(m.email).toBeUndefined(); // adresse lue par le script dans le compte Gmail
    expect(m.texte).toContain('a déposé ses slides : voici ses demandes spécifiques');
    expect(m.texte).toContain('1. Jeanne TEST – DRH – Exemple SA');
    expect(m.texte).toContain('2. Marc ESSAI – Gérant – Démo SARL');
    await admin('/api/admin/conference/notifications', { methode: 'POST', corps: { ids: [m.id] } });
    expect((await admin('/api/admin/conference/notifications')).body.mails.filter((x) => x.a === 'moi')).toHaveLength(0);
  });

  it('mercredi 14h : relance du conférencier seulement s’il n’a rien déposé', async () => {
    await designerParSecretaire(202);
    const url = '/api/admin/rappels?type=conferencier_mercredi&maintenant=2026-11-18T13:00:00Z';
    const r = (await admin(url)).body;
    expect(r.mails).toHaveLength(1);
    expect(r.mails[0].sujet).toContain('avant ce soir 19h');
    await deposer(await lienConferencier(), pdf(10));
    expect((await admin(url)).body.mails).toHaveLength(0);
  });

  it('les rappels infomerciales restent inchangés', async () => {
    expect((await admin('/api/admin/rappels?type=lundi')).body.type).toBe('lundi');
    expect((await admin('/api/admin/rappels?type=autre')).res.status).toBe(400);
  });
});

describe('job et nettoyage', () => {
  beforeEach(() => designerParSecretaire(202));

  it('le job reçoit la conférence à poser (sans les contacts), puis plus rien une fois posée', async () => {
    const octets = pdf(TAILLE_MORCEAU + 5);
    await deposer(await lienConferencier(), octets, 'conf.pdf', ['Secret CONTACT']);
    const entree = (await admin('/api/job/entree')).body;
    expect(entree.conference).toMatchObject({ vendredi: '2026-11-20', type: 'pdf', morceaux: 2, taille: octets.byteLength });
    expect(JSON.stringify(entree)).not.toContain('Secret CONTACT');
    const m0 = await worker.fetch(new Request(`https://bni.test/api/job/conference/morceau/${entree.conference.envoi}/0`, { headers: { 'X-Wassim-Auth': ADMIN } }), env);
    expect((await m0.arrayBuffer()).byteLength).toBe(TAILLE_MORCEAU);
    await admin('/api/job/resultat', { methode: 'POST', corps: { ok: true, message: 'ok', conference: { vendredi: '2026-11-20', valide_le: entree.conference.valide_le, ok: true, slides: 7 } } });
    expect((await admin('/api/job/entree')).body.conference).toBeNull();
    const [conf] = (await admin('/api/admin/etat')).body.conference.conferences;
    expect(conf.applique).toMatchObject({ ok: true, slides: 7 });
  });

  it('échec de la pose : le prochain passage réessaie', async () => {
    await deposer(await lienConferencier(), pdf(10));
    const { conference: c } = (await admin('/api/job/entree')).body;
    await admin('/api/job/resultat', { methode: 'POST', corps: { ok: true, message: 'ok', conference: { ...c, ok: false, message: 'PDF illisible' } } });
    expect((await admin('/api/job/entree')).body.conference).not.toBeNull();
  });

  it('nouveau dépôt après la pose : reposé au passage suivant', async () => {
    const c = await lienConferencier();
    await deposer(c, pdf(10));
    const { conference: v1 } = (await admin('/api/job/entree')).body;
    await admin('/api/job/resultat', { methode: 'POST', corps: { ok: true, conference: { ...v1, ok: true, slides: 3 } } });
    vi.advanceTimersByTime(1000);
    await deposer(c, pdf(20));
    expect((await admin('/api/job/entree')).body.conference.valide_le).not.toBe(v1.valide_le);
  });

  it('nettoyage du samedi : retire la conférence de la réunion passée et efface ses fichiers', async () => {
    await deposer(await lienConferencier(), pdf(10));
    vi.setSystemTime(new Date('2026-11-21T06:30:00Z')); // samedi 7h30 Paris
    const plan = (await admin('/api/job/nettoyage')).body;
    expect(plan.conference_jusqu_au).toBe('2026-11-20');
    const r = (await admin('/api/job/nettoyage', { methode: 'POST', corps: { ok: true, semaine: plan.semaine, conference: 7 } })).body;
    expect(r).toMatchObject({ conference: 7, fichiers_conference_effaces: 1 });
    expect([...env.KV.donnees.keys()].filter((k) => k.startsWith('conf_morceau:'))).toEqual([]);
    expect(JSON.parse(env.KV.donnees.get('jetons_conference'))).toEqual({});
  });
});
