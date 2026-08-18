// Log d'un run GEO dans la page Notion du client (source de vérité, cf. skills).
// Appende une section « Suivi citations IA — [date] » : taux globaux, détail par
// moteur, delta vs run précédent, concurrents les plus cités. Append only.

import { logger } from './logger.js';

export function notionConfigured(env) {
  return Boolean(env.NOTION_TOKEN);
}

const ENGINE_LABELS = {
  perplexity: 'Perplexity',
  anthropic: 'Claude',
  openai: 'ChatGPT',
  gemini: 'Gemini',
};

function fmtPct(v) {
  return `${String(v).replace('.', ',')}%`;
}

/**
 * @param {object} env
 * @param {string} pageId page Notion du client
 * @param {object} run run courant (cf. index.js — { date, summary, mock, … })
 * @param {object|null} previousRun run précédent pour le delta (ou null)
 */
export async function logRunToNotion(env, pageId, run, previousRun) {
  const base = env.NOTION_API_BASE || 'https://api.notion.com';
  const s = run.summary;

  let deltaLine = 'Premier relevé — pas encore de comparaison.';
  if (previousRun && previousRun.summary) {
    const prev = previousRun.summary.citationRate;
    const diff = Math.round((s.citationRate - prev) * 10) / 10;
    const arrow = diff > 0 ? '🟢 +' : diff < 0 ? '🔴 ' : '➡️ ';
    deltaLine = `Évolution vs relevé du ${previousRun.date} : ${arrow}${String(diff).replace('.', ',')} pt (${fmtPct(prev)} → ${fmtPct(s.citationRate)}).`;
  }

  const engineLines = Object.entries(s.perEngine)
    .map(([name, e]) => {
      const label = ENGINE_LABELS[name] || name;
      if (!e.ok) return `${label} : indisponible sur ce relevé`;
      return `${label} : cité ${e.cited}/${e.total} · mentionné ${e.mentioned}/${e.total}`;
    })
    .join('\n');

  const competitors = s.topCompetitors.length
    ? `Sources concurrentes les plus citées : ${s.topCompetitors.slice(0, 5).map((c) => `${c.domain} (${c.count})`).join(', ')}.`
    : 'Aucune source concurrente relevée.';

  const children = [
    {
      object: 'block',
      type: 'heading_3',
      heading_3: {
        rich_text: [{ type: 'text', text: { content: `Suivi citations IA — ${run.date}${run.mock ? ' (démo)' : ''}` } }],
      },
    },
    {
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [{
          type: 'text',
          text: {
            content: [
              `Taux de citation : ${fmtPct(s.citationRate)} (${s.cited}/${s.answers} réponses) · Taux de mention : ${fmtPct(s.mentionRate)}.`,
              deltaLine,
              engineLines,
              competitors,
              'Mesure API bi-mensuelle (tendance) — complète AEO Sensor, ne le remplace pas.',
            ].join('\n'),
          },
        }],
      },
    },
  ];

  const res = await fetch(`${base}/v1/blocks/${pageId}/children`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${env.NOTION_TOKEN}`,
      'Notion-Version': env.NOTION_VERSION || '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ children }),
  });
  if (!res.ok) {
    const text = await res.text();
    logger.error('notion.append.failed', { status: res.status, pageId });
    throw new Error(`notion.append ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}
