import { describe, it, expect } from "vitest";
import { analyser, toProspect, isoPlus, joursEntre, todayParis, heureParis, JOURS_DORMANT } from "../src/relances.js";

/* Fabrique une ligne Notion minimale conforme à la base « Pilotage 26/27 ». */
function row({ id = "id-1", societe = "ACME", contact = "Jean", statut = "Pipeline", etape = "Prospect", montant = 1000, relance = null, majLe = "2026-09-09" }) {
  return {
    id,
    last_edited_time: `${majLe}T10:00:00.000Z`,
    properties: {
      "Client": { title: societe ? [{ plain_text: societe }] : [] },
      "Contact": { rich_text: contact ? [{ plain_text: contact }] : [] },
      "Statut": { select: { name: statut } },
      "Étape": { select: { name: etape } },
      "Montant HT": { number: montant },
      "Relance": relance ? { date: { start: relance } } : { date: null },
    },
  };
}

describe("toProspect", () => {
  it("ne retient que les lignes Pipeline", () => {
    expect(toProspect(row({ statut: "Signé" }))).toBeNull();
    expect(toProspect(row({ statut: "Membre BNI" }))).toBeNull();
    expect(toProspect(row({ statut: "Pipeline" }))).not.toBeNull();
  });

  it("traduit l'étape Notion en identifiant interne", () => {
    expect(toProspect(row({ etape: "Diagnostic" })).etape).toBe("diagnostic");
    expect(toProspect(row({ etape: "Contacté" })).etape).toBe("contacte");
  });

  it("tronque la date de relance au jour", () => {
    expect(toProspect(row({ relance: "2026-09-15T00:00:00.000+02:00" })).relance).toBe("2026-09-15");
  });
});

describe("dates", () => {
  it("décale sans dériver au passage à l'heure d'hiver", () => {
    expect(isoPlus("2026-10-24", 7)).toBe("2026-10-31");
    expect(isoPlus("2026-10-31", 1)).toBe("2026-11-01");
  });

  it("compte les jours entre deux dates", () => {
    expect(joursEntre("2026-09-01", "2026-09-09")).toBe(8);
    expect(joursEntre("2026-09-09", "2026-09-09")).toBe(0);
  });

  it("rend la date et l'heure de Paris, pas celles d'UTC", () => {
    /* 23h30 UTC le 8 septembre = 1h30 le 9 à Paris (CEST). */
    const t = new Date("2026-09-08T23:30:00Z");
    expect(todayParis(t)).toBe("2026-09-09");
    expect(heureParis(t)).toBe(1);
    /* 6h UTC = 8h Paris l'été, 7h UTC = 8h Paris l'hiver. */
    expect(heureParis(new Date("2026-09-09T06:00:00Z"))).toBe(8);
    expect(heureParis(new Date("2026-12-09T07:00:00Z"))).toBe(8);
    expect(heureParis(new Date("2026-12-09T06:00:00Z"))).toBe(7);
  });
});

describe("analyser", () => {
  const today = "2026-09-09";

  it("sort les relances dues, échues comprises, et ignore signé/perdu", () => {
    const a = analyser([
      row({ id: "a", relance: "2026-09-02" }),                       // en retard
      row({ id: "b", relance: today }),                              // due aujourd'hui
      row({ id: "c", relance: "2026-09-20" }),                       // à venir
      row({ id: "d", relance: "2026-09-01", etape: "Signé" }),       // hors pipeline
      row({ id: "e", relance: "2026-09-01", etape: "Perdu" }),       // hors pipeline
    ], today);
    expect(a.dues.map((p) => p.id)).toEqual(["a", "b"]);
    expect(a.aVenir.map((p) => p.id)).toEqual(["c"]);
  });

  it("trie les dues du plus en retard au plus récent", () => {
    const a = analyser([
      row({ id: "recent", relance: "2026-09-08" }),
      row({ id: "vieux", relance: "2026-08-20" }),
    ], today);
    expect(a.dues.map((p) => p.id)).toEqual(["vieux", "recent"]);
  });

  it("repère les prospects sans date de relance", () => {
    const a = analyser([row({ id: "x", relance: null })], today);
    expect(a.sansRelance.map((p) => p.id)).toEqual(["x"]);
    expect(a.dues).toHaveLength(0);
  });

  it("ne compte dormant qu'au-delà du délai, et jamais un prospect qui a une relance posée", () => {
    const vieux = isoPlus(today, -JOURS_DORMANT);
    const frais = isoPlus(today, -(JOURS_DORMANT - 1));
    const a = analyser([
      row({ id: "dort", relance: null, majLe: vieux }),
      row({ id: "frais", relance: null, majLe: frais }),
      row({ id: "suivi", relance: "2026-10-01", majLe: vieux }),
    ], today);
    expect(a.dormants.map((p) => p.id)).toEqual(["dort"]);
  });

  it("pondère le pipeline par la probabilité d'étape", () => {
    const a = analyser([
      row({ id: "p", etape: "Propale", montant: 1000 }),      // 0.6
      row({ id: "d", etape: "Diagnostic", montant: 1000 }),   // 0.4
      row({ id: "s", etape: "Signé", montant: 5000 }),        // exclu
    ], today);
    expect(Math.round(a.pipePondere)).toBe(1000);
  });
});
