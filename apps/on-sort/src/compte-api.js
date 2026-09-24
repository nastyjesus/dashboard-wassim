// Création de compte, connexion Google, demande de ville.
//
// Backend : Supabase (PostgreSQL + Auth). Actif dès que EXPO_PUBLIC_SUPABASE_URL
// et EXPO_PUBLIC_SUPABASE_ANON_KEY sont posées (voir docs/backend-supabase.md).
// Tant que ce n'est pas configuré, tout retombe en mode local pour que
// l'onboarding reste jouable en démo.
//
// Le mot de passe n'est jamais stocké côté app : Supabase le hash côté serveur.

import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase, supabaseConfigure } from './supabase.js';
import { WORKER_URL } from './config.js';

/** Profil applicatif à partir d'une ligne `profils` et du compte Auth. */
function profilDepuis(ligne, user) {
  return {
    prenom: ligne.prenom,
    email: user?.email || '',
    age: ligne.age,
    villeId: ligne.ville_id,
    code: ligne.dept_code || undefined,
  };
}

/** Supabase signale un e-mail déjà pris de plusieurs façons selon la version. */
function estDejaInscrit(error) {
  const code = error?.code || '';
  const message = (error?.message || '').toLowerCase();
  return code === 'user_already_exists'
    || code === 'email_exists'
    || message.includes('already registered')
    || message.includes('already exists');
}

/** Prénom proposé à partir de ce que Google nous donne. */
function prenomGoogle(user) {
  const m = user?.user_metadata || {};
  const complet = m.name || m.full_name || m.given_name || '';
  return String(complet).trim().split(/\s+/)[0] || '';
}

/**
 * État du compte au démarrage de l'app.
 * @returns {Promise<null | {email: string, prenomSuggere: string, profil: object|null}>}
 *  - null : pas de compte connecté (ou Supabase non configuré) ;
 *  - `profil` rempli : le papa a déjà tout renseigné, on entre directement ;
 *  - `profil` à null : connecté (Google) mais profil incomplet → onboarding
 *    allégé, sans e-mail ni mot de passe à ressaisir.
 */
export async function sessionCourante() {
  if (!supabaseConfigure) return null;
  try {
    const { data } = await supabase.auth.getSession();
    const user = data?.session?.user;
    if (!user) return null;

    const { data: lignes, error } = await supabase
      .from('profils')
      .select('prenom, age, ville_id, dept_code')
      .eq('id', user.id)
      .limit(1);
    if (error) return { email: user.email || '', prenomSuggere: prenomGoogle(user), profil: null };

    const ligne = lignes && lignes[0];
    return {
      email: user.email || '',
      prenomSuggere: prenomGoogle(user),
      profil: ligne ? profilDepuis(ligne, user) : null,
    };
  } catch {
    return null; // réseau coupé au lancement : l'app reste utilisable
  }
}

/**
 * Crée le compte du papa (Auth) puis enregistre son profil.
 * Si une session existe déjà (retour de Google), on ne recrée pas de compte :
 * on complète seulement le profil.
 * @returns {Promise<{prenom:string,email:string,age:number,villeId:string,code?:string}>}
 */
export async function creerCompte({ prenom, email, password, age, villeId, code, alerte = false }) {
  const compte = {
    prenom: prenom.trim(),
    email: (email || '').trim().toLowerCase(),
    age,
    villeId,
    code,
  };

  if (!supabaseConfigure) return compte; // démo locale

  const { data: existante } = await supabase.auth.getSession();
  let user = existante?.session?.user || null;
  let sessionActive = Boolean(existante?.session);

  if (!user) {
    const { data, error } = await supabase.auth.signUp({
      email: compte.email,
      password,
    });
    if (error) {
      // Compte déjà créé (papa qui revient après avoir vidé son téléphone, ou
      // réinstallé la PWA) : le même formulaire sert alors de connexion.
      if (!estDejaInscrit(error)) throw new Error(error.message);
      const reconnexion = await supabase.auth.signInWithPassword({
        email: compte.email,
        password,
      });
      if (reconnexion.error) {
        throw new Error('Un compte existe déjà avec cet e-mail. Vérifie ton mot de passe.');
      }
      user = reconnexion.data.user;
      sessionActive = Boolean(reconnexion.data.session);
    } else {
      user = data.user;
      sessionActive = Boolean(data.session);
    }
  } else {
    compte.email = user.email || compte.email;
  }

  if (user && sessionActive) {
    // Session active (confirmation email désactivée, ou retour Google) :
    // on écrit le profil.
    const { error: e2 } = await supabase.from('profils').upsert({
      id: user.id,
      prenom: compte.prenom,
      age,
      ville_id: villeId,
      dept_code: code,
      // Opt-in explicite : false tant que la case n'est pas cochée. On
      // n'inscrit personne à une alerte qu'il n'a pas demandée.
      alerte_weekend: Boolean(alerte),
    });
    if (e2) throw new Error(e2.message);
  }
  // Si la confirmation par email est activée, le profil sera écrit à la
  // première connexion confirmée (voir docs/backend-supabase.md).
  return compte;
}

/**
 * Enregistre le profil d'un papa déjà connecté (retour de Google, ou réglages
 * changés après création du compte). Sans compte, il n'y a rien à faire : le
 * profil vit en local et c'est suffisant pour sortir un top.
 * @returns {Promise<boolean>} true si le profil est écrit côté compte
 */
export async function enregistrerProfil({ prenom, age, villeId, code }) {
  if (!supabaseConfigure) return false;
  const { data } = await supabase.auth.getSession();
  const user = data?.session?.user;
  if (!user) return false;

  const { error } = await supabase.from('profils').upsert({
    id: user.id,
    prenom: (prenom || '').trim() || 'Papa',
    age,
    ville_id: villeId,
    dept_code: code,
  });
  if (error) throw new Error(error.message);
  return true;
}

/**
 * Connexion / inscription via Google (OAuth Supabase).
 * Nécessite le provider Google activé dans Supabase + l'URL de redirection
 * autorisée (voir docs/backend-supabase.md).
 *
 * Deux chemins, parce que les plateformes ne reviennent pas de la même façon :
 *  - **web** : redirection pleine page. Google renvoie sur l'app avec les
 *    jetons dans l'URL, que le client Supabase lit (`detectSessionInUrl`).
 *    La fonction ne rend jamais la main : la page est quittée.
 *    (Le popup a été essayé puis abandonné : la politique COOP du navigateur
 *    bloque `window.closed`, l'app ne détecte jamais le retour.)
 *  - **mobile** : session d'authentification système, jetons récupérés dans
 *    l'URL de retour.
 * @returns {Promise<'redirection' | 'connecte'>}
 */
export async function connexionGoogle() {
  if (!supabaseConfigure) throw new Error('Connexion Google : Supabase non configuré.');

  if (Platform.OS === 'web') {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) throw new Error(error.message);
    return 'redirection';
  }

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
  if (!access_token || !refresh_token) throw new Error('Connexion Google incomplète.');

  const { error: e2 } = await supabase.auth.setSession({ access_token, refresh_token });
  if (e2) throw new Error(e2.message);
  return 'connecte';
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
