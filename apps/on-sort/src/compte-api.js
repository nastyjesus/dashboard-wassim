// Création de compte + demande de ville.
//
// Backend : Supabase (PostgreSQL + Auth). Actif dès que EXPO_PUBLIC_SUPABASE_URL
// et EXPO_PUBLIC_SUPABASE_ANON_KEY sont posées (voir docs/backend-supabase.md).
// Tant que ce n'est pas configuré, tout retombe en mode local pour que
// l'onboarding reste jouable en démo.
//
// Le mot de passe n'est jamais stocké côté app : Supabase le hash côté serveur.

import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase, supabaseConfigure } from './supabase.js';
import { WORKER_URL } from './config.js';

/**
 * Crée le compte du papa (Auth) puis enregistre son profil.
 * @returns {Promise<{prenom:string,email:string,age:number,villeId:string,code?:string}>}
 */
export async function creerCompte({ prenom, email, password, age, villeId, code }) {
  const compte = {
    prenom: prenom.trim(),
    email: email.trim().toLowerCase(),
    age,
    villeId,
    code,
  };

  if (!supabaseConfigure) return compte; // démo locale

  const { data, error } = await supabase.auth.signUp({
    email: compte.email,
    password,
  });
  if (error) throw new Error(error.message);

  const user = data.user;
  if (user && data.session) {
    // Session active (confirmation email désactivée) : on écrit le profil.
    const { error: e2 } = await supabase.from('profils').upsert({
      id: user.id,
      prenom: compte.prenom,
      age,
      ville_id: villeId,
      dept_code: code,
    });
    if (e2) throw new Error(e2.message);
  }
  // Si la confirmation par email est activée, le profil sera écrit à la
  // première connexion confirmée (voir docs/backend-supabase.md).
  return compte;
}

/**
 * Connexion / inscription via Google (OAuth Supabase).
 * Nécessite le provider Google activé dans Supabase + l'URL de redirection
 * autorisée (voir docs/backend-supabase.md).
 */
export async function connexionGoogle() {
  if (!supabaseConfigure) throw new Error('Connexion Google : Supabase non configuré.');

  const redirectTo = Linking.createURL('/');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw new Error(error.message);

  const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (res.type !== 'success') throw new Error('Connexion Google annulée.');

  // Récupère les tokens renvoyés dans l'URL de retour et ouvre la session.
  const url = new URL(res.url);
  const params = new URLSearchParams(url.hash ? url.hash.slice(1) : url.search);
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (access_token && refresh_token) {
    const { error: e2 } = await supabase.auth.setSession({ access_token, refresh_token });
    if (e2) throw new Error(e2.message);
  }
  return true;
}

/**
 * Envoie une demande d'ajout de ville → table `demandes_ville` (back-office).
 * Fallback Worker si Supabase pas configuré. Silencieux : ne bloque jamais le papa.
 * @returns {Promise<boolean>} true si la demande est enregistrée
 */
export async function demanderVille({ nom, email, code }) {
  const ville = (nom || '').trim();
  if (!ville) return false;
  const payload = { ville, email: (email || '').trim().toLowerCase() || null, code: code || null };

  if (supabaseConfigure) {
    const { error } = await supabase.from('demandes_ville').insert(payload);
    return !error;
  }

  try {
    const res = await fetch(`${WORKER_URL}/ville-demande`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}
