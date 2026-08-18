import { describe, it, expect } from 'vitest';
import { monthBounds, resolveMonths, deltaPct, direction, aggregateMonth, buildReport } from '../src/report.js';
import { mockDailySeries, mockTopTables } from '../src/mocks.js';
import { renderReport } from '../src/render.js';

const AUG_3 = new Date('2026-08-03T06:00:00Z');

describe('périodes', () => {
  it('7 mois ordonnés, le dernier = mois précédent complet depuis un run du 3 août', () => {
    const { months, current } = resolveMonths(AUG_3);
    expect(months.length).toBe(7);
    expect(current.startDate).toBe('2026-07-01');
    expect(current.endDate).toBe('2026-07-31');
    expect(current.key).toBe('2026-07');
    expect(months[0].key).toBe('2026-01'); // M-6
    expect(months[5].key).toBe('2026-06'); // M-1
  });

  it('période explicite YYYY-MM (run manuel)', () => {
    const { months, current } = resolveMonths(AUG_3, '2026-03');
    expect(current.startDate).toBe('2026-03-01');
    expect(current.endDate).toBe('2026-03-31');
    expect(months[0].key).toBe('2025-09');
  });

  it('gère les années bissextiles et les passages d\'année', () => {
    expect(monthBounds(new Date('2024-03-05T00:00:00Z'), 1).endDate).toBe('2024-02-29');
    const { months } = resolveMonths(new Date('2026-01-03T06:00:00Z'));
    expect(months[months.length - 1].key).toBe('2025-12');
    expect(months[0].key).toBe('2025-06');
  });
});

describe('deltas', () => {
  it('calcule un delta % signé à une décimale', () => {
    expect(deltaPct(110, 100)).toBe(10);
    expect(deltaPct(95, 100)).toBe(-5);
    expect(deltaPct(101.5, 100)).toBe(1.5);
  });

  it('renvoie null si la base est nulle (pas de division par zéro)', () => {
    expect(deltaPct(50, 0)).toBeNull();
    expect(direction(null)).toBe('stable');
  });

  it('applique le seuil de stabilité ±2%', () => {
    expect(direction(1.9)).toBe('stable');
    expect(direction(-1.9)).toBe('stable');
    expect(direction(2.1)).toBe('hausse');
    expect(direction(-2.1)).toBe('baisse');
  });
});

describe('aggregateMonth', () => {
  it('pondère CTR et position par les impressions', () => {
    const daily = [
      { date: '2026-07-01', clicks: 10, impressions: 100, position: 10 },
      { date: '2026-07-02', clicks: 30, impressions: 300, position: 20 },
      { date: '2026-08-01', clicks: 99, impressions: 999, position: 1 }, // hors mois
    ];
    const { totals, series } = aggregateMonth(daily, { startDate: '2026-07-01', endDate: '2026-07-31' });
    expect(totals.clicks).toBe(40);
    expect(totals.impressions).toBe(400);
    expect(totals.ctr).toBeCloseTo(0.1);
    expect(totals.position).toBeCloseTo((10 * 100 + 20 * 300) / 400); // 17.5
    expect(series.length).toBe(2);
    expect(series[0]).toEqual({ day: 1, clicks: 10, impressions: 100 });
  });

  it('un mois sans data donne des totaux à zéro (delta null en aval)', () => {
    const { totals } = aggregateMonth([], { startDate: '2026-07-01', endDate: '2026-07-31' });
    expect(totals.clicks).toBe(0);
    expect(totals.position).toBe(0);
  });
});

function demoReport() {
  const client = { id: 'demo', name: 'Démo', property: 'sc-domain:exemple.fr' };
  const { months, current } = resolveMonths(AUG_3);
  const daily = mockDailySeries(client.property, months[0].startDate, current.endDate);
  const { totals } = aggregateMonth(daily, current);
  const { queries, pages } = mockTopTables(client.property, totals);
  return buildReport({
    client, months, daily, queries, pages, mock: true,
    generatedAt: '2026-08-03T06:00:00.000Z',
  });
}

describe('buildReport', () => {
  it('assemble KPIs avec trois horizons, tendance 7 mois et insights', () => {
    const report = demoReport();
    expect(report.meta.mock).toBe(true);
    expect(report.meta.compareLabels.m1).toBe('juin 2026');
    expect(report.meta.compareLabels.m3).toBe('avril 2026');
    expect(report.meta.compareLabels.m6).toBe('janvier 2026');
    for (const h of ['m1', 'm3', 'm6']) {
      expect(report.kpis.clicks.horizons[h]).toHaveProperty('delta');
      expect(report.kpis.clicks.horizons[h]).toHaveProperty('direction');
    }
    expect(report.trend.length).toBe(7);
    expect(report.trend[6].key).toBe('2026-07');
    expect(report.series.current[0]).toHaveProperty('day', 1);
    expect(report.series.current.length).toBe(31);
    expect(report.insights.length).toBeGreaterThanOrEqual(2);
    expect(report.insights.join(' ')).toContain('Sur 6 mois');
    expect(report.insights.join(' ')).toContain('démonstration');
  });

  it('est déterministe (même seed → mêmes chiffres)', () => {
    const a = demoReport();
    const b = demoReport();
    expect(a.kpis.clicks.current).toBe(b.kpis.clicks.current);
    expect(a.kpis.clicks.horizons.m6.delta).toBe(b.kpis.clicks.horizons.m6.delta);
  });
});

describe('renderReport', () => {
  it('produit une page HTML complète avec les trois horizons et la tendance', () => {
    const html = renderReport(demoReport());
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('exemple.fr');
    expect(html).toContain('juillet 2026');
    expect(html).toContain('1 mois (juin 2026)');
    expect(html).toContain('3 mois (avril 2026)');
    expect(html).toContain('6 mois (janvier 2026)');
    expect(html).toContain('Tendance 6 mois');
    expect(html).toContain('trend-chart');
    expect(html).not.toMatch(/__[A-Z_]+__/);
    expect(html).toContain('noindex');
    expect(html).toContain('Données de démonstration');
  });

  it('échappe le HTML injecté', () => {
    const report = demoReport();
    report.meta.property = 'sc-domain:<script>alert(1)</script>.fr';
    const html = renderReport(report);
    expect(html).not.toContain('<script>alert(1)</script>');
  });
});
