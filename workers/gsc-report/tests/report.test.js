import { describe, it, expect } from 'vitest';
import { monthBounds, resolvePeriods, deltaPct, direction, buildReport } from '../src/report.js';
import { mockPeriodData } from '../src/mocks.js';
import { renderReport } from '../src/render.js';

const AUG_3 = new Date('2026-08-03T06:00:00Z');

describe('périodes', () => {
  it('mois précédent complet depuis un run du 3 août', () => {
    const { current, compare } = resolvePeriods(AUG_3, 'prev');
    expect(current.startDate).toBe('2026-07-01');
    expect(current.endDate).toBe('2026-07-31');
    expect(current.key).toBe('2026-07');
    expect(compare.startDate).toBe('2026-06-01');
    expect(compare.endDate).toBe('2026-06-30');
  });

  it('comparaison N-1 (saisonnalité)', () => {
    const { current, compare } = resolvePeriods(AUG_3, 'yoy');
    expect(current.key).toBe('2026-07');
    expect(compare.startDate).toBe('2025-07-01');
    expect(compare.endDate).toBe('2025-07-31');
  });

  it('période explicite YYYY-MM (run manuel)', () => {
    const { current, compare } = resolvePeriods(AUG_3, 'prev', '2026-03');
    expect(current.startDate).toBe('2026-03-01');
    expect(current.endDate).toBe('2026-03-31');
    expect(compare.key).toBe('2026-02');
  });

  it('gère les années bissextiles et janvier', () => {
    expect(monthBounds(new Date('2024-03-05T00:00:00Z'), 1).endDate).toBe('2024-02-29');
    const { compare } = resolvePeriods(new Date('2026-01-03T06:00:00Z'), 'prev');
    expect(compare.key).toBe('2025-11');
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

function demoReport() {
  const client = { id: 'demo', name: 'Démo', property: 'sc-domain:exemple.fr' };
  const { current, compare } = resolvePeriods(AUG_3, 'prev');
  const currentData = mockPeriodData(client.property, current.startDate, current.endDate);
  const compareData = mockPeriodData(client.property, compare.startDate, compare.endDate);
  return buildReport({
    client, current, compare,
    currentData: { ...currentData, mock: true },
    compareData: { ...compareData, mock: true },
    generatedAt: '2026-08-03T06:00:00.000Z',
  });
}

describe('buildReport', () => {
  it('assemble KPIs, séries normalisées et insights', () => {
    const report = demoReport();
    expect(report.meta.mock).toBe(true);
    expect(report.kpis.clicks.current).toBeGreaterThan(0);
    expect(report.series.current[0]).toHaveProperty('day', 1);
    expect(report.series.current.length).toBe(31);
    expect(report.insights.length).toBeGreaterThanOrEqual(2);
    // En mock, l'avertissement démo doit être présent.
    expect(report.insights.join(' ')).toContain('démonstration');
  });

  it('est déterministe (même seed → mêmes chiffres)', () => {
    const a = demoReport();
    const b = demoReport();
    expect(a.kpis.clicks.current).toBe(b.kpis.clicks.current);
  });
});

describe('renderReport', () => {
  it('produit une page HTML complète sans placeholder restant', () => {
    const html = renderReport(demoReport());
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('exemple.fr');
    expect(html).toContain('juillet 2026');
    expect(html).toContain('juin 2026');
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
