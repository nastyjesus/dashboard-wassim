// Client du worker on-sort-poc. L'app ne calcule rien : elle affiche le top
// pré-mâché par le worker (sources, scoring, météo).

import { WORKER_URL, RAYON_KM } from './config.js';

/**
 * @param {{dateISO: string, lat: number, lon: number, age: number, dept?: string, code?: string}} params
 * @returns {Promise<object>} la réponse /top du worker
 */
export async function chargerTop({ dateISO, lat, lon, age, dept, code }) {
  let url = `${WORKER_URL}/top?date=${dateISO}&lat=${lat}&lon=${lon}&age=${age}&rayon=${RAYON_KM}`;
  if (dept) url += `&dept=${encodeURIComponent(dept)}`;
  if (code) url += `&code=${encodeURIComponent(code)}`;
  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), 15000);
  try {
    const res = await fetch(url, { signal: controleur.signal });
    if (!res.ok) throw new Error(`Le service a répondu ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(minuteur);
  }
}
