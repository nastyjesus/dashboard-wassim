import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  plage, parserPinder, parserGruss, parserMedrano, actualiserTournees, evenementsCirques,
} from '../src/sources/cirques.js';
import { normaliser as normaliserParis, creneaux, ageAudience, evenementsParis } from '../src/sources/paris.js';
import { scorer } from '../src/scoring.js';

afterEach(() => vi.unstubAllGlobals());

// Extraits réels relevés le 6 octobre 2026 (structure conservée, contenu réduit).
const PINDER = `
<div class="jet-posts__item"> <div class="post-thumbnail"><a href="https://www.cirquepinder.com/reservations/caen/"></a></div>
<h4 class="entry-title"><a href="https://www.cirquepinder.com/reservations/caen/" target="">CAEN</a></h4>
<div class="jet-title-fields__item jet-title-fields__item-intervalle_date"><div class="jet-title-fields__item-label"><span></span></div><div class="jet-title-fields__item-value">du 09 au 11 Octobre 2026</div></div>
<div class="jet-title-fields__item jet-title-fields__item-lieu"><div class="jet-title-fields__item-label"><span></span></div><div class="jet-title-fields__item-value">Parc des Expositions</div></div></div>
<div class="jet-posts__item"> <h4 class="entry-title"><a href="https://www.cirquepinder.com/reservations/paris/">PARIS</a></h4>
<div class="jet-title-fields__item-intervalle_date"><div class="jet-title-fields__item-value">Du 11 Novembre 2026 au 24 Janvier 2027</div></div></div>`;

const GRUSS = `
<a href="https://www.cirque-gruss.com/villes/paris" class="tournee-item" rel=""> <span class="tournee-item-city">Paris</span> <span class="tournee-item-dates">4 déc. - 13 déc. </span></a>
<a href="https://www.cirque-gruss.com/villes/bordeaux" class="tournee-item" rel=""> <span class="tournee-item-city">Bordeaux</span> <span class="tournee-item-dates">18 déc. - 24 janv. 2027</span></a>
<a href="https://www.cirque-gruss.com/villes/rouen" class="tournee-item" rel=""> <span class="tournee-item-city">Rouen</span> <span class="tournee-item-dates">5 févr. - 14 févr. 2027</span></a>`;

const MEDRANO = `
<h2 class="t">Le spectacle de 2026</h2>
<h2 class="t">Du 10 octobre au 22 novembre 2026</h2> <h2 class="t">LYON</h2> <div><p><strong>Quai Perrache &#8211; La Confluence</strong></p></div>
<h2 class="t">Le spectacle de 2026</h2>
<h2 class="t">Dès le 9 décembre 2026</h2> <h2 class="t"><a href="https://www.cirquemedrano.fr/marseille/">MARSEILLE</a></h2> <p><strong>Esplanade du J4</strong></p>`;

describe('tournées des cirques — lecture des dates', () => {
  it('lit les formats de plage des trois sites', () => {
    expect(plage('du 02 Octobre au 04 Octobre 2026', 2026)).toEqual({ debut: '2026-10-02', fin: '2026-10-04' });
    expect(plage('du 09 au 11 Octobre 2026', 2026)).toEqual({ debut: '2026-10-09', fin: '2026-10-11' });
    expect(plage('du 17 Octobre 2026 au 1er Novembre 2026', 2026)).toEqual({ debut: '2026-10-17', fin: '2026-11-01' });
    expect(plage('18 déc. - 24 janv. 2027', 2026)).toEqual({ debut: '2026-12-18', fin: '2027-01-24' });
    expect(plage('Dès le 9 décembre 2026', 2026)).toEqual({ debut: '2026-12-09', fin: null });
    expect(plage('Le spectacle de 2026', 2026)).toBeNull();
  });

  it('Pinder : ville, dates, lieu, lien', () => {
    const r = parserPinder(PINDER);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ cirque: 'Cirque Pinder', ville: 'Caen', debut: '2026-10-09', fin: '2026-10-11', lieu: 'Parc des Expositions' });
    expect(r[1]).toMatchObject({ ville: 'Paris', debut: '2026-11-11', fin: '2027-01-24' });
  });

  it('Gruss : l\'année absente se déduit de l\'ordre de la tournée', () => {
    const r = parserGruss(GRUSS, 2026);
    expect(r.map((d) => [d.ville, d.debut, d.fin])).toEqual([
      ['Paris', '2026-12-04', '2026-12-13'],
      ['Bordeaux', '2026-12-18', '2027-01-24'],
      ['Rouen', '2027-02-05', '2027-02-14'],
    ]);
  });

  it('Medrano : ville avec ou sans lien, lieu en gras, « Dès le » sans fin', () => {
    const r = parserMedrano(MEDRANO);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ ville: 'Lyon', debut: '2026-10-10', fin: '2026-11-22', lieu: 'Quai Perrache – La Confluence' });
    expect(r[1]).toMatchObject({ ville: 'Marseille', debut: '2026-12-09', fin: null, url: 'https://www.cirquemedrano.fr/marseille/' });
  });
});

function kvMemoire() {
  const m = new Map();
  return {
    m,
    get: async (k, type) => (m.has(k) ? (type === 'json' ? JSON.parse(m.get(k)) : m.get(k)) : null),
    put: async (k, v) => { m.set(k, v); },
  };
}

describe('tournées des cirques — cron et /top', () => {
  it('relit les sites, géocode, et garde les dates d\'un site en panne', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-06T05:00:00Z'));
    const VOTES = kvMemoire();
    let panneGruss = false;
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const u = String(url);
      if (u.includes('cirquepinder')) return new Response(PINDER);
      if (u.includes('cirque-gruss')) return panneGruss ? new Response('', { status: 500 }) : new Response(GRUSS);
      if (u.includes('cirquemedrano')) return new Response('<html>refonte</html>');
      if (u.includes('geocoding-api')) {
        const nom = new URL(u).searchParams.get('name');
        const coords = { Paris: [48.85, 2.35], Bordeaux: [44.84, -0.58] }[nom] || [47, 0];
        return Response.json({ results: [{ latitude: coords[0], longitude: coords[1] }] });
      }
      return new Response('?', { status: 404 });
    }));
    const r1 = await actualiserTournees({ VOTES });
    expect(r1.sites.pinder).toMatchObject({ ok: true, dates: 2 });
    expect(r1.sites.gruss).toMatchObject({ ok: true, dates: 3 });
    expect(r1.sites.medrano).toMatchObject({ ok: false, erreur: 'aucune_date' }); // refonte signalée

    panneGruss = true;
    const r2 = await actualiserTournees({ VOTES });
    expect(r2.sites.gruss).toMatchObject({ ok: false, gardees: 3 });
    expect(r2.dates).toBe(r1.dates);

    const paris = await evenementsCirques({ VOTES }, { lat: 48.8534, lon: 2.3488, rayonKm: 40, dateISO: '2026-12-05' });
    expect(paris.evenements.map((e) => e.titre).sort()).toEqual(['Cirque Arlette Gruss à Paris', 'Cirque Pinder à Paris']);
    const rennes = await evenementsCirques({ VOTES }, { lat: 48.11, lon: -1.68, rayonKm: 40, dateISO: '2026-12-05' });
    expect(rennes.evenements).toEqual([]);
    vi.useRealTimers();
  });

  it('un cirque de la tournée est « À ne pas rater », même installé deux mois', async () => {
    const VOTES = kvMemoire();
    VOTES.m.set('cirques:tournees', JSON.stringify({
      le: '2026-10-06', sites: {},
      dates: [{ cirque: 'Cirque Pinder', ville: 'Paris', lieu: 'Pelouse de Reuilly', debut: '2026-11-11', fin: '2027-01-24', lat: 48.835, lon: 2.405, site: 'pinder', majLe: '2026-10-06' }],
    }));
    const { evenements } = await evenementsCirques({ VOTES }, { lat: 48.8534, lon: 2.3488, rayonKm: 40, dateISO: '2026-12-05' });
    const r = scorer(evenements[0], { lat: 48.8534, lon: 2.3488, age: 3, dateISO: '2026-12-05' });
    expect(r.raisons).toContain('À ne pas rater');
    expect(r.raisons).toContain('Ouvert aux enfants');
    expect(r.source).toBe('Cirque Pinder (site officiel)');
  });
});

describe('Que faire à Paris', () => {
  const brut = {
    id: '1', title: 'Les racontines du samedi matin', url: 'https://www.paris.fr/evenements/1',
    audience: 'Public tout-petits et enfants. A partir de -1 ans. Jusqu\'à 6 ans.',
    lead_text: 'Des histoires pour les petits.', description: '<p>Entrée libre.</p>',
    date_start: '2026-10-10T11:30:00+00:00', date_end: '2026-10-10T12:00:00+00:00',
    occurrences: '2026-10-10T10:30:00+02:00_2026-10-10T11:00:00+02:00',
    date_description: 'Le samedi 10 octobre 2026<br />de 10h30 à 11h00<br />',
    address_name: 'Bibliothèque Benoîte Groult', address_street: '25 rue du Commandant Mouchotte',
    address_zipcode: '75014', address_city: 'Paris', lat_lon: { lat: 48.84, lon: 2.32 },
    price_type: 'gratuit', qfap_tags: 'Enfants;Littérature', event_indoor: 1, updated_at: '2026-10-01T14:33:36+00:00',
  };

  it('lit séances, âge, lieu et mention de source', () => {
    const ev = normaliserParis(brut);
    expect(ev).toMatchObject({
      origine: 'paris', source: 'Que faire à Paris (Ville de Paris)', majLe: '2026-10-01',
      dateDebut: '2026-10-10', ageMin: 0, ageMax: 6, lieuType: 'interieur', gratuit: true,
      adresse: '25 rue du Commandant Mouchotte, 75014 Paris', motsCles: ['Enfants', 'Littérature'],
    });
    expect(ev.creneaux).toEqual([{ debut: '2026-10-10T10:30:00+02:00', fin: '2026-10-10T11:00:00+02:00' }]);
    expect(scorer(ev, { lat: 48.8534, lon: 2.3488, age: 3, dateISO: '2026-10-10' })).not.toBeNull();
  });

  it('âge : bornes optionnelles', () => {
    expect(ageAudience('Public enfants. A partir de 3 ans.')).toEqual({ min: 3, max: null });
    expect(ageAudience('Public tout-petits. Jusqu\'à 3 ans.')).toEqual({ min: 0, max: 3 });
    expect(ageAudience('Tout public.')).toBeNull();
    expect(creneaux(null)).toEqual([]);
  });

  it('ne s\'interroge pas hors de Paris', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const r = await evenementsParis({}, { lat: 48.11, lon: -1.68, rayonKm: 40, dateISO: '2026-10-10' });
    expect(r.horsZone).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
});
