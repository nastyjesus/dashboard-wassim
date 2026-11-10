import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CRON, travailProgramme } from '../src/planning.js';

const a = (iso) => Date.parse(iso);

describe('travaux programmés', () => {
  it('5 h UTC, chaque jour : les tournées de cirques', () => {
    expect(travailProgramme(a('2026-11-11T05:00:00Z'))).toBe('cirques'); // mercredi
    expect(travailProgramme(a('2026-11-13T05:00:00Z'))).toBe('cirques'); // vendredi
  });

  it('15 h UTC le vendredi : l’alerte du week-end', () => {
    expect(travailProgramme(a('2026-11-13T15:00:00Z'))).toBe('alerte');
  });

  it('15 h UTC un autre jour : rien', () => {
    expect(travailProgramme(a('2026-11-11T15:00:00Z'))).toBeNull();
    expect(travailProgramme(a('2026-11-14T15:00:00Z'))).toBeNull();
  });

  it('wrangler.toml déclare ce déclencheur, et un seul (limite de 5 par compte)', () => {
    const toml = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
    const ligne = toml.split('\n').find((l) => l.trim().startsWith('crons'));
    expect(ligne.trim()).toBe(`crons = ["${CRON}"]`);
  });
});
