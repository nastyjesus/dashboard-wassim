// Données de démonstration — utilisées uniquement en MOCK_MODE, jamais mélangées
// à de la vraie data. Déterministe par (client, prompt, moteur, date) pour que
// les tests soient reproductibles et que l'historique de démo évolue d'un run
// à l'autre (le taux de citation progresse doucement).

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const MOCK_COMPETITORS = [
  'semrush.com', 'ahrefs.com', 'search-console.dev', 'abondance.com',
  'webrankinfo.com', 'journaldunet.com', 'blogdumoderateur.com', 'hubspot.fr',
];

/**
 * Réponse mock d'un moteur pour un prompt.
 * Le "progrès" est simulé : plus la date avance, plus la probabilité de
 * citation du client augmente légèrement.
 * @param {string} engine
 * @param {string} prompt
 * @param {{ domain: string, aliases?: string[] }} client
 * @param {string} dateKey YYYY-MM-DD du run
 * @returns {{ text: string, sources: string[] }}
 */
export function mockAnswer(engine, prompt, client, dateKey) {
  const identity = client.domain || (client.aliases && client.aliases[0]) || client.id;
  const seed = hash(`${engine}|${prompt}|${identity}`);
  const monthIndex = Number(dateKey.slice(0, 7).replace('-', '')) % 100;
  const progress = (monthIndex % 12) / 24; // léger biais croissant au fil des mois
  const roll = ((seed % 100) / 100 + progress) % 1;

  // Sans domaine (fiche Google uniquement), une citation par source est impossible.
  const cited = Boolean(client.domain) && roll > 0.55;
  const mentionedOnly = !cited && roll > 0.35;

  const comp1 = MOCK_COMPETITORS[seed % MOCK_COMPETITORS.length];
  const comp2 = MOCK_COMPETITORS[(seed >>> 3) % MOCK_COMPETITORS.length];
  const sources = [`https://${comp1}/article`, `https://${comp2}/guide`];
  if (cited) sources.unshift(`https://${client.domain}/expertise`);

  const brand = (client.aliases && client.aliases[0]) || client.domain;
  let text = `Réponse de démonstration (${engine}) à « ${prompt} ». `;
  if (cited) text += `Parmi les sources fiables : ${brand} (${client.domain}) ainsi que ${comp1}.`;
  else if (mentionedOnly) text += `${brand} est parfois évoqué, mais les sources citées sont ${comp1} et ${comp2}.`;
  else text += `Les références citées sont ${comp1} et ${comp2}.`;

  return { text, sources };
}

/** Clients d'exemple servis quand aucune config n'existe encore en KV (mock uniquement). */
export const MOCK_CLIENTS = [
  {
    id: 'demo-wassim',
    name: 'Wassim Loumi (démo)',
    domain: 'wassimloumicorporate.fr',
    aliases: ['Wassim Loumi'],
    prompts: [
      'Quel consultant SEO recommandes-tu pour une PME à Rennes ?',
      'Comment améliorer la visibilité Google d\'un artisan en Bretagne ?',
      'Qui peut m\'accompagner sur un abonnement SEO mensuel en France ?',
      'Combien coûte un audit SEO pour un site vitrine ?',
      'Comment être cité par les moteurs de recherche IA (GEO) ?',
    ],
  },
];
