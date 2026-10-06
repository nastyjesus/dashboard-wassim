import { describe, it, expect, vi, afterEach } from 'vitest';
import { normaliser, evenementsMediathequesLorient } from '../src/sources/mediatheques-lorient.js';
import { analyseFamille, trancheAge } from '../src/famille.js';

// Items relevés tels quels dans le flux du 5 octobre 2026 (styles des badges abrégés).
const badge = (texte) => `<a target="_blank" class="badge" href="https://mediatheque.lorient.bzh/node/tag/tid/1" style="color:#333 !important;" >
                    ${texte}                </a>`;
const item = ({ titre, lien, badges, corps, pubDate }) => `
            <title><![CDATA[${titre}]]></title>
            <link>${lien}</link>
            <description><![CDATA[
                    <div class="node-item-tags">${badges.map(badge).join('')}</div>
                <p>${corps}</p>
            ]]></description>
            <pubDate>${pubDate}</pubDate>
            <source>https://mediatheque.lorient.bzh/</source>`;

const ptitesOreilles = item({
  titre: "Les p'tites oreilles", lien: 'https://mediatheque.lorient.bzh/conte',
  badges: ['Médiathèque de Keryado', 'Lectures', 'Petite enfance'],
  corps: '<h4>L&#39;accueil des Tout-petits change de nom !</h4><p>Lectures, comptines, chansons et jeux de doigts ...Un moment de d&eacute;tente et de d&eacute;couverte r&eacute;serv&eacute; aux enfants de leur naissance &agrave; 3 ans et &agrave; leur famille !</p>',
  pubDate: 'Wed, 07 Oct 2026 10:30:00 +0200',
});
const overcooked = item({
  titre: 'À vos manettes : tournoi Overcooked', lien: 'https://mediatheque.lorient.bzh/espace-jeux-video',
  badges: ['Médiathèque François Mitterrand', 'Famille', 'Jeu Vidéo'],
  corps: '<h4>En cuisine pour un tournoi coop&eacute;ratif en &eacute;quipe</h4><p>&gt; Sur inscription<br /> &gt; &Agrave; partir de 7 ans</p>',
  pubDate: 'Sat, 10 Oct 2026 14:30:00 +0200',
});
const atelierAdulte = item({
  titre: 'Podcast participatif', lien: 'https://mediatheque.lorient.bzh/podcast',
  badges: ['Atelier numérique', 'Médiathèque François Mitterrand'],
  corps: '<p>Enregistrez votre premier podcast.</p>', pubDate: 'Sat, 10 Oct 2026 10:00:00 +0200',
});
const senior = item({
  titre: 'Ma mère, Dieu et Sylvie Vartan', lien: 'https://mediatheque.lorient.bzh/semaine-bleue',
  badges: ['Projection', 'Senior', 'Médiathèque de Kervénanec'],
  corps: '<p>Projection.</p>', pubDate: 'Tue, 06 Oct 2026 14:30:00 +0200',
});

describe('médiathèques de Lorient : lecture du flux', () => {
  it('date, heure locale, lieu géocodé, texte décodé, public en tête de description', () => {
    const ev = normaliser(ptitesOreilles);
    expect(ev).toMatchObject({
      origine: 'mediatheques-lorient', source: null, titre: "Les p'tites oreilles",
      dateDebut: '2026-10-07', dateFin: '2026-10-07',
      creneaux: [{ debut: '2026-10-07T10:30', fin: null }],
      lieuNom: 'Médiathèque de Keryado', adresse: '24 rue de Kersabiec, 56100 Lorient',
      lat: 47.764416, lon: -3.385134, ville: 'Lorient', gratuit: true,
      motsCles: ['Lectures'],
    });
    expect(ev.description).toMatch(/^Pour les tout-petits de 0 à 3 ans\nL'accueil des Tout-petits/);
    expect(ev.description).toContain('réservé aux enfants de leur naissance à 3 ans');
    expect(ev.description).not.toContain('Médiathèque de Keryado'); // badges retirés du texte
  });

  it('les étiquettes de public pilotent la détection famille et l’âge', () => {
    const tout = normaliser(ptitesOreilles);
    expect(analyseFamille(tout).score).toBeGreaterThanOrEqual(2);
    expect(trancheAge(tout)).toEqual({ min: 0, max: 3 });

    const famille = normaliser(overcooked);
    expect(analyseFamille(famille).score).toBeGreaterThanOrEqual(2);
    expect(trancheAge(famille)).toEqual({ min: 7, max: null }); // « À partir de 7 ans » : pas pour un 3 ans

    expect(analyseFamille(normaliser(atelierAdulte)).score).toBeLessThan(1); // pas de public enfant
    expect(analyseFamille(normaliser(senior)).score).toBe(-1);
  });
});

describe('médiathèques de Lorient : interrogation', () => {
  afterEach(() => vi.unstubAllGlobals());
  const flux = `<?xml version="1.0"?><rss><channel>${[ptitesOreilles, overcooked, atelierAdulte].map((i) => `<item>${i}</item>`).join('')}</channel></rss>`;

  it('ne garde que les séances du jour demandé, étiquetées pour un public enfant', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(flux)));
    const r = await evenementsMediathequesLorient({}, { lat: 47.748, lon: -3.366, rayonKm: 25, dateISO: '2026-10-10' });
    expect(r.ok).toBe(true);
    expect(r.seancesDuJour).toBe(2); // Overcooked (Famille) + Podcast (aucun public)
    expect(r.evenements.map((e) => e.titre)).toEqual(['À vos manettes : tournoi Overcooked']);
  });

  it('séance sans étiquette de public : écartée même si le texte ressemble à une sortie enfant', async () => {
    const dedicace = item({
      titre: 'Carine-M et Élian Black’Mor : vente et dédicace', lien: 'https://mediatheque.lorient.bzh/dedicace',
      badges: ['Rencontre', 'Médiathèque François Mitterrand'],
      corps: '<p>Un univers fantastique, comme au cœur d’un conte.</p>', pubDate: 'Sat, 17 Oct 2026 14:00:00 +0200',
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(`<rss><item>${dedicace}</item></rss>`)));
    const r = await evenementsMediathequesLorient({}, { lat: 47.748, lon: -3.366, rayonKm: 25, dateISO: '2026-10-17' });
    expect(r).toMatchObject({ ok: true, seancesDuJour: 1, evenements: [] });
  });

  it('flux sans aucun item (page d’erreur, blocage) : source en panne, pas journée vide', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>Access denied</html>')));
    const r = await evenementsMediathequesLorient({}, { lat: 47.748, lon: -3.366, rayonKm: 25, dateISO: '2026-10-10' });
    expect(r).toEqual({ ok: false, evenements: [], erreur: 'flux_vide' });
  });

  it('loin de Lorient : aucun appel au flux', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const r = await evenementsMediathequesLorient({}, { lat: 48.1173, lon: -1.6778, rayonKm: 40, dateISO: '2026-10-10' });
    expect(r).toEqual({ ok: true, evenements: [], horsZone: true });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('flux en panne : source déclarée en erreur, pas d’exception', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 503 })));
    const r = await evenementsMediathequesLorient({}, { lat: 47.748, lon: -3.366, rayonKm: 25, dateISO: '2026-10-10' });
    expect(r).toEqual({ ok: false, evenements: [], erreur: 'HTTP 503' });
  });
});
