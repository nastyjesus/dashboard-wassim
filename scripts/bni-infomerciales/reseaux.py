"""Slides « Réseaux sociaux » de la semaine dans le support de réunion BNI.

Le responsable réseaux sociaux dépose 1 à 10 fichiers (.pptx, .pdf, .jpg,
.png) ; ils sont posés juste après la slide repère « RÉSEAUX SOCIAUX », dans
la même section qu'elle, dans l'ordre des fichiers puis des pages :

- image : une slide « Page vide », image centrée et ajustée sans recadrage
  (réduite à 2400 px, JPEG 88, transparence sur fond blanc, orientation EXIF) ;
- PDF : une page = une image, comme la conférence (conference.pages_pdf) ;
- PowerPoint : slides recopiées avec leur masque et leurs dispositions
  (masques nommés « Réseaux sociaux du AAAA-MM-JJ (modèle i) »).

Chaque slide posée porte le nom interne « Réseaux sociaux du AAAA-MM-JJ (i/n) »
(vendredi de la réunion) : c'est ce qui permet de la remplacer quand le
responsable redépose, et de la retirer au nettoyage du samedi. Les slides
sans ce nom ne sont jamais touchées, sauf le retrait unique prévu par le plan
de nettoyage (slides posées à la main avant la mise en route du module).

Repère : slide_id 3854 (identifiant interne, stable quand on déplace la slide) ;
à défaut, l'unique slide non système dont un texte normalisé commence par
« RESEAUX SOCIAUX ». Sinon : erreur, rien n'est posé.
"""
import io
import re
import unicodedata

from PIL import Image, ImageOps
from pptx import Presentation
from pptx.shapes.group import GroupShape

import conference
from conference import NS, _placer_apres, _sld_id_lst, _supprimer_slide

REPERE_ID = 3854
REPERE_TEXTE = "RESEAUX SOCIAUX"
PREFIXE = "Réseaux sociaux du "
MOTIF = re.compile(r"^Réseaux sociaux du (\d{4}-\d{2}-\d{2}) \(\d+/\d+\)$")
PREFIXE_MASQUE = "Réseaux sociaux du "
LAYOUT_VIDE = conference.LAYOUT_VIDE
COTE_MAX = 2400  # px
QUALITE = 88
TYPES = ("pptx", "pdf", "jpg", "png")
SLIDES_MAX = 80  # par dépôt, tous fichiers confondus
LAYOUT_MEMBRE = "Infomerciale_30s"  # = deck.LAYOUT_MEMBRE (deck importe ce module)
# Le retrait unique des slides posées à la main ne s'applique que le samedi
# 28/11/2026 (date de Paris) ; un autre jour, seul l'essai à blanc l'affiche.
RETRAIT_UNIQUE_JOUR = "2026-11-28"


class ReseauxImpossible(Exception):
    """Fichier illisible, vide, ou repère « Réseaux sociaux » introuvable."""


def nom_slide(vendredi, i, n):
    return f"{PREFIXE}{vendredi} ({i}/{n})"


def vendredi_de(slide):
    """Date (AAAA-MM-JJ) si la slide a été posée par ce module, sinon None."""
    m = MOTIF.match(slide._element.cSld.get("name") or "")
    return m.group(1) if m else None


def est_reseaux(slide):
    return vendredi_de(slide) is not None


# ---------- repère ----------

def normaliser(texte):
    """Majuscules, sans accents, espaces compactés."""
    sans_accents = "".join(c for c in unicodedata.normalize("NFD", texte) if unicodedata.category(c) != "Mn")
    return " ".join(sans_accents.upper().split())


def _textes(formes):
    for sh in formes:
        if isinstance(sh, GroupShape):
            yield from _textes(sh.shapes)
        elif sh.has_text_frame:
            yield sh.text_frame.text


def _a_le_texte_repere(slide):
    return any(normaliser(t).startswith(REPERE_TEXTE) for t in _textes(slide.shapes))


def trouver_repere(prs):
    """Slide repère « Réseaux sociaux », ou None (absente ou ambiguë)."""
    slides = [s for s in prs.slides if not conference.est_systeme(s)]
    for s in slides:
        if s.slide_id == REPERE_ID:
            return s
    # repli : jamais une slide membre (une demande peut citer les réseaux sociaux)
    candidates = [s for s in slides if s.slide_layout.name != LAYOUT_MEMBRE and _a_le_texte_repere(s)]
    return candidates[0] if len(candidates) == 1 else None


def _element_de(prs, slide):
    return next(e for e in _sld_id_lst(prs) if e.get("id") == str(slide.slide_id))


# ---------- fichiers déposés ----------

def preparer_image(octets):
    """Redresse (EXIF), aplatit la transparence sur du blanc, réduit à
    COTE_MAX et recompresse. Renvoie (jpeg, largeur, hauteur)."""
    try:
        img = Image.open(io.BytesIO(octets))
        img.load()
        img = ImageOps.exif_transpose(img)
        if img.mode != "RGB":
            rgba = img.convert("RGBA")
            fond = Image.new("RGB", img.size, "white")
            fond.paste(rgba, mask=rgba.split()[-1])
            img = fond
    except Exception as e:  # noqa: BLE001 — image abîmée, format inattendu, image géante
        raise ReseauxImpossible("image illisible") from e
    img.thumbnail((COTE_MAX, COTE_MAX), Image.LANCZOS)
    sortie = io.BytesIO()
    img.save(sortie, "JPEG", quality=QUALITE, optimize=True)
    return sortie.getvalue(), img.width, img.height


def _preparer(fichiers):
    """Lit chaque fichier avant de toucher au deck. Renvoie
    [("images", [(jpeg, l, h)]) | ("pptx", Presentation)] dans l'ordre."""
    if not fichiers:
        raise ReseauxImpossible("aucun fichier")
    prets = []
    for k, f in enumerate(fichiers, 1):
        quoi = f"fichier {k}/{len(fichiers)}"
        try:
            if f["type"] == "pdf":
                prets.append(("images", conference.pages_pdf(f["octets"], erreur=ReseauxImpossible)))
            elif f["type"] in ("jpg", "jpeg", "png"):
                prets.append(("images", [preparer_image(f["octets"])]))
            elif f["type"] == "pptx":
                prets.append(("pptx", conference.ouvrir_pptx(f["octets"], erreur=ReseauxImpossible)))
            else:
                raise ReseauxImpossible(f"type de fichier inconnu : {f['type']}")
        except ReseauxImpossible as e:
            raise ReseauxImpossible(f"{quoi} : {e}") from e
    total = sum(_nb_slides(p) for p in prets)
    if total > SLIDES_MAX:
        raise ReseauxImpossible(f"dépôt trop long ({total} slides au total, {SLIDES_MAX} max)")
    return prets


def _nb_slides(pret):
    genre, contenu = pret
    return len(contenu) if genre == "images" else len(contenu.slides)


# ---------- retrait ----------

def retirer(prs, jusqu_au=None, essai=False):
    """Retire les slides posées par ce module pour un vendredi <= jusqu_au
    (toutes si None). Renvoie [(numéro, slide_id)]."""
    return conference.retirer_posees(prs, vendredi_de, PREFIXE_MASQUE, jusqu_au, essai)


def _examiner_retrait_unique(prs, ids):
    """Sépare les slide_id du retrait unique en (à retirer, laissées).

    Une slide n'est retirée que si elle n'a pas de nom système, est en
    disposition « Page vide » et suit la repère sans interruption (au besoin
    après d'autres slides réseaux sociaux ou d'autres slides de la liste)."""
    ids = [int(i) for i in ids]
    if not ids:
        return [], []
    slides = list(prs.slides)
    par_id = {s.slide_id: (n, s) for n, s in enumerate(slides, 1)}
    repere = trouver_repere(prs)

    def admissible(s):
        return not conference.est_systeme(s) and s.slide_layout.name == LAYOUT_VIDE

    contigues = set()
    if repere is not None:
        j = par_id[repere.slide_id][0]  # index (base 0) de la slide qui suit la repère
        while j < len(slides) and (est_reseaux(slides[j]) or (slides[j].slide_id in ids and admissible(slides[j]))):
            contigues.add(slides[j].slide_id)
            j += 1
    a_retirer, laissees = [], []
    for sid in ids:
        if sid not in par_id:
            laissees.append({"slide_id": sid, "motif": "absente du deck"})
            continue
        numero, s = par_id[sid]
        if conference.est_systeme(s):
            laissees.append({"slide_id": sid, "numero": numero, "motif": "nom système"})
        elif s.slide_layout.name != LAYOUT_VIDE:
            laissees.append({"slide_id": sid, "numero": numero, "motif": f"disposition autre que « {LAYOUT_VIDE} »"})
        elif repere is None:
            laissees.append({"slide_id": sid, "numero": numero, "motif": "repère Réseaux sociaux introuvable"})
        elif sid not in contigues:
            laissees.append({"slide_id": sid, "numero": numero, "motif": "pas juste après la repère"})
        else:
            a_retirer.append((numero, sid))
    return a_retirer, laissees


def nettoyer(prs, jusqu_au=None, retrait_unique=(), essai=False):
    """Nettoyage du samedi sur un deck ouvert (modifié en place sauf essai).

    jusqu_au : vendredi de la réunion passée ; les slides posées pour ce
    vendredi ou un plus ancien sont retirées. retrait_unique : slide_id posées
    à la main à retirer une seule fois, avec garde-fous (_examiner_retrait_unique).
    Renvoie {"retirees": [{slide_id, numero, quoi}], "laissees": [{slide_id, numero?, motif}]}."""
    unique, laissees = _examiner_retrait_unique(prs, retrait_unique)
    datees = retirer(prs, jusqu_au, essai=True) if jusqu_au else []
    retirees = [{"slide_id": sid, "numero": n, "quoi": "posée par le système"} for n, sid in datees]
    retirees += [{"slide_id": sid, "numero": n, "quoi": "retrait unique"} for n, sid in unique]
    retirees.sort(key=lambda r: r["numero"])
    if not essai:
        # retrait unique d'abord (slides sans nom système), puis les slides datées
        for _, sid in unique:
            _supprimer_slide(prs, next(e for e in _sld_id_lst(prs) if e.get("id") == str(sid)))
        if jusqu_au:
            retirer(prs, jusqu_au)
    return {"retirees": retirees, "laissees": laissees}


# ---------- point d'entrée ----------

def inserer(chemin_source, chemin_sortie, vendredi, fichiers):
    """Pose le dépôt réseaux sociaux : retire les slides réseaux déjà posées
    pour ce vendredi ou un plus ancien, puis insère les nouvelles juste après
    la repère. fichiers : [{"type": "pptx"|"pdf"|"jpg"|"png", "octets": bytes}].

    Renvoie {"slides": n, "retirees": k, "avertissement": str}.
    Lève ReseauxImpossible (rien n'est écrit) si un fichier est illisible ou si
    la repère est introuvable.
    """
    prets = _preparer(fichiers)
    total = sum(_nb_slides(p) for p in prets)
    prs = Presentation(chemin_source)
    retirees = len(retirer(prs, jusqu_au=vendredi))
    repere = trouver_repere(prs)
    if repere is None:
        raise ReseauxImpossible("repère Réseaux sociaux introuvable")
    repere_el = _element_de(prs, repere)

    # noms dans l'ordre final (fichiers puis pages)
    noms, i = [], 1
    for p in prets:
        noms.append([nom_slide(vendredi, i + k, total) for k in range(_nb_slides(p))])
        i += _nb_slides(p)
    # images d'abord : prs.slides n'est plus lisible après une recopie .pptx ;
    # l'ordre final est rétabli au placement
    par_fichier = [None] * len(prets)
    for k, (genre, contenu) in enumerate(prets):
        if genre == "images":
            par_fichier[k] = conference.ajouter_images(prs, contenu, noms[k], lambda j: f"Réseaux sociaux image {j}")
    avertissements, masques = [], 0
    lst_masques = prs.part._element.find("p:sldMasterIdLst", NS)
    for k, (genre, contenu) in enumerate(prets):
        if genre == "pptx":
            avant = len(lst_masques)
            par_fichier[k], avertissement = conference.recopier_pptx(
                prs, contenu, noms[k], lambda j, d=masques: f"{PREFIXE_MASQUE}{vendredi} (modèle {d + j})")
            masques += len(lst_masques) - avant
            if avertissement:
                avertissements.append(f"fichier {k + 1} : {avertissement}")
    nouveaux = [e for elements in par_fichier for e in elements]
    _placer_apres(prs, repere_el, nouveaux)
    prs.save(chemin_sortie)
    return {"slides": len(nouveaux), "retirees": retirees, "avertissement": " ; ".join(avertissements)}


def slides_reseaux(chemin_deck):
    """[(numéro, vendredi)] des slides posées par ce module."""
    prs = Presentation(chemin_deck)
    return [(i, vendredi_de(s)) for i, s in enumerate(prs.slides, 1) if est_reseaux(s)]
