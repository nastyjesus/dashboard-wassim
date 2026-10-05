import { describe, it, expect } from 'vitest';
import { normaliser } from '../src/sources/datatourisme.js';

// Plages relevées sur la fiche réelle « Lecture offerte aux enfants » (Erdeven) :
// toutes de mercredi à mercredi, séance à 10h.
const plagesMercredi = [
  ['2026-06-24', '2026-10-21', '10:00', '11:00'],
  ['2026-06-17', '2026-10-14', '10:00', '11:00'],
  ['2026-07-01', '2026-10-28', '10:00', '10:00'],
].map(([startDate, endDate, startTime, endTime]) => ({ startDate, endDate, startTime, endTime }));
const fiche = (takesPlaceAt) => ({ label: { '@fr': 'Lecture offerte aux enfants' }, takesPlaceAt });

describe('DATAtourisme : périodes et créneaux', () => {
  it('rendez-vous hebdomadaire codé en plages : écarté un autre jour de la semaine', () => {
    expect(normaliser(fiche(plagesMercredi), '2026-10-10')).toBeNull(); // samedi
  });

  it('…retenu le bon jour, avec un seul créneau malgré trois plages', () => {
    const ev = normaliser(fiche(plagesMercredi), '2026-10-07'); // mercredi
    expect(ev.creneaux).toEqual([{ debut: '2026-10-07T10:00', fin: '2026-10-07T11:00' }]);
  });

  it('une vraie plage continue (festival du jeudi au dimanche) reste valable chaque jour', () => {
    const ev = normaliser(fiche([{ startDate: '2026-10-08', endDate: '2026-10-11', startTime: '11:00' }]), '2026-10-10');
    expect(ev).not.toBeNull();
    expect(ev.creneaux).toEqual([{ debut: '2026-10-10T11:00', fin: null }]);
  });

  it('plusieurs dates ponctuelles le même jour de semaine (samedis) : retenues le samedi', () => {
    const samedis = ['2026-10-03', '2026-10-10', '2026-10-17'].map((d) => ({ startDate: d, endDate: d, startTime: '14:00' }));
    expect(normaliser(fiche(samedis), '2026-10-10')).not.toBeNull();
  });

  it('séances distinctes le même jour : triées, sans doublon', () => {
    const ev = normaliser(fiche([
      { startDate: '2026-10-10', endDate: '2026-10-10', startTime: '15:00' },
      { startDate: '2026-10-10', endDate: '2026-10-10', startTime: '10:30' },
      { startDate: '2026-10-10', endDate: '2026-10-10', startTime: '10:30' },
    ]), '2026-10-10');
    expect(ev.creneaux.map((c) => c.debut)).toEqual(['2026-10-10T10:30', '2026-10-10T15:00']);
  });
});
