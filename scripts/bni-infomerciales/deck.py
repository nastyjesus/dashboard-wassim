"""Lecture et mise à jour du support de réunion BNI (slides infomerciales).

Une slide membre utilise la disposition « Infomerciale_30s » :
- bandeau « Qui peut m'aider à rencontrer » : espace réservé texte en haut à gauche ;
- colonne droite : portrait, Prénom NOM, métier, logo ;
- grande zone gauche : la photo de la semaine.

On repère chaque membre par l'identifiant interne de sa slide (slide_id), qui
ne change pas quand on réordonne les slides.
"""
import io

from PIL import Image, ImageOps
from pptx import Presentation
from pptx.enum.shapes import MSO_SHAPE_TYPE, PP_PLACEHOLDER

LAYOUT_MEMBRE = "Infomerciale_30s"

# Zone de la photo de la semaine, en fraction de la slide (x, y, largeur, hauteur).
# Reprise de l'espace réservé image de la disposition « Infomerciale_30s ».
ZONE_PHOTO = (0.015, 0.14, 0.752, 0.836)
# Tout ce qui commence au-delà de cette abscisse appartient à la colonne de droite.
DEBUT_COLONNE_DROITE = 0.74

PHOTO_COTE_MAX = 1920
PHOTO_QUALITE = 85


def _texte(shape):
    if not shape.has_text_frame:
        return ""
    return " ".join(l.strip() for l in shape.text_frame.text.splitlines() if l.strip())


def _rel(shape, slide):
    prs = slide.part.package.presentation_part.presentation
    W, H = prs.slide_width, prs.slide_height
    return shape.left / W, shape.top / H, shape.width / W, shape.height / H


def _champ_texte(slide, y_min, y_max):
    """Espace réservé texte de la colonne de droite dont le haut est dans [y_min, y_max]."""
    for sh in slide.shapes:
        if not sh.has_text_frame:
            continue
        x, y, _, _ = _rel(sh, slide)
        if x >= DEBUT_COLONNE_DROITE and y_min <= y <= y_max:
            return sh
    return None


def _champ_recherche(slide):
    """Bandeau « Qui peut m'aider à rencontrer » : espace réservé texte en haut."""
    candidats = []
    for sh in slide.shapes:
        if not (sh.is_placeholder and sh.has_text_frame):
            continue
        if sh.placeholder_format.type not in (PP_PLACEHOLDER.BODY, PP_PLACEHOLDER.OBJECT):
            continue
        x, y, w, _ = _rel(sh, slide)
        if y < 0.15 and x < DEBUT_COLONNE_DROITE and w > 0.4:
            candidats.append(sh)
    return candidats[0] if candidats else None


def _est_photo_semaine(sh, slide):
    """Image posée dans la grande zone gauche (photo d'une semaine précédente)."""
    est_image = sh.shape_type == MSO_SHAPE_TYPE.PICTURE or (
        sh.is_placeholder and sh.placeholder_format.type == PP_PLACEHOLDER.PICTURE
    )
    if not est_image:
        return False
    x, y, w, h = _rel(sh, slide)
    cx, cy = x + w / 2, y + h / 2
    zx, zy, zw, zh = ZONE_PHOTO
    return x < DEBUT_COLONNE_DROITE and zx <= cx <= zx + zw and zy <= cy <= zy + zh


def lister_membres(chemin_deck):
    """Liste les slides infomerciales nominatives du deck, dans l'ordre."""
    prs = Presentation(chemin_deck)
    membres = []
    for numero, slide in enumerate(prs.slides, 1):
        if slide.slide_layout.name != LAYOUT_MEMBRE:
            continue
        nom = _champ_texte(slide, 0.30, 0.40)
        metier = _champ_texte(slide, 0.40, 0.48)
        nom = _texte(nom) if nom else ""
        if not nom:
            continue  # slide modèle pas encore attribuée
        recherche = _champ_recherche(slide)
        membres.append({
            "slide_id": slide.slide_id,
            "numero": numero,
            "nom": nom,
            "metier": _texte(metier) if metier else "",
            "recherche": _texte(recherche) if recherche else "",
            # un espace réservé image vide n'a pas de « blip » : ce n'est pas une photo
            "a_une_photo": any(_est_photo_semaine(sh, slide) and sh._element.xpath(".//a:blip")
                               for sh in slide.shapes),
        })
    return membres


def preparer_photo(octets):
    """Redresse (EXIF), réduit et recompresse la photo. Renvoie (jpeg, largeur, hauteur)."""
    img = ImageOps.exif_transpose(Image.open(io.BytesIO(octets)))
    if img.mode != "RGB":
        fond = Image.new("RGB", img.size, "white")
        fond.paste(img, mask=img.convert("RGBA").split()[-1])
        img = fond
    img.thumbnail((PHOTO_COTE_MAX, PHOTO_COTE_MAX), Image.LANCZOS)
    sortie = io.BytesIO()
    img.save(sortie, "JPEG", quality=PHOTO_QUALITE, optimize=True)
    return sortie.getvalue(), img.width, img.height


def _supprimer(sh, slide):
    el = sh._element
    rids = el.xpath(".//a:blip/@r:embed")
    el.getparent().remove(el)
    for rid in rids:
        slide.part.drop_rel(rid)  # ne supprime que si plus aucune référence


def _ecrire_texte(sh, texte):
    tf = sh.text_frame
    p = tf.paragraphs[0]
    for autre in tf.paragraphs[1:]:
        autre._p.getparent().remove(autre._p)
    runs = p.runs
    if runs:
        runs[0].text = texte
        for r in runs[1:]:
            r._r.getparent().remove(r._r)
    else:
        p.add_run().text = texte


def appliquer(chemin_source, chemin_sortie, depots):
    """Applique les dépôts au deck et enregistre une copie.

    depots : liste de dicts {slide_id, recherche, photo (octets JPEG), largeur, hauteur}.
    Renvoie la liste des slide_id effectivement mis à jour.
    """
    prs = Presentation(chemin_source)
    W, H = prs.slide_width, prs.slide_height
    par_id = {s.slide_id: s for s in prs.slides}
    faits = []
    for d in depots:
        slide = par_id.get(d["slide_id"])
        if slide is None or slide.slide_layout.name != LAYOUT_MEMBRE:
            continue
        if d.get("recherche"):
            champ = _champ_recherche(slide)
            if champ is not None:
                _ecrire_texte(champ, d["recherche"])
        if d.get("photo"):
            for sh in [sh for sh in slide.shapes if _est_photo_semaine(sh, slide)]:
                _supprimer(sh, slide)
            zx, zy, zw, zh = ZONE_PHOTO
            boite_l, boite_h = zw * W, zh * H
            ratio = min(boite_l / d["largeur"], boite_h / d["hauteur"])
            l, h = int(d["largeur"] * ratio), int(d["hauteur"] * ratio)
            gauche = int(zx * W + (boite_l - l) / 2)
            haut = int(zy * H + (boite_h - h) / 2)
            pic = slide.shapes.add_picture(io.BytesIO(d["photo"]), gauche, haut, l, h)
            pic.name = "Photo de la semaine"
        faits.append(d["slide_id"])
    prs.save(chemin_sortie)
    return faits
