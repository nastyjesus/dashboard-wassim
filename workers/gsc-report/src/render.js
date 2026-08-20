// Rendu HTML du rapport — charte graphique wassimloumicorporate.fr :
// palette or (#B8873A) sur fonds chauds, titres EB Garamond, corps Raleway.
// Le vert/rouge des deltas est conservé en version discrète et réchauffée
// (couleur fonctionnelle : une hausse/baisse doit se lire d'un coup d'œil).
//   - insights injectés côté serveur,
//   - trois horizons de comparaison par KPI (1 mois / 3 mois / 6 mois),
//   - carte « Tendance 6 mois » (totaux mensuels),
//   - tables top requêtes / top pages,
//   - bandeau "données de démonstration" en mode mock.

import { fmt, HORIZONS } from './report.js';

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function deltaRow(horizon, label, invert = false) {
  const d = horizon.delta;
  const text = fmt.fmtDelta(d);
  let cls = 'flat', arrow = '→';
  if (d !== null && Math.abs(d) >= 2) {
    const eff = invert ? -d : d;
    cls = eff > 0 ? 'up' : 'down';
    arrow = d > 0 ? '▲' : '▼';
  }
  return `<div class="delta ${cls}"><span class="h">${esc(label)}</span><span>${arrow} ${esc(text)}</span></div>`;
}

function kpiCard(label, value, kpi, invert = false) {
  const rows = HORIZONS.map((h) => deltaRow(kpi.horizons[h.id], h.label, invert)).join('\n      ');
  return `<div class="kpi">
      <div class="label">${esc(label)}</div>
      <div class="value">${value}</div>
      ${rows}
    </div>`;
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
  const { meta, kpis, series, trend, tables, insights } = report;
  const siteName = meta.property.replace('sc-domain:', '').replace(/^https?:\/\//, '').replace(/\/$/, '');
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
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Raleway:wght@300;400;500;600&display=swap">
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<style>
  :root {
    --gold: #B8873A; --gold-light: #e8d9c0; --gold-pale: #faf4ec;
    --dark: #1a1208; --mid: #5a4e3a; --muted: #8a7a65;
    --off: #faf8f5; --cream: #f0ebe3; --white: #ffffff;
    --border: rgba(184,135,58,0.18);
    --pos: #3e7d55; --neg: #b5472f; --stable: #8a7a65;
  }
  * { box-sizing: border-box; }
  html, body { overflow-x: hidden; }
  body { margin: 0; background: var(--off); color: var(--dark); line-height: 1.6;
    font-family: 'Raleway', -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    font-weight: 300; }
  .wrap { max-width: 980px; margin: 0 auto; padding: 40px 20px 56px; }
  .mock-banner { background: var(--cream); color: var(--mid); border-left: 2px solid var(--gold);
    border-radius: 2px; padding: 11px 16px; font-size: .88rem; margin-bottom: 24px; font-weight: 400; }
  .head-label { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
  .head-label::before { content: ""; width: 24px; height: 1px; background: var(--gold); }
  .head-label span { font-size: .68rem; text-transform: uppercase; letter-spacing: .2em;
    color: var(--gold); font-weight: 500; }
  header.report-head h1 { font-family: 'EB Garamond', Georgia, serif; font-weight: 500;
    color: var(--dark); font-size: 2rem; margin: 0 0 4px; letter-spacing: .01em; }
  header.report-head .periods { color: var(--mid); font-size: .9rem; font-weight: 300; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin: 30px 0 24px; }
  .kpi { background: var(--white); border: 1px solid var(--border); border-top: 2px solid var(--gold);
    border-radius: 2px; padding: 20px 22px; }
  .kpi .label { color: var(--gold); font-size: .66rem; text-transform: uppercase;
    letter-spacing: .18em; font-weight: 500; }
  .kpi .value { font-family: 'EB Garamond', Georgia, serif; font-size: 2.1rem; font-weight: 500;
    color: var(--dark); margin: 6px 0 10px; font-variant-numeric: tabular-nums; }
  .kpi .delta { font-size: .8rem; font-weight: 600; display: flex; align-items: center;
    justify-content: space-between; gap: 8px; padding: 2px 0; }
  .kpi .delta .h { color: var(--muted); font-weight: 400; font-size: .74rem; }
  .delta.up { color: var(--pos); } .delta.down { color: var(--neg); } .delta.flat { color: var(--stable); }
  .card { background: var(--white); border: 1px solid var(--border); border-left: 2px solid var(--gold);
    border-radius: 2px; padding: 24px 26px; margin-bottom: 20px; }
  .card h2 { font-family: 'EB Garamond', Georgia, serif; font-weight: 500; color: var(--dark);
    font-size: 1.3rem; margin: 0 0 16px; }
  .toggle { display: inline-flex; gap: 8px; margin-bottom: 14px; }
  .toggle button { border: 1px solid var(--border); background: var(--white); color: var(--muted);
    border-radius: 2px; padding: 6px 16px; cursor: pointer; font-size: .72rem;
    font-family: 'Raleway', sans-serif; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; }
  .toggle button.active { background: var(--gold); color: var(--white); border-color: var(--gold); }
  #insights p { margin: 0 0 12px; font-size: .95rem; color: var(--mid); font-weight: 400; max-width: 68ch; }
  #insights p:first-child { font-family: 'EB Garamond', Georgia, serif; font-style: italic;
    font-size: 1.15rem; color: var(--dark); }
  .tbl-scroll { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; font-size: .87rem; }
  th { text-align: left; color: var(--muted); font-weight: 500; font-size: .66rem;
    text-transform: uppercase; letter-spacing: .15em; padding: 8px 12px 8px 0;
    border-bottom: 1px solid var(--gold-light); }
  td { padding: 9px 12px 9px 0; border-bottom: 1px solid var(--border); white-space: nowrap;
    color: var(--mid); font-weight: 400; font-variant-numeric: tabular-nums; }
  td.k { white-space: normal; max-width: 340px; overflow-wrap: anywhere; color: var(--dark); }
  footer.report-foot { color: var(--muted); font-size: .78rem; text-align: center; margin-top: 34px;
    font-weight: 300; }
  footer.report-foot b { color: var(--gold); font-weight: 500; }
  @media (max-width: 720px) {
    .wrap { padding: 28px 14px 48px; }
    .kpis { grid-template-columns: repeat(2, 1fr); }
    .kpi .value { font-size: 1.7rem; }
    header.report-head h1 { font-size: 1.6rem; }
  }
</style>
</head>
<body>
<div class="wrap">
  ${meta.mock ? '<div class="mock-banner">⚠️ Données de démonstration — mode test, sans connexion à Search Console.</div>' : ''}
  <header class="report-head">
    <div class="head-label"><span>Rapport SEO mensuel</span></div>
    <h1>${esc(siteName)}</h1>
    <div class="periods">Période : ${esc(meta.period.label)} · Comparaisons : 1 mois (${esc(meta.compareLabels.m1)}) · 3 mois (${esc(meta.compareLabels.m3)}) · 6 mois (${esc(meta.compareLabels.m6)})</div>
  </header>

  <section class="kpis">
    ${kpiCard('Clics', fmt.fmtInt(kpis.clicks.current), kpis.clicks)}
    ${kpiCard('Impressions', fmt.fmtInt(kpis.impressions.current), kpis.impressions)}
    ${kpiCard('CTR moyen', fmt.fmtCtr(kpis.ctr.current), kpis.ctr)}
    ${kpiCard('Position moyenne', fmt.fmtPos(kpis.position.current), kpis.position, true)}
  </section>

  <div class="card">
    <h2>Évolution du mois (vs mois précédent)</h2>
    <div class="toggle">
      <button id="btn-clicks" class="active">Clics</button>
      <button id="btn-impr">Impressions</button>
    </div>
    <canvas id="chart" height="120"></canvas>
  </div>

  <div class="card">
    <h2>Tendance 6 mois</h2>
    <div class="toggle">
      <button id="btn-t-clicks" class="active">Clics</button>
      <button id="btn-t-impr">Impressions</button>
    </div>
    <canvas id="trend-chart" height="110"></canvas>
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
    Généré le ${esc(generated)} · Données : Google Search Console · <b>${esc(siteName)}</b>
  </footer>
</div>

<script>
  const SERIES_CURRENT = ${JSON.stringify(series.current)};
  const SERIES_COMPARE = ${JSON.stringify(series.compare)};
  const TREND = ${JSON.stringify(trend)};
  const PERIOD = ${JSON.stringify(meta.period.label)};
  const COMPARE = ${JSON.stringify(meta.compareLabels.m1)};

  Chart.defaults.font.family = "'Raleway', sans-serif";
  Chart.defaults.color = '#8a7a65';

  // — Courbe quotidienne : mois analysé vs mois précédent —
  const labels = SERIES_CURRENT.map(d => 'J' + d.day);
  let metric = 'clicks';
  const ctx = document.getElementById('chart');
  const datasets = () => {
    const ds = [{
      label: PERIOD,
      data: SERIES_CURRENT.map(d => d[metric]),
      borderColor: '#B8873A', backgroundColor: 'rgba(184,135,58,.10)',
      tension: .3, fill: true, pointRadius: 0
    }];
    if (SERIES_COMPARE && SERIES_COMPARE.length) {
      ds.push({
        label: COMPARE,
        data: SERIES_COMPARE.map(d => d[metric]),
        borderColor: '#8a7a65', borderDash: [5,4],
        tension: .3, fill: false, pointRadius: 0
      });
    }
    return ds;
  };
  const gridColor = 'rgba(184,135,58,.12)';
  const chart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: datasets() },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } },
      scales: { y: { beginAtZero: true, grid: { color: gridColor } }, x: { grid: { display: false } } } }
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

  // — Tendance 6 mois : totaux mensuels (le mois analysé en or plein) —
  let trendMetric = 'clicks';
  const tctx = document.getElementById('trend-chart');
  const trendData = () => ({
    labels: TREND.map(t => t.label),
    datasets: [{
      label: trendMetric === 'clicks' ? 'Clics / mois' : 'Impressions / mois',
      data: TREND.map(t => t[trendMetric]),
      backgroundColor: TREND.map((t, i) => i === TREND.length - 1 ? '#B8873A' : 'rgba(184,135,58,.30)'),
      borderRadius: 2,
    }]
  });
  const trendChart = new Chart(tctx, {
    type: 'bar',
    data: trendData(),
    options: { responsive: true, plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, grid: { color: gridColor } }, x: { grid: { display: false } } } }
  });
  function setTrendMetric(m, btnOn, btnOff) {
    trendMetric = m;
    trendChart.data = trendData();
    trendChart.update();
    btnOn.classList.add('active'); btnOff.classList.remove('active');
  }
  const bTClicks = document.getElementById('btn-t-clicks');
  const bTImpr = document.getElementById('btn-t-impr');
  bTClicks.onclick = () => setTrendMetric('clicks', bTClicks, bTImpr);
  bTImpr.onclick = () => setTrendMetric('impressions', bTImpr, bTClicks);
</script>
</body>
</html>`;
}
