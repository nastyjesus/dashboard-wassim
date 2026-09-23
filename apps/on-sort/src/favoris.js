// Sorties gardées. Local d'abord : garder une sortie marche sans compte, tout
// de suite, hors ligne. Le compte ne déverrouille rien — il déplace la liste
// d'un téléphone à tous les appareils du papa (c'est là, et seulement là, qu'on
// le propose).

import { supabase, supabaseConfigure } from './supabase.js';
import { lireFavoris, ecrireFavoris } from './storage.js';

/** Identité d'une sortie : l'id de la source, sinon titre + date. */
export function cleFavori(ev) {
  return String(ev?.id || `${ev?.titre || ''}|${ev?.dateISO || ''}`);
}

/** Version allégée stockée : de quoi réafficher la fiche sans recharger. */
function alleger(ev, dateISO) {
  const { description, ...reste } = ev;
  return { ...reste, dateISO: ev.dateISO || dateISO || null, gardeeLe: new Date().toISOString() };
}

export { lireFavoris };

export function estGardee(liste, ev) {
  const cle = cleFavori(ev);
  return liste.some((f) => cleFavori(f) === cle);
}

/**
 * Garde / retire une sortie. Écrit en local dans tous les cas, puis pousse vers
 * Supabase si un compte est connecté — l'échec réseau ne fait jamais perdre le
 * geste du papa.
 * @returns {Promise<{liste: object[], gardee: boolean}>} la nouvelle liste
 */
export async function basculerFavori(ev, dateISO) {
  const cle = cleFavori(ev);
  const liste = await lireFavoris();
  const dejaLa = liste.some((f) => cleFavori(f) === cle);
  const suivante = dejaLa
    ? liste.filter((f) => cleFavori(f) !== cle)
    : [alleger(ev, dateISO), ...liste].slice(0, 50);

  await ecrireFavoris(suivante);
  pousser(cle, dejaLa ? null : suivante[0]).catch(() => {});
  return { liste: suivante, gardee: !dejaLa };
}

/** Écrit (ou efface) une sortie gardée côté compte. Silencieux. */
async function pousser(cle, sortie) {
  if (!supabaseConfigure) return;
  const { data } = await supabase.auth.getSession();
  const papa = data?.session?.user?.id;
  if (!papa) return;

  if (!sortie) {
    await supabase.from('favoris').delete().eq('papa', papa).eq('cle', cle);
    return;
  }
  await supabase.from('favoris').upsert(
    { papa, cle, sortie, date_sortie: sortie.dateISO || null },
    { onConflict: 'papa,cle' },
  );
}

/**
 * Fusionne local et compte à la connexion : ce qui était gardé en invité monte
 * vers le compte, ce qui était gardé ailleurs redescend. C'est la promesse
 * faite au moment de créer le compte — elle se tient ici.
 * @returns {Promise<object[]>} la liste fusionnée
 */
export async function synchroniserFavoris() {
  const locales = await lireFavoris();
  if (!supabaseConfigure) return locales;

  try {
    const { data } = await supabase.auth.getSession();
    const papa = data?.session?.user?.id;
    if (!papa) return locales;

    const { data: lignes, error } = await supabase
      .from('favoris')
      .select('cle, sortie')
      .eq('papa', papa);
    if (error) return locales;

    const parCle = new Map();
    (lignes || []).forEach((l) => { if (l.sortie) parCle.set(l.cle, l.sortie); });
    locales.forEach((f) => parCle.set(cleFavori(f), f));

    const fusion = [...parCle.values()].sort(
      (a, b) => String(b.gardeeLe || '').localeCompare(String(a.gardeeLe || '')),
    );
    await ecrireFavoris(fusion);

    const aPousser = fusion
      .filter((f) => !(lignes || []).some((l) => l.cle === cleFavori(f)))
      .map((f) => ({ papa, cle: cleFavori(f), sortie: f, date_sortie: f.dateISO || null }));
    if (aPousser.length) await supabase.from('favoris').upsert(aPousser, { onConflict: 'papa,cle' });

    return fusion;
  } catch {
    return locales; // réseau coupé : la liste locale reste la vérité
  }
}
