// Votes « Ça m'intéresse » des piliers en teaser. Un identifiant d'appareil
// aléatoire (aucune donnée personnelle) rend le vote idempotent côté worker.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { WORKER_URL } from './config.js';

const CLE_APPAREIL = 'pp:appareil';

function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

async function appareilId() {
  try {
    let id = await AsyncStorage.getItem(CLE_APPAREIL);
    if (!id) {
      id = uuid();
      await AsyncStorage.setItem(CLE_APPAREIL, id);
    }
    return id;
  } catch {
    return uuid(); // pas de stockage : le vote reste possible, juste moins idempotent
  }
}

export async function aDejaVote(pilier) {
  try {
    return (await AsyncStorage.getItem(`pp:vote:${pilier}`)) === '1';
  } catch {
    return false;
  }
}

/** Envoie le vote et retourne le total pour ce pilier. */
export async function voter(pilier) {
  const appareil = await appareilId();
  const res = await fetch(`${WORKER_URL}/votes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pilier, appareil }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Le service a répondu ${res.status}`);
  try {
    await AsyncStorage.setItem(`pp:vote:${pilier}`, '1');
  } catch { /* le bouton se réaffichera, le worker dédoublonne */ }
  return data.total;
}
