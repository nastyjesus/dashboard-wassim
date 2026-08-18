// Log du rapport dans la page Notion du client (source de vérité, cf. skills).
// Appende une section « Rapport GSC — [période] » : récap KPIs + lien du rapport.
// Ne touche jamais à la structure existante de la page (append only).

import { fmt } from './report.js';
import { logger } from './logger.js';

export function notionConfigured(env) {
  return Boolean(env.NOTION_TOKEN);
}

/**
 * @param {object} env
 * @param {string} pageId page Notion du client
 * @param {ReturnType<import('./report.js').buildReport>} report
 * @param {string} reportUrl URL publique du rapport rendu
 */
export async function logReportToNotion(env, pageId, report, reportUrl) {
  const { meta, kpis, insights } = report;
  const base = env.NOTION_API_BASE || 'https://api.notion.com';

  const line = (label, kpi, format, invert = false) => {
    const d = kpi.delta;
    let emoji = '➡️';
    if (d !== null && Math.abs(d) >= 2) {
      const eff = invert ? -d : d;
      emoji = eff > 0 ? '🟢' : '🔴';
    }
    return `${label} : ${format(kpi.current)} (${fmt.fmtDelta(d)} ${emoji})`;
  };

  const kpiText = [
    line('Clics', kpis.clicks, fmt.fmtInt),
    line('Impressions', kpis.impressions, fmt.fmtInt),
    line('CTR moyen', kpis.ctr, fmt.fmtCtr),
    line('Position moyenne', kpis.position, fmt.fmtPos, true),
  ].join('\n');

  const children = [
    {
      object: 'block',
      type: 'heading_3',
      heading_3: {
        rich_text: [{ type: 'text', text: { content: `Rapport GSC — ${meta.period.label}${meta.mock ? ' (démo)' : ''}` } }],
      },
    },
    {
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [{ type: 'text', text: { content: `Comparaison : ${meta.compare.label}\n${kpiText}` } }],
      },
    },
    {
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [{ type: 'text', text: { content: insights.join('\n') } }],
      },
    },
    {
      object: 'block',
      type: 'bookmark',
      bookmark: { url: reportUrl },
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
