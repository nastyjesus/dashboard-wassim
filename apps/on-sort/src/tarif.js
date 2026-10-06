// Tarif lisible d'une sortie. Seules les sorties proposées par les
// organisateurs donnent un prix ; pour les autres, on ne sait que « gratuit ».

const euros = (n) => `${String(n).replace('.', ',')} €`;

/** « Enfant 8 € · Adulte 12 € », « Gratuit », ou null si on ne sait pas. */
export function tarif(ev) {
  if (!ev) return null;
  const enfant = Number.isFinite(ev.prixEnfant) ? ev.prixEnfant : null;
  const adulte = Number.isFinite(ev.prixAdulte) ? ev.prixAdulte : null;
  if (enfant === null && adulte === null) return ev.gratuit ? 'Gratuit' : null;
  if (enfant === 0 && (adulte === 0 || adulte === null)) return 'Gratuit';
  return [
    enfant !== null && `Enfant ${enfant === 0 ? 'gratuit' : euros(enfant)}`,
    adulte !== null && `Adulte ${adulte === 0 ? 'gratuit' : euros(adulte)}`,
  ].filter(Boolean).join(' · ');
}
