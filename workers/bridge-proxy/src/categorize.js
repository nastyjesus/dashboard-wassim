// Auto-catégorisation simple basée sur des mots-clés.
// Chaque catégorie expose une liste de mots-clés. On match en lowercase
// sur description + catégorie brute renvoyée par Bridge.

/**
 * Règles par défaut. À terme, ces règles seront chargées depuis la base
 * Notion "Catégories" (propriété multi-select "Mots-clés mapping").
 */
export const DEFAULT_RULES = [
  // ─── Pro ───
  { name: 'Logiciels SaaS', type: 'Pro', keywords: ['stripe', 'subscription', 'abonnement', 'saas', 'figma', 'adobe', 'github', 'notion', 'slack', 'zoom', 'openai', 'anthropic', 'cloudflare', 'vercel', 'netlify'] },
  { name: 'URSSAF', type: 'Pro', keywords: ['urssaf'] },
  { name: 'Impôts pro', type: 'Pro', keywords: ['dgfip', 'tresor public', 'impots', 'tva'] },
  { name: 'Honoraires expert-compta', type: 'Pro', keywords: ['comptable', 'expert-compt', 'cabinet'] },
  { name: 'Achats matériel', type: 'Pro', keywords: ['apple store', 'fnac pro', 'darty pro', 'materiel.net', 'ldlc'] },
  { name: 'Frais bancaires pro', type: 'Pro', keywords: ['frais bancaire', 'cotisation carte', 'commission'] },
  { name: 'Communication/Marketing', type: 'Pro', keywords: ['google ads', 'meta ads', 'facebook ads', 'linkedin ads', 'mailchimp'] },
  { name: 'Formation/Livres', type: 'Pro', keywords: ['udemy', 'coursera', 'amazon livres', 'fnac livre'] },
  { name: 'Hébergement web', type: 'Pro', keywords: ['ovh', 'hostinger', 'aws', 'gcp', 'azure', 'digitalocean', 'hetzner'] },
  { name: 'Téléphone/Internet pro', type: 'Pro', keywords: ['orange pro', 'free pro', 'sfr pro', 'bouygues pro'] },

  // ─── Perso ───
  { name: 'Alimentation', type: 'Perso', keywords: ['carrefour', 'leclerc', 'lidl', 'monoprix', 'auchan', 'intermarche', 'super u', 'biocoop'] },
  { name: 'Restauration', type: 'Perso', keywords: ['restaurant', 'mcdonald', 'burger king', 'kfc', 'sushi', 'pizz', 'kebab', 'uber eats', 'deliveroo'] },
  { name: 'Transport', type: 'Perso', keywords: ['sncf', 'ratp', 'uber', 'bolt', 'navigo', 'oui.sncf', 'flixbus', 'blablacar'] },
  { name: 'Santé', type: 'Perso', keywords: ['pharmacie', 'medecin', 'cpam', 'mutuelle', 'dentiste', 'kine'] },
  { name: 'Loisirs', type: 'Perso', keywords: ['cinema', 'theatre', 'spotify', 'netflix', 'deezer', 'disney+', 'fitness', 'salle de sport'] },
  { name: 'Logement', type: 'Perso', keywords: ['loyer', 'foncia', 'syndic', 'edf', 'engie', 'veolia'] },
  { name: 'Énergie', type: 'Perso', keywords: ['edf', 'engie', 'totalenergies', 'enedis'] },
  { name: 'Téléphone perso', type: 'Perso', keywords: ['free mobile', 'sosh', 'red sfr', 'bouygues telecom'] },

  // ─── Mixte ───
  { name: 'Carburant', type: 'Mixte', keywords: ['total', 'esso', 'shell', 'bp ', 'station', 'carburant', 'essence'] },
  { name: 'Voyages', type: 'Mixte', keywords: ['air france', 'easyjet', 'ryanair', 'booking', 'airbnb', 'hotel'] },
];

/**
 * Trouve la catégorie d'une transaction en fonction de sa description et de
 * sa catégorie brute Bridge. Retourne `null` si rien ne matche.
 *
 * @param {{ description?: string, bridgeCategory?: string }} tx
 * @param {Array<{name: string, type: string, keywords: string[]}>} [rules]
 * @returns {{name: string, type: string} | null}
 */
export function categorize(tx, rules = DEFAULT_RULES) {
  const haystack = `${tx.description || ''} ${tx.bridgeCategory || ''}`.toLowerCase();
  if (!haystack.trim()) return null;
  for (const rule of rules) {
    if (rule.keywords.some((kw) => kw && haystack.includes(kw.toLowerCase()))) {
      return { name: rule.name, type: rule.type };
    }
  }
  return null;
}

/**
 * Construit la liste de règles à partir des entrées d'une base Notion
 * "Catégories" (lectures via notion-sync).
 *
 * @param {Array<{name: string, type: string, keywords: string[]}>} notionRows
 */
export function rulesFromNotion(notionRows) {
  return notionRows
    .filter((r) => r && r.name && Array.isArray(r.keywords) && r.keywords.length > 0)
    .map((r) => ({ name: r.name, type: r.type || 'Mixte', keywords: r.keywords }));
}
