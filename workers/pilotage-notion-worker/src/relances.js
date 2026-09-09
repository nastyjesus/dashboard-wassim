/* Lecture métier du pipeline de prospection : qui est à relancer, qui dort.
   Mêmes conventions que cockpit.html (Statut « Pipeline », Étape, champ date « Relance »). */

/* Ordre et probabilités : identiques à ETAPES dans cockpit.html. */
export const ETAPES = [
  { id: "prospect",   nom: "Prospect",   proba: 0.05 },
  { id: "contacte",   nom: "Contacté",   proba: 0.15 },
  { id: "diagnostic", nom: "Diagnostic", proba: 0.4 },
  { id: "propale",    nom: "Propale",    proba: 0.6 },
  { id: "signe",      nom: "Signé",      proba: 1 },
  { id: "perdu",      nom: "Perdu",      proba: 0 },
];
const ETAPE_ID   = Object.fromEntries(ETAPES.map((e) => [e.nom, e.id]));
export const ETAPE_NAME = Object.fromEntries(ETAPES.map((e) => [e.id, e.nom]));
/* Progression : « Avancer » ne va jamais au-delà de Signé. */
export const ORDRE = ["prospect", "contacte", "diagnostic", "propale", "signe"];

/* Un prospect qui n'a pas bougé depuis ce délai est considéré comme dormant. */
export const JOURS_DORMANT = 14;

const rtext = (p) => (p && p.rich_text ? p.rich_text.map((t) => t.plain_text).join("") : "");

/* Date du jour à Paris, en ISO court — « en-CA » rend directement YYYY-MM-DD. */
export function todayParis(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

export function heureParis(now = new Date()) {
  return Number(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris", hour: "2-digit", hour12: false,
  }).format(now));
}

/* Décale une date ISO de n jours (arithmétique en UTC : pas de dérive d'heure d'été). */
export function isoPlus(isoDate, jours) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + jours);
  return d.toISOString().slice(0, 10);
}

export function joursEntre(isoA, isoB) {
  const a = Date.parse(`${isoA}T12:00:00Z`), b = Date.parse(`${isoB}T12:00:00Z`);
  return Math.round((b - a) / 86400000);
}

/* Une ligne Notion « Pipeline » -> objet prospect, ou null si ce n'est pas un prospect. */
export function toProspect(row) {
  const p = row.properties || {};
  const statut = p["Statut"] && p["Statut"].select ? p["Statut"].select.name : "Signé";
  if (statut !== "Pipeline") return null;
  const etName = p["Étape"] && p["Étape"].select ? p["Étape"].select.name : "Prospect";
  return {
    id: row.id,
    societe: (p["Client"] && p["Client"].title ? p["Client"].title.map((t) => t.plain_text).join("") : "").trim(),
    contact: rtext(p["Contact"]),
    etape: ETAPE_ID[etName] || "prospect",
    montant: p["Montant HT"] && p["Montant HT"].number != null ? p["Montant HT"].number : 0,
    offre: rtext(p["Offre"]),
    source: p["Source"] && p["Source"].select ? p["Source"].select.name : "",
    relance: (p["Relance"] && p["Relance"].date ? p["Relance"].date.start : "").slice(0, 10),
    majLe: (row.last_edited_time || "").slice(0, 10),
  };
}

export const enCours = (p) => !["signe", "perdu"].includes(p.etape);
export const nomAffiche = (p) => p.societe || p.contact || "Sans nom";

/* Tri du plus en retard au plus récent. */
const parUrgence = (a, b) => (a.relance || "9999").localeCompare(b.relance || "9999");

/* Le tableau de bord du matin : ce qui est dû, ce qui n'a pas de date, ce qui dort. */
export function analyser(rows, today = todayParis()) {
  const actifs = rows.map(toProspect).filter((p) => p && enCours(p));

  const dues = actifs.filter((p) => p.relance && p.relance <= today).sort(parUrgence);
  const sansRelance = actifs.filter((p) => !p.relance).sort((a, b) => (a.majLe || "").localeCompare(b.majLe || ""));
  const dormants = actifs.filter(
    (p) => !p.relance && p.majLe && joursEntre(p.majLe, today) >= JOURS_DORMANT
  );
  const aVenir = actifs.filter((p) => p.relance && p.relance > today).sort(parUrgence);

  const pipePondere = actifs.reduce(
    (s, p) => s + (Number(p.montant) || 0) * (ETAPES.find((e) => e.id === p.etape) || ETAPES[0]).proba, 0
  );

  return { actifs, dues, sansRelance, dormants, aVenir, pipePondere, today };
}
