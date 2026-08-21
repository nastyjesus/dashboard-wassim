// Choix de dates proposés : aujourd'hui, demain, et le prochain week-end.
// Tout en heure locale de l'appareil (le public visé est en France).

function iso(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const j = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${j}`;
}

function plusJours(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/** « Samedi 22 août » — pour l'en-tête de l'accueil (seule l'initiale en
 *  majuscule, à la française). */
export function libelleLong(dateISO) {
  const d = new Date(`${dateISO}T12:00:00`);
  const brut = `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`;
  return brut.charAt(0).toUpperCase() + brut.slice(1);
}

/**
 * Les chips de dates de l'accueil. Dédoublonnées : si on est samedi,
 * « Aujourd'hui » absorbe « Samedi ».
 */
export function optionsDates(maintenant = new Date()) {
  const options = [];
  const vus = new Set();
  const ajouter = (label, d) => {
    const valeur = iso(d);
    if (vus.has(valeur)) return;
    vus.add(valeur);
    options.push({ label, dateISO: valeur });
  };

  ajouter("Aujourd'hui", maintenant);
  ajouter('Demain', plusJours(maintenant, 1));
  ajouter('Samedi', plusJours(maintenant, (6 - maintenant.getDay() + 7) % 7));
  ajouter('Dimanche', plusJours(maintenant, (0 - maintenant.getDay() + 7) % 7));
  return options;
}
