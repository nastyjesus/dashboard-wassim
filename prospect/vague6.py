# -*- coding: utf-8 -*-
"""Vague 6 (brief du 06/11/2026) : quatorze metiers inspires de BNI Lorient
Performance, sourcing seulement (rien n'est envoye).

Meme chaine que la vague 5 (prospect.vague5) avec ses propres parametres :
- zone : Bruz et Chavagne (limitrophes) en priorite, puis les communes du
  brief et les quartiers sud et ouest de Rennes (decoupage officiel :
  3 Bourg-l'Evesque / La Touche, 7 La Pommeraie, 8 Sud-Gare, 9 Cleunay /
  La Courrouze, 10 Villejean / Beauregard, 11 Le Blosne, 12 Brequigny) ;
- metier prouve par le nom, le site ou le BODACC ; pour les codes NAF
  fourre-tout (poeles, piscines, carrosserie, menuiserie exterieure,
  immobilier commercial, utilitaires), sans preuve la fiche sort ;
- reseaux : succursale de grand groupe exclue, franchise local garde avec
  alerte ;
- dedoublonnage contre toutes les feuilles, vague 5 comprise.

Exclu par le brief : courtier en bourse / placements (trop proche du membre
en gestion de patrimoine).

    python -m prospect.vague6 selection|verifier|exporter|classeur
"""
import re
import sys

from . import vague5 as V

V.PREFIXE = "v6"
V.FICHIER = "vague6"
V.LIBELLE = "vague 6"
V.ONGLET = "V6. "
V.SECTIONS_EXISTANTES = V.SECTIONS_EXISTANTES + ["vague5.csv"]

V.METIERS = ["macon", "menuiserie-exterieure", "isolation", "platrier-plaquiste", "revetement-sol",
             "cheminees-poeles", "piscine-spa", "immobilier-commercial", "concession-vl", "concession-vu",
             "carrosserie", "joaillerie", "pompes-funebres", "veterinaire"]

LIMITROPHES = {"35047": "BRUZ", "35076": "CHAVAGNE", "35066": "CHARTRES-DE-BRETAGNE",
               "35281": "SAINT-JACQUES-DE-LA-LANDE", "35363": "PONT-PEAN", "35139": "LAILLE",
               "35126": "GUICHEN", "35123": "GOVEN", "35208": "ORGERES"}
ELARGIE = {"35206", "35352", "35055", "35240", "35353", "35196", "35037", "35051", "35069", "35136",
           "35012", "35188", "35275", "35210"}
V.COMMUNES = set(LIMITROPHES) | ELARGIE
V.QUARTIERS = {3, 7, 8, 9, 10, 11, 12}
V.PRIORITAIRES = set(LIMITROPHES.values()) | {"ST JACQUES DE LA LANDE", "PONT PEAN"}

V.GROUPES_SANS_FRANCHISE = re.compile(
    r"\b(eiffage|spie|engie|vinci|bouygues|ineo|equans|dalkia|saint.gobain|point\.?p|"
    r"tapis saint.maclou|saint.maclou|pfg|pompes funebres generales|ogf|carglass|france pare.?brise|"
    r"norauto|speedy|midas|feu vert|euromaster|histoire d.or|marc orian|julien d.orcel|maty|cleor|"
    r"pandora|swarovski)\b", re.I)
V.RESEAUX_METIER = {
    "joaillerie": r"\b(agatha|thom|edora|la boutique du bijou|lepage)\b",
    "pompes-funebres": r"\b(roc.?eclerc|funecap|pompes funebres de france|choix funeraire|dignite funeraire|"
                       r"funeplus|pfd|harmonie funeraire)\b",
    "carrosserie": r"\b(ad carrosserie|five star|axial|carrosserie experte|precisium|point s|first stop|"
                   r"autodistribution|vulco|motrio)\b",
    "cheminees-poeles": r"\b(cheminees philippe|brisach|invicta|jotul|poeles et cheminees|ambiance flamme)\b",
    "piscine-spa": r"\b(piscinelle|desjoyaux|diffazur|aquilus|everblue|piscine center|esprit piscine|"
                   r"irrijardin|cash piscines|magiline|carre bleu)\b",
    "menuiserie-exterieure": r"\b(tryba|lorenove|art et fenetres|grosfillex|k.?line|b.?plast|franciaflex|"
                             r"komilfo|monsieur store|harmonie fenetres)\b",
    "immobilier-commercial": r"\b(cbre|bnp paribas real|cushman|jll|arthur loyd|michel simond|"
                             r"century 21 entreprise|giboire)\b",
    "veterinaire": r"\b(anicura|evidensia|mon veto|vetocentre|argos)\b",
    "revetement-sol": r"\b(saint.maclou|lapeyre|leroy merlin|brico)\b",
}
V.DOMAINES_RESEAUX = re.compile(
    r"roc-eclerc|funecap|pf-de-france|choix-funeraire|carglass|ad\.fr|five-star|desjoyaux|piscinelle|"
    r"everblue|aquilus|tryba|lorenove|art-et-fenetres|monsieurstore|komilfo|anicura|evidensia|monveto|"
    r"cbre|cushmanwakefield|arthur-loyd|michelsimond|agatha|histoiredor|julien-dorcel|brisach|"
    r"cheminees-philippe|saint-maclou|"
    # Domaines des constructeurs : leur adresse est celle de la marque, pas de la concession.
    r"mercedes-benz|renault\.(com|fr)|stellantis|peugeot\.(com|fr)|citroen\.(com|fr)|toyota|volkswagen|"
    r"bmw\.(fr|com)|audi\.(fr|com)|kia\.(fr|com)|hyundai|nissan\.(fr|com)|ford\.(fr|com)|dacia|opel\.(fr|com)")

V.PREUVES = {
    "macon": r"macon|gros.?oeuvre|batiment|construction|renovation",
    "menuiserie-exterieure": r"fenetre|porte|volet|menuiseries? exterieure|baie|pvc|alu|veranda|store|fermeture",
    "isolation": r"isol|combles|thermique|ite\b",
    "platrier-plaquiste": r"platr|plaqu|cloison|faux.?plafond|staff",
    "revetement-sol": r"carrel|parquet|sols?\b|revetement|moquette|faience",
    "cheminees-poeles": r"poele|chemin|insert|granule|foyer|ramon",
    "piscine-spa": r"piscine|spa\b|sauna|jacuzzi|hammam|baln",
    "immobilier-commercial": r"entreprise|commerc|fonds de commerce|cession|bureaux|locaux|emplacement|"
                             r"business|transmission",
    # Une concession vend du neuf pour une marque : la preuve est la marque ou
    # le mot concession/agent. "Automobiles" ou "garage" seuls designent aussi
    # le negoce d'occasion et la mecanique.
    "concession-vl": r"concession|agent (agree|officiel)|distributeur|renault|peugeot|citroen|toyota|volkswagen|"
                     r"\bford\b|\bkia\b|hyundai|dacia|nissan|opel|\bfiat\b|skoda|\bseat\b|cupra|mercedes|\bbmw\b|"
                     r"\baudi\b|volvo|mazda|honda|tesla|suzuki|mitsubishi|ds automobiles|jeep|mg motor|\bbyd\b|lexus",
    "concession-vu": r"utilitaire|poids.?lourd|camion|fourgon|vehicules? industriel|truck|iveco|renault trucks|"
                     r"man\b|scania|daf\b",
    "carrosserie": r"carross|debossel|peinture automobile|tolerie",
    "joaillerie": r"bijou|joaill|horlog|orfevr|or\b|gemmo|diamant",
    "pompes-funebres": r"funebre|funerai|obseque|marbrer|thanato|crematori",
    "veterinaire": r"veterin|clinique|animaux|equin",
}
V.CONTRE = {
    "immobilier-commercial": r"location saisonniere|syndic",
    "carrosserie": r"poids lourds? et|nautique",
}
V.NAF_FIABLE = {"macon", "isolation", "platrier-plaquiste", "revetement-sol", "joaillerie",
                "pompes-funebres", "veterinaire"}
V.RPPS_PROF = {}
V.NOTION = "notion_v6.json"
# Concessions et carrosseries appartiennent souvent a des groupes regionaux
# (ETI) dont le dirigeant est identifiable : on les garde avec une alerte.
V.ETI_GARDEES = {"concession-vl", "concession-vu", "carrosserie"}

V.ONGLETS = {"macon": "V6. Maçon", "menuiserie-exterieure": "V6. Menuiserie extérieure",
             "isolation": "V6. Isolation", "platrier-plaquiste": "V6. Plâtrier-plaquiste",
             "revetement-sol": "V6. Revêtement de sol", "cheminees-poeles": "V6. Cheminées-poêles",
             "piscine-spa": "V6. Piscine-spa", "immobilier-commercial": "V6. Immobilier commercial",
             "concession-vl": "V6. Concession VL", "concession-vu": "V6. Concession VU",
             "carrosserie": "V6. Carrosserie", "joaillerie": "V6. Joaillerie",
             "pompes-funebres": "V6. Pompes funèbres", "veterinaire": "V6. Vétérinaire"}

CODES = sorted(V.COMMUNES | {V.RENNES})

if __name__ == "__main__":
    {"selection": V.selection, "verifier": V.verifier, "exporter": V.exporter,
     "classeur": V.classeur, "codes": lambda: print(",".join(CODES))}[sys.argv[1]]()
