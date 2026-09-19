// Client du worker papa-tribu + identité locale. L'identité est un jeton
// opaque gardé sur le téléphone (pas d'e-mail, pas de mot de passe).

import AsyncStorage from '@react-native-async-storage/async-storage';

export const TRIBU_URL = 'https://papa-tribu.loumiwassim.workers.dev';
const CLE_IDENTITE = 'pp:tribu';

async function requete(chemin, { methode = 'GET', corps, jeton } = {}) {
  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), 15000);
  try {
    const res = await fetch(`${TRIBU_URL}${chemin}`, {
      method: methode,
      signal: controleur.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}),
      },
      body: corps ? JSON.stringify(corps) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || `Le service a répondu ${res.status}`);
    return data;
  } finally {
    clearTimeout(minuteur);
  }
}

export async function lireIdentite() {
  try {
    const brut = await AsyncStorage.getItem(CLE_IDENTITE);
    const id = brut ? JSON.parse(brut) : null;
    return id && id.jeton ? id : null;
  } catch {
    return null;
  }
}

export async function inscrire({ pseudo, ville, dept }) {
  const data = await requete('/inscription', { methode: 'POST', corps: { pseudo, ville, dept } });
  const identite = {
    jeton: data.jeton,
    pseudo: data.papa.pseudo,
    numero: data.papa.numero,
    fondateur: data.papa.fondateur,
  };
  try {
    await AsyncStorage.setItem(CLE_IDENTITE, JSON.stringify(identite));
  } catch { /* l'identité vivra le temps de la session */ }
  return identite;
}

export function chargerFil(dept, jeton) {
  return requete(`/fil?dept=${encodeURIComponent(dept || '')}`, { jeton });
}

export function publierPost({ type, texte }, jeton) {
  return requete('/posts', { methode: 'POST', corps: { type, texte }, jeton });
}

export function basculerPouce(postId, jeton) {
  return requete(`/posts/${postId}/reaction`, { methode: 'POST', jeton });
}

export function chargerCommentaires(postId) {
  return requete(`/posts/${postId}/commentaires`);
}

export function commenter(postId, texte, jeton) {
  return requete(`/posts/${postId}/commentaires`, { methode: 'POST', corps: { texte }, jeton });
}

export function signalerPost(postId, jeton) {
  return requete('/signalements', { methode: 'POST', corps: { cibleType: 'post', cibleId: postId }, jeton });
}

/** « il y a 2 h » — les dates D1 sont en UTC (YYYY-MM-DD HH:MM:SS). */
export function tempsRelatif(creeLe) {
  const t = new Date(`${String(creeLe).replace(' ', 'T')}Z`).getTime();
  if (!Number.isFinite(t)) return '';
  const minutes = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (minutes < 1) return 'à l’instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  const heures = Math.round(minutes / 60);
  if (heures < 24) return `il y a ${heures} h`;
  const jours = Math.round(heures / 24);
  return jours === 1 ? 'hier' : `il y a ${jours} j`;
}
