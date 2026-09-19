// Source expérimentale : l'API ouverte DATAtourisme (annoncée en mars 2026,
// endpoint /api/open/evenements.json filtrable par région/département).
// La doc exacte n'a pas pu être consultée depuis la session de dev (réseau
// restreint) : cet adaptateur SONDE les endpoints candidats de
// env.DATATOURISME_ENDPOINTS avec plusieurs noms de paramètre plausibles,
// et /diagnostic rapporte ce qui répond réellement. Une fois le bon couple
// endpoint+paramètre confirmé, le figer dans wrangler.toml.

const PARAMS_CANDIDATS = ['departement', 'dept', 'code_departement'];

function endpoints(env) {
  return (env.DATATOURISME_ENDPOINTS || '').split(',').map((s) => s.trim()).filter(Boolean);
}

/** Extrait un tableau d'événements d'une réponse de forme inconnue. */
function tableauDe(data) {
  if (Array.isArray(data)) return data;
  for (const cle of ['evenements', 'events', 'results', 'data', 'items']) {
    if (Array.isArray(data?.[cle])) return data[cle];
  }
  return null;
}

/** Premier champ défini parmi plusieurs noms possibles. */
function champ(obj, ...noms) {
  for (const n of noms) {
    if (obj?.[n] !== undefined && obj[n] !== null && obj[n] !== '') return obj[n];
  }
  return null;
}

function normaliser(r) {
  const titre = champ(r, 'nom', 'label', 'title', 'titre', 'name');
  if (!titre) return null;
  const lat = Number(champ(r, 'latitude', 'lat'));
  const lon = Number(champ(r, 'longitude', 'lon', 'lng'));
  return {
    source: 'datatourisme',
    id: champ(r, 'id', 'uid', 'identifier'),
    titre: String(titre),
    description: String(champ(r, 'description', 'shortDescription', 'resume') || '').slice(0, 1200),
    motsCles: [].concat(champ(r, 'categories', 'types', 'themes') || []).map(String),
    dateDebut: String(champ(r, 'date_debut', 'startDate', 'dateDebut', 'debut') || '').slice(0, 10) || null,
    dateFin: String(champ(r, 'date_fin', 'endDate', 'dateFin', 'fin') || '').slice(0, 10) || null,
    horaires: null,
    lieuNom: champ(r, 'lieu', 'placeName'),
    adresse: champ(r, 'adresse', 'address'),
    ville: champ(r, 'commune', 'ville', 'city', 'locality'),
    lat: Number.isFinite(lat) ? lat : null,
    lon: Number.isFinite(lon) ? lon : null,
    url: champ(r, 'url', 'link', 'web'),
    gratuit: null,
  };
}

/**
 * Tente chaque endpoint × paramètre jusqu'à obtenir un tableau JSON.
 * @param {{DATATOURISME_ENDPOINTS?: string}} env
 * @param {{codeDepartement: string}} params — ex. « 35 »
 * @returns {Promise<{ok: boolean, evenements: object[], endpoint?: string, erreurs: string[]}>}
 */
export async function evenementsDatatourisme(env, { codeDepartement }) {
  const erreurs = [];
  for (const base of endpoints(env)) {
    for (const param of PARAMS_CANDIDATS) {
      const url = `${base}?${param}=${encodeURIComponent(codeDepartement)}`;
      try {
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!res.ok) { erreurs.push(`${url} → HTTP ${res.status}`); continue; }
        const data = await res.json();
        const brut = tableauDe(data);
        if (!brut) { erreurs.push(`${url} → forme JSON inconnue`); continue; }
        return { ok: true, endpoint: url, evenements: brut.map(normaliser).filter(Boolean), erreurs };
      } catch (e) {
        erreurs.push(`${url} → ${String(e.message || e)}`);
      }
    }
  }
  return { ok: false, evenements: [], erreurs };
}
