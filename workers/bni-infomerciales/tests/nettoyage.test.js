// Nettoyage hebdo du samedi : plan donné au job, résultat enregistré.
import { describe, it, expect, beforeEach } from 'vitest';
import worker from '../src/index.js';
import { semaineANettoyer } from '../src/nettoyage.js';

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

const ADMIN = 'admin-secret';
// semaine du lundi 16/11/2026, réunion le vendredi 20/11 : coupure 12:00 Paris = 11:00 UTC
const SAMEDI = '2026-11-21T06:00:00Z'; // 07:00 à Paris
const AVANT = '2026-11-18T17:00:00Z'; // mercredi, dépôt pour la réunion passée
const APRES = '2026-11-20T15:00:00Z'; // vendredi après-midi, pour la semaine suivante
let env;

async function appel(path, { methode = 'GET', corps, admin = ADMIN } = {}) {
  const headers = {};
  if (admin) headers['X-Wassim-Auth'] = admin;
  const body = corps === undefined ? undefined : JSON.stringify(corps);
  if (body) headers['Content-Type'] = 'application/json';
  const res = await worker.fetch(new Request(`https://bni.test${path}`, { method: methode, headers, body }), env);
  return { res, body: await res.json() };
}
const mettre = (cle, valeur) => env.KV.put(cle, typeof valeur === 'string' ? valeur : JSON.stringify(valeur));
const a = (cle) => env.KV.donnees.has(cle);

beforeEach(async () => {
  env = { KV: new KVMemoire(), WASSIM_AUTH_TOKEN: ADMIN };
  await mettre('membres', [
    { slide_id: 1, nom: 'Membre A', metier: 'm', recherche: 'Demande A', a_une_photo: true },
    { slide_id: 2, nom: 'Membre B', metier: 'm', recherche: 'Demande B', a_une_photo: true },
    { slide_id: 3, nom: 'Membre C', metier: 'm', recherche: '', a_une_photo: false },
  ]);
  await mettre('ms', { rclone_token: 'x', drive_id: 'd', item_id: 'i' });
  // A : posé pour la réunion passée ; B : nouveau dépôt déjà posé vendredi soir
  await mettre('applique:1', { slide_id: 1, recherche: 'Demande A', a_photo: true, date: AVANT, statut: 'pose' });
  await mettre('photo_appliquee:1', 'jpeg-a');
  await mettre('applique:2', { slide_id: 2, recherche: 'Demande B', a_photo: true, date: APRES, statut: 'pose' });
  await mettre('photo_appliquee:2', 'jpeg-b');
  // C : un dépôt jamais posé (périmé), puis A a déjà renvoyé pour la semaine suivante
  await mettre('depot:3', { slide_id: 3, recherche: 'Vieux', a_photo: true, date: AVANT });
  await mettre('photo:3', 'jpeg-c');
  await mettre('depot:1', { slide_id: 1, recherche: 'Nouvelle A', a_photo: true, date: APRES });
  await mettre('photo:1', 'jpeg-a2');
  await mettre('envois:2026-11-16', { 1: { photo: true, demande: true } });
});

describe('semaine à nettoyer', () => {
  it('samedi matin : la semaine de la réunion de la veille', () => {
    expect(semaineANettoyer(new Date(SAMEDI))).toEqual({ semaine: '2026-11-16', coupure: '2026-11-20 12:00' });
  });

  it('avant la coupure du vendredi : la semaine précédente, jamais la réunion à venir', () => {
    expect(semaineANettoyer(new Date('2026-11-20T10:59:00Z')).semaine).toBe('2026-11-09');
    expect(semaineANettoyer(new Date('2026-11-20T11:00:00Z')).semaine).toBe('2026-11-16');
    expect(semaineANettoyer(new Date('2026-11-23T08:00:00Z')).semaine).toBe('2026-11-16'); // lundi suivant
  });

  it('heure d’été : coupure toujours à 12:00 heure de Paris', () => {
    expect(semaineANettoyer(new Date('2026-07-03T09:59:00Z')).semaine).toBe('2026-06-22');
    expect(semaineANettoyer(new Date('2026-07-03T10:00:00Z'))).toEqual({ semaine: '2026-06-29', coupure: '2026-07-03 12:00' });
  });
});

describe('plan et résultat du nettoyage', () => {
  it('réservé au job (même jeton que /api/job/*)', async () => {
    expect((await appel(`/api/job/nettoyage?maintenant=${SAMEDI}`, { admin: '' })).res.status).toBe(401);
    expect((await appel('/api/job/nettoyage', { methode: 'POST', admin: 'faux', corps: { ok: true } })).res.status).toBe(401);
  });

  it('donne le plan : slides à préserver, accès OneDrive, pas encore fait', async () => {
    const { body } = await appel(`/api/job/nettoyage?maintenant=${SAMEDI}`);
    expect(body).toMatchObject({ semaine: '2026-11-16', coupure: '2026-11-20 12:00', deja_fait: false, preserver: [2], ms: { item_id: 'i' } });
    expect(body.membres).toHaveLength(3);
  });

  it('nettoyage réussi : statuts de la semaine remis à zéro, nouveaux dépôts gardés', async () => {
    const { body } = await appel(`/api/job/nettoyage?maintenant=${SAMEDI}`, { methode: 'POST', corps: {
      ok: true, semaine: '2026-11-16', message: '1 slide vidée', nettoyees: [{ slide_id: 1 }], deja_vides: [3], preservees: [2], non_reconnues: 1, sauvegarde: 'copie',
    } });
    expect(body).toMatchObject({ ok: true, nettoyees: 1, deja_vides: 1, preservees: 1, non_reconnues: 1, statuts_remis_a_zero: 1, depots_perimes: 1 });

    expect([a('applique:1'), a('photo_appliquee:1')]).toEqual([false, false]);
    expect([a('applique:2'), a('photo_appliquee:2')]).toEqual([true, true]); // posé pour la semaine suivante
    expect([a('depot:3'), a('photo:3')]).toEqual([false, false]); // jamais posé, réunion passée
    expect([a('depot:1'), a('photo:1')]).toEqual([true, true]); // reçu après la réunion
    expect(await env.KV.get('envois:2026-11-16', 'json')).toEqual({ 1: { photo: true, demande: true } });

    const membres = await env.KV.get('membres', 'json');
    expect(membres.map((m) => [m.recherche, m.a_une_photo])).toEqual([['', false], ['Demande B', true], ['', false]]);

    const plan = await appel(`/api/job/nettoyage?maintenant=2026-11-21T13:00:00Z`);
    expect(plan.body.deja_fait).toBe(true); // créneaux de rattrapage : rien à refaire
    const { body: etat } = await appel('/api/admin/etat');
    expect(etat.dernier_nettoyage).toMatchObject({ ok: true, semaine: '2026-11-16', nettoyees: 1 });
  });

  it('échec (deck verrouillé) : rien n’est effacé, le créneau suivant réessaie', async () => {
    const { body } = await appel(`/api/job/nettoyage?maintenant=${SAMEDI}`, { methode: 'POST', corps: { ok: false, semaine: '2026-11-16', message: 'échec : deck ouvert' } });
    expect(body.ok).toBe(false);
    expect([a('applique:1'), a('depot:3')]).toEqual([true, true]);
    expect((await appel(`/api/job/nettoyage?maintenant=${SAMEDI}`)).body.deja_fait).toBe(false);
    expect((await appel('/api/admin/etat')).body.dernier_nettoyage).toMatchObject({ ok: false, message: 'échec : deck ouvert' });
  });

  it('refuse un résultat qui ne correspond pas à la semaine du plan', async () => {
    const { res } = await appel(`/api/job/nettoyage?maintenant=${SAMEDI}`, { methode: 'POST', corps: { ok: true, semaine: '2026-11-09' } });
    expect(res.status).toBe(409);
    expect(a('applique:1')).toBe(true);
  });

  it('l’admin affiche le dernier nettoyage', async () => {
    const page = await worker.fetch(new Request('https://bni.test/admin'), env);
    expect(await page.text()).toContain('Dernier nettoyage');
  });
});
