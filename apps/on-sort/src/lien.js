// Arrivée par lien — le site (ou un partage) peut poser la ville et l'âge dans
// l'URL : `?ville=rennes&age=3`. L'app démarre alors direct sur le top, sans
// passer par l'écran de démarrage. C'est ce qui tient la promesse du site
// (« ta sortie en quelques secondes ») bout en bout.
//
// Sur web uniquement : `Linking.parse()` y lit l'URL de la page courante
// (voir docs Expo SDK 57, expo-linking). Sur mobile, l'app n'est pas ouverte
// par ce genre de lien.

import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import { VILLES } from './config.js';

/** « Saint-Brieuc » → « saint-brieuc » : comparable à un identifiant d'URL. */
function normaliser(valeur) {
  return String(valeur)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Retrouve une ville par son id, son nom, ou à défaut par code de département. */
function trouverVille(villeBrute, codeBrut) {
  if (villeBrute) {
    const cle = normaliser(villeBrute);
    const v = VILLES.find((x) => x.id === cle || normaliser(x.nom) === cle);
    if (v) return v;
  }
  if (codeBrut) {
    const code = String(codeBrut).trim();
    const v = VILLES.find((x) => x.code === code);
    if (v) return v;
  }
  return null;
}

/** Premier paramètre utile (expo-linking rend une valeur ou un tableau). */
function premier(valeur) {
  return Array.isArray(valeur) ? valeur[0] : valeur;
}

/**
 * Profil déduit de l'URL d'arrivée, ou null si le lien ne dit rien d'exploitable.
 * L'âge est facultatif : sans lui on retient 3 ans, l'âge médian de la cible —
 * le papa le corrige en un tap depuis l'accueil.
 * @returns {{age: number, villeId: string, code?: string} | null}
 */
export function profilDepuisLien() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  let params;
  try {
    params = Linking.parse(window.location.href).queryParams || {};
  } catch {
    return null;
  }

  const ville = trouverVille(premier(params.ville), premier(params.code) ?? premier(params.dept));
  if (!ville) return null;

  const ageBrut = Number.parseInt(premier(params.age), 10);
  const age = Number.isInteger(ageBrut) && ageBrut >= 0 && ageBrut <= 5 ? ageBrut : 3;

  return { age, villeId: ville.id, code: ville.code };
}

/**
 * Retire nos paramètres de l'URL une fois consommés : un rafraîchissement ne
 * doit pas réécraser le profil que le papa vient d'ajuster. On ne touche ni au
 * chemin ni au fragment (Supabase y renvoie les jetons Google).
 */
export function nettoyerLien() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    ['ville', 'age', 'code', 'dept'].forEach((c) => url.searchParams.delete(c));
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
  } catch {
    // history indisponible (webview exotique) : sans gravité
  }
}
