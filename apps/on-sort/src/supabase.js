// Client Supabase — PostgreSQL managé + Auth (email/mot de passe + Google).
// Configuré via les variables d'env EXPO_PUBLIC_* (voir .env.example et
// docs/backend-supabase.md). Tant qu'elles ne sont pas posées, `supabase` vaut
// null et l'app retombe sur le mode local (l'onboarding reste jouable).

import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const CLE = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigure = Boolean(URL && CLE);

export const supabase = supabaseConfigure
  ? createClient(URL, CLE, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        // Sur web, Google renvoie le papa sur l'app avec les jetons dans
        // l'URL : c'est Supabase qui doit les lire. Sur mobile, le retour
        // passe par WebBrowser, pas par l'URL de la page.
        detectSessionInUrl: Platform.OS === 'web',
      },
    })
  : null;
