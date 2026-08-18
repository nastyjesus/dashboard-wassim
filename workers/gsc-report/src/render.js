// Rendu HTML du rapport — adapté du template du skill wassim-gsc-report
// (assets/template.html). Différences avec la version artefact :
//   - insights injectés côté serveur (pas de window.cowork ici),
//   - tables top requêtes / top pages ajoutées,
//   - bandeau "données de démonstration" en mode mock.
// Charte : cohérente avec wassimloumicorporate.fr (bleu profond / orange).

import { fmt } from './report.js';

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function deltaSpan(kpi, invert = false) {
  const d = kpi.delta;
  const label = fmt.fmtDelta(d);
  let cls = 'flat', arrow = '→';
  if (d !== null && Math.abs(d) >= 2) {
    const eff = invert ? -d : d;
    cls = eff > 0 ? 'up' : 'down';
    arrow = d > 0 ? '▲' : '▼';
  }
  return `<div class="delta ${cls}">${arrow} ${esc(label)}</div>`;
}

function tableRows(rows, labelFn) {
  return rows
    .map(
      (r) => `<tr>
        <td class="k">${esc(labelFn(r.keys[0]))}</td>
        <td>${fmt.fmtInt(r.clicks)}</td>
        <td>${fmt.fmtInt(r.impressions)}</td>
        <td>${fmt.fmtCtr(r.ctr || 0)}</td>
        <td>${fmt.fmtPos(r.position || 0)}</td>
      </tr>`,
    )
    .join('\n');
}

function shortenUrl(u) {
  try {
    const url = new URL(u);
    return url.pathname + url.search || '/';
  } catch {
    return u;
  }
}

/**
 * @param {ReturnType<import('./report.js').buildReport>} report
 * @returns {string} page HTML complète, autonome (Chart.js via CDN)
 */
export function renderReport(report) {
  const { meta, kpis, series, tables, insights } = report;
  const siteName = meta.property.replace('sc-domain:', '');
  const generated = new Date(meta.generatedAt).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Rapport SEO — ${esc(siteName)} — ${esc(meta.period.label)}</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<style>
  :root {
    --accent: #1e3a5f; --neg: #e85a4f; --pos: #2e7d52; --stable: #8a8f98;
    --bg: #f6f8fa; --card: #ffffff; --text: #1c2733; --muted: #5c6773;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    line-height: 1.5; }
  .wrap { max-width: 980px; margin: 0 auto; padding: 32px 20px 48px; }
  .mock-banner { background: #fff3cd; color: #7a5d00; border: 1px solid #ffe08a;
    border-radius: 8px; padding: 10px 16px; font-size: .88rem; margin-bottom: 20px; }
  header.report-head h1 { color: var(--accent); font-size: 1.5rem; margin: 0 0 4px; }
  header.report-head .periods { color: var(--muted); font-size: .95rem; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin: 28px 0; }
  .kpi { background: var(--card); border-radius: 12px; padding: 24px;
    box-shadow: 0 1px 3px rgba(0,0,0,.08), 0 1px 2px rgba(0,0,0,.04); }
  .kpi .label { color: var(--muted); font-size: .82rem; text-transform: uppercase; letter-spacing: .04em; }
  .kpi .value { font-size: 1.9rem; font-weight: 700; color: var(--accent); margin: 6px 0 2px; }
  .kpi .delta { font-size: .9rem; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; }
  .delta.up { color: var(--pos); } .delta.down { color: var(--neg); } .delta.flat { color: var(--stable); }
  .card { background: var(--card); border-radius: 12px; padding: 24px;
    box-shadow: 0 1px 3px rgba(0,0,0,.08), 0 1px 2px rgba(0,0,0,.04); margin-bottom: 24px; }
  .card h2 { color: var(--accent); font-size: 1.1rem; margin: 0 0 16px; }
  .toggle { display: inline-flex; gap: 8px; margin-bottom: 12px; }
  .toggle button { border: 1px solid #d0d7de; background: #fff; color: var(--muted);
    border-radius: 8px; padding: 6px 14px; cursor: pointer; font-size: .85rem; }
  .toggle button.active { background: var(--accent); color: #fff; border-color: var(--accent); }
  #insights p { margin: 0 0 10px; }
  .tbl-scroll { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; font-size: .88rem; }
  th { text-align: left; color: var(--muted); font-weight: 600; font-size: .78rem;
    text-transform: uppercase; letter-spacing: .04em; padding: 8px 12px 8px 0; border-bottom: 1px solid #e3e8ee; }
  td { padding: 8px 12px 8px 0; border-bottom: 1px solid #eef1f5; white-space: nowrap; }
  td.k { white-space: normal; max-width: 340px; overflow-wrap: anywhere; }
  footer.report-foot { color: var(--muted); font-size: .82rem; text-align: center; margin-top: 32px; }
  @media (max-width: 720px) { .kpis { grid-template-columns: repeat(2, 1fr); } .kpi .value { font-size: 1.6rem; } }
</style>
</head>
<body>
<div class="wrap">
  ${meta.mock ? '<div class="mock-banner">⚠️ Données de démonstration — mode test, sans connexion à Search Console.</div>' : ''}
  <header class="report-head">
    <h1>${esc(siteName)}</h1>
    <div class="periods">Période : ${esc(meta.period.label)} · Comparaison : ${esc(meta.compare.label)}</div>
  </header>

  <section class="kpis">
    <div class="kpi">
      <div class="label">Clics</div>
      <div class="value">${fmt.fmtInt(kpis.clicks.current)}</div>
      ${deltaSpan(kpis.clicks)}
    </div>
    <div class="kpi">
      <div class="label">Impressions</div>
      <div class="value">${fmt.fmtInt(kpis.impressions.current)}</div>
      ${deltaSpan(kpis.impressions)}
    </div>
    <div class="kpi">
      <div class="label">CTR moyen</div>
      <div class="value">${fmt.fmtCtr(kpis.ctr.current)}</div>
      ${deltaSpan(kpis.ctr)}
    </div>
    <div class="kpi">
      <div class="label">Position moyenne</div>
      <div class="value">${fmt.fmtPos(kpis.position.current)}</div>
      ${deltaSpan(kpis.position, true)}
    </div>
  </section>

  <div class="card">
    <h2>Évolution</h2>
    <div class="toggle">
      <button id="btn-clicks" class="active">Clics</button>
      <button id="btn-impr">Impressions</button>
    </div>
    <canvas id="chart" height="120"></canvas>
  </div>

  <div class="card">
    <h2>Analyse</h2>
    <div id="insights">${insights.map((p) => `<p>${esc(p)}</p>`).join('\n')}</div>
  </div>

  <div class="card">
    <h2>Top requêtes</h2>
    <div class="tbl-scroll">
      <table>
        <thead><tr><th>Requête</th><th>Clics</th><th>Impressions</th><th>CTR</th><th>Position</th></tr></thead>
        <tbody>${tableRows(tables.queries, (k) => k)}</tbody>
      </table>
    </div>
  </div>

  <div class="card">
    <h2>Top pages</h2>
    <div class="tbl-scroll">
      <table>
        <thead><tr><th>Page</th><th>Clics</th><th>Impressions</th><th>CTR</th><th>Position</th></tr></thead>
        <tbody>${tableRows(tables.pages, shortenUrl)}</tbody>
      </table>
    </div>
  </div>

  <footer class="report-foot">
    Généré le ${esc(generated)} · Données : Google Search Console · ${esc(siteName)}
  </footer>
</div>

<script>
  const SERIES_CURRENT = ${JSON.stringify(series.current)};
  const SERIES_COMPARE = ${JSON.stringify(series.compare)};
  const PERIOD = ${JSON.stringify(meta.period.label)};
  const COMPARE = ${JSON.stringify(meta.compare.label)};

  const labels = SERIES_CURRENT.map(d => 'J' + d.day);
  let metric = 'clicks';
  const ctx = document.getElementById('chart');
  const datasets = () => {
    const ds = [{
      label: PERIOD,
      data: SERIES_CURRENT.map(d => d[metric]),
      borderColor: '#1e3a5f', backgroundColor: 'rgba(30,58,95,.08)',
      tension: .3, fill: true, pointRadius: 0
    }];
    if (SERIES_COMPARE && SERIES_COMPARE.length) {
      ds.push({
        label: COMPARE,
        data: SERIES_COMPARE.map(d => d[metric]),
        borderColor: '#e85a4f', borderDash: [5,4],
        tension: .3, fill: false, pointRadius: 0
      });
    }
    return ds;
  };
  const chart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: datasets() },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } },
      scales: { y: { beginAtZero: true } } }
  });
  function setMetric(m, btnOn, btnOff) {
    metric = m;
    chart.data.datasets = datasets();
    chart.update();
    btnOn.classList.add('active'); btnOff.classList.remove('active');
  }
  const bClicks = document.getElementById('btn-clicks');
  const bImpr = document.getElementById('btn-impr');
  bClicks.onclick = () => setMetric('clicks', bClicks, bImpr);
  bImpr.onclick = () => setMetric('impressions', bImpr, bClicks);
</script>
</body>
</html>`;
}
