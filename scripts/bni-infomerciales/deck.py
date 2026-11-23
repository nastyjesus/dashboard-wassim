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

import conference
import reseaux

LAYOUT_MEMBRE = reseaux.LAYOUT_MEMBRE  # « Infomerciale_30s »

# Zone de la photo de la semaine, en fraction de la slide (x, y, largeur, hauteur).
# Reprise de l'espace réservé image de la disposition « Infomerciale_30s ».
ZONE_PHOTO = (0.015, 0.14, 0.752, 0.836)
# Tout ce qui commence au-delà de cette abscisse appartient à la colonne de droite.
DEBUT_COLONNE_DROITE = 0.74

NOM_PHOTO = "Photo de la semaine"
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
    """Image posée dans la grande zone gauche (photo d'une semaine précédente).

    Le complément PowerPoint pose la photo comme un rectangle rempli par
    l'image, nommé « Photo de la semaine » : on le reconnaît par son nom.
    """
    est_image = sh.shape_type == MSO_SHAPE_TYPE.PICTURE or sh.name == NOM_PHOTO or (
        sh.is_placeholder and sh.placeholder_format.type == PP_PLACEHOLDER.PICTURE
    )
    if not est_image:
        return False
    x, y, w, h = _rel(sh, slide)
    cx, cy = x + w / 2, y + h / 2
    zx, zy, zw, zh = ZONE_PHOTO
    return x < DEBUT_COLONNE_DROITE and zx <= cx <= zx + zw and zy <= cy <= zy + zh


def _est_slide_membre(slide):
    # une slide de conférence ou de réseaux sociaux recopiée d'un deck BNI peut
    # avoir la même disposition : elle n'est jamais une slide membre
    return slide.slide_layout.name == LAYOUT_MEMBRE and not conference.est_systeme(slide)


def lister_membres(chemin_deck):
    """Liste les slides infomerciales nominatives du deck, dans l'ordre."""
    prs = Presentation(chemin_deck)
    membres = []
    for numero, slide in enumerate(prs.slides, 1):
        if not _est_slide_membre(slide):
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
        if slide is None or not _est_slide_membre(slide):
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
            pic.name = NOM_PHOTO
        faits.append(d["slide_id"])
    prs.save(chemin_sortie)
    return faits


# ---------- nettoyage hebdo (samedi matin, après la réunion) ----------

def _photos_posees(slide):
    """Photos de la semaine réellement présentes (avec une image) dans la zone gauche."""
    return [sh for sh in slide.shapes if _est_photo_semaine(sh, slide) and sh._element.xpath(".//a:blip")]


def _espace_image_modele(slide):
    """Espace réservé image « Infomerciale » de la disposition (zone gauche)."""
    for ph in slide.slide_layout.placeholders:
        if ph.placeholder_format.type == PP_PLACEHOLDER.PICTURE and _est_photo_semaine(ph, slide):
            return ph
    return None


def _a_effacer(slide):
    bandeau = _champ_recherche(slide)
    return _photos_posees(slide), bandeau if bandeau is not None and bandeau.text_frame.text.strip() else None


def _vider_slide(slide):
    """Remet la slide dans son état vierge : zone photo vide (espace réservé de
    la disposition), bandeau vide (le texte d'invite réapparaît dans
    PowerPoint, rien en diaporama). Nom, métier, portrait, logo et toute autre
    forme restent intacts. Renvoie (nombre de photos retirées, texte effacé ?)."""
    photos, bandeau = _a_effacer(slide)
    arbre = slide.shapes._spTree
    position = min((arbre.index(sh._element) for sh in photos), default=None)
    for sh in photos:
        _supprimer(sh, slide)
    modele = _espace_image_modele(slide) if photos else None
    if modele is not None and not any(
        sh.is_placeholder and sh.placeholder_format.idx == modele.placeholder_format.idx for sh in slide.shapes
    ):
        slide.shapes.clone_placeholder(modele)
        nouveau = arbre[-1]
        arbre.remove(nouveau)
        arbre.insert(position, nouveau)  # même profondeur que la photo retirée
    if bandeau is not None:
        bandeau.text_frame.clear()  # garde un paragraphe vide et sa mise en forme
    return len(photos), bandeau is not None


def nettoyer(chemin_source, chemin_sortie=None, preserver=(), essai=False, conference_jusqu_au=None,
             reseaux_jusqu_au=None, reseaux_retrait_unique=()):
    """Vide la photo et la demande de la semaine de chaque slide membre reconnue.

    Slide reconnue : disposition « Infomerciale_30s » avec un nom (comme
    lister_membres). Les autres slides ne sont jamais modifiées ; celles qui
    ont la disposition membre sans nom sont comptées dans « non_reconnues ».
    preserver : slide_id à laisser (dépôt de la semaine suivante déjà posé).
    conference_jusqu_au : vendredi (AAAA-MM-JJ) ; les slides de conférence
    posées par le module pour cette réunion ou une plus ancienne sont retirées
    (celles d'une réunion à venir restent).
    reseaux_jusqu_au : idem pour les slides « Réseaux sociaux » (reseaux.py) ;
    reseaux_retrait_unique : slide_id posées à la main à retirer une fois, avec
    garde-fous (reseaux.nettoyer) ; celles qui ne passent pas restent et sont
    listées dans « reseaux_laissees ».
    essai : rien n'est écrit, le rapport dit ce qui serait effacé.
    Le deck n'est enregistré (chemin_sortie) que si une slide a changé.
    """
    prs = Presentation(chemin_source)
    preserver = set(preserver)
    rapport = {"nettoyees": [], "deja_vides": [], "preservees": [], "non_reconnues": 0, "conference": 0,
               "reseaux": 0, "reseaux_retirees": [], "reseaux_laissees": []}
    for numero, slide in enumerate(prs.slides, 1):
        if not _est_slide_membre(slide):
            continue
        nom = _champ_texte(slide, 0.30, 0.40)
        if not (nom and _texte(nom)):
            rapport["non_reconnues"] += 1
            continue
        if slide.slide_id in preserver:
            rapport["preservees"].append(slide.slide_id)
            continue
        if essai:
            photos, bandeau = _a_effacer(slide)
            nb, texte = len(photos), bandeau is not None
        else:
            nb, texte = _vider_slide(slide)
        if nb or texte:
            rapport["nettoyees"].append({"slide_id": slide.slide_id, "numero": numero, "photos": nb, "texte": texte})
        else:
            rapport["deja_vides"].append(slide.slide_id)
    if conference_jusqu_au:
        rapport["conference"] = conference.retirer(prs, jusqu_au=conference_jusqu_au, essai=essai)
    if reseaux_jusqu_au or reseaux_retrait_unique:
        r = reseaux.nettoyer(prs, reseaux_jusqu_au, reseaux_retrait_unique or (), essai=essai)
        rapport["reseaux"] = len(r["retirees"])
        rapport["reseaux_retirees"], rapport["reseaux_laissees"] = r["retirees"], r["laissees"]
    if (rapport["nettoyees"] or rapport["conference"] or rapport["reseaux"]) and not essai and chemin_sortie:
        prs.save(chemin_sortie)
    return rapport
