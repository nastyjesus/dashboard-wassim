// Prévision météo du jour demandé via Open-Meteo (sans clé, gratuit hors
// usage commercial — à remplacer par leur offre payante ou Météo-France
// open data avant monétisation). Retourne null si la date est hors fenêtre
// de prévision (~16 jours) ou si l'API ne répond pas : le scoring continue
// alors sans composante météo.

/** Codes WMO considérés comme pluvieux (bruine, pluie, averses, orage, neige). */
function codePluvieux(code) {
  return (code >= 51 && code <= 67) || (code >= 71 && code <= 86) || code >= 95;
}

function resume(code, pluie, tmax) {
  const libelle = pluie ? 'Pluie probable' : code <= 3 ? 'Beau temps' : 'Temps couvert';
  return `${libelle}, ${Math.round(tmax)}°C max`;
}

/**
 * @returns {Promise<{tmax:number, precipProb:number, code:number, pluie:boolean, resume:string}|null>}
 */
export async function previsionJour(env, lat, lon, dateISO) {
  const base = env.METEO_BASE || 'https://api.open-meteo.com/v1/forecast';
  const url = `${base}?latitude=${lat}&longitude=${lon}`
    + `&daily=weather_code,temperature_2m_max,precipitation_probability_max`
    + `&timezone=Europe%2FParis&start_date=${dateISO}&end_date=${dateISO}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const d = data.daily;
    if (!d || !d.time || !d.time.length) return null;
    const code = d.weather_code[0];
    const precipProb = d.precipitation_probability_max[0] ?? 0;
    const tmax = d.temperature_2m_max[0];
    const pluie = precipProb >= 50 || codePluvieux(code);
    return { tmax, precipProb, code, pluie, resume: resume(code, pluie, tmax) };
  } catch {
    return null;
  }
}
