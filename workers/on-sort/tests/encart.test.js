import { describe, it, expect } from 'vitest';
import { PAGES, calculerEncart, rendre } from '../src/encart.js';

const MARDI = '2026-10-06';

describe('pages : quel jour ?', () => {
  it('week-end, âge, après l\'école, saisons', () => {
    expect(PAGES['ce-week-end'].date(MARDI)).toBe('2026-10-10');
    expect(PAGES['ce-week-end'].date(MARDI, 'dimanche')).toBe('2026-10-11');
    expect(PAGES['ce-week-end'].date('2026-10-10')).toBe('2026-10-10'); // samedi même
    expect(PAGES['2-ans'].date(MARDI)).toBe('2026-10-10');
    expect(PAGES['apres-l-ecole'].date('2026-10-07')).toBe('2026-10-08'); // mercredi → jeudi
    expect(PAGES['vacances-toussaint'].date(MARDI)).toBe('2026-10-17'); // avant : premier samedi de la saison
    expect(PAGES.noel.date('2026-12-26')).toBeNull(); // après : hors saison
  });
});

const evenement = (titre, extra = {}) => ({
  titre, description: 'Spectacle pour les enfants de 2 à 6 ans.', motsCles: [], dateDebut: '2026-10-10', dateFin: '2026-10-10',
  creneaux: [], lat: 48.11, lon: -1.68, lieuNom: 'Salle', ville: 'Rennes', ...extra,
});

function deps(evenements) {
  return {
    lireParams: (u) => ({ lat: 48.1173, lon: -1.6778, rayonKm: 40, dateISO: u.searchParams.get('date') }),
    chargerSources: async () => ({ evenements, meteo: { pluie: false } }),
    lireSurcouche: async () => ({}),
    appliquerSurcouche: (e) => e,
  };
}

describe('calculerEncart', () => {
  it('rend le top, avec le bouton vers l\'app sur la bonne ville et le bon âge', async () => {
    const url = new URL('https://w/encart?ville=rennes&page=2-ans');
    const r = await calculerEncart(url, {}, deps([evenement('Marionnettes <b>du samedi</b>', { source: 'DATAtourisme', majLe: '2026-10-01' })]), MARDI);
    expect(r.statut).toBe(200);
    expect(r.html).toContain('Le top du moment à Rennes avec un enfant de 2 ans — samedi 10 octobre');
    expect(r.html).toContain('Marionnettes &lt;b&gt;du samedi&lt;/b&gt;'); // échappé
    expect(r.html).toContain('?ville=rennes&amp;age=2');
    expect(r.html).toContain('Source : DATAtourisme, mise à jour le 01/10/2026');
  });

  it('gratuit : ne garde que les sorties gratuites ; rien → 204', async () => {
    const url = new URL('https://w/encart?ville=rennes&page=gratuit');
    expect((await calculerEncart(url, {}, deps([evenement('Payant')]), MARDI)).statut).toBe(204);
    const r = await calculerEncart(url, {}, deps([evenement('Payant'), evenement('Libre', { gratuit: true })]), MARDI);
    expect(r.html).toContain('Libre');
    expect(r.html).not.toContain('Payant');
  });

  it('hors saison : 204 ; ville ou page inconnue : 400', async () => {
    expect((await calculerEncart(new URL('https://w/encart?ville=rennes&page=noel'), {}, deps([]), '2026-12-26')).statut).toBe(204);
    expect((await calculerEncart(new URL('https://w/encart?ville=lyon&page=gratuit'), {}, deps([]), MARDI)).statut).toBe(400);
    expect((await calculerEncart(new URL('https://w/encart?ville=rennes&page=x'), {}, deps([]), MARDI)).statut).toBe(400);
  });

  it('le rendu tient sans feuille de style (une section, une liste ordonnée)', () => {
    const html = rendre({ ville: { id: 'paris', nom: 'Paris' }, page: PAGES.gratuit, dateISO: '2026-10-10', age: 3, top: [evenement('A')] });
    expect(html.startsWith('<section class="pp-encart"')).toBe(true);
    expect(html).toContain('<ol class="pp-encart-liste"');
  });
});
