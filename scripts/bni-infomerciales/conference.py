"""Slides de la conférence de la semaine dans le support de réunion BNI.

Partie « Conférence » du deck : elle commence à la dernière slide de
disposition « Membre à l'honneur » (slide titre du conférencier, au début de
la dernière section). Les slides de la conférence sont insérées juste après.

- PDF : une page = une image sur une slide de disposition « Page vide »
  (comme les conférences posées jusqu'ici à la main) ;
- PowerPoint (.pptx) : slides recopiées avec leur propre disposition et leur
  propre masque (aucun style du deck n'est modifié).

Chaque slide insérée porte un nom interne « Conférence du AAAA-MM-JJ (i/n) »
(date du vendredi de la réunion) : c'est ce qui permet de la retirer au
nettoyage du samedi ou de la remplacer si le conférencier redépose. Les slides
posées à la main (sans ce nom) ne sont jamais touchées.

Les fonctions génériques (retrait par motif, images plein cadre, recopie d'un
.pptx) servent aussi aux slides « Réseaux sociaux » (reseaux.py).
"""
import io
import re

from lxml import etree
from PIL import Image
from pptx import Presentation
from pptx.opc.constants import RELATIONSHIP_TYPE as RT
from pptx.opc.package import Part, _Relationship
from pptx.opc.packuri import PackURI

LAYOUT_ANCRE = "Membre à l'honneur"
LAYOUT_VIDE = "Page vide"
PREFIXE = "Conférence du "
MOTIF = re.compile(r"^Conférence du (\d{4}-\d{2}-\d{2}) \(\d+/\d+\)$")
PREFIXE_MASQUE = "Conférence du "  # masque recopié avec un .pptx
PAGES_MAX = 80
LARGEUR_IMAGE = 2400  # px, plus grand côté d'une page PDF rendue
PIXELS_MAX = LARGEUR_IMAGE * LARGEUR_IMAGE  # plafond mémoire par page (~17 Mo en RVB)
QUALITE = 88
# Nom interne de toute slide posée par le système (conférence ou réseaux
# sociaux) : jamais prise pour une slide membre ni pour une repère.
MOTIF_SYSTEME = re.compile(r"^(Conférence du|Réseaux sociaux du) \d{4}-\d{2}-\d{2} \(\d+/\d+\)$")

NS = {
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
    "p14": "http://schemas.microsoft.com/office/powerpoint/2010/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}
R_ID = f"{{{NS['r']}}}id"


class ConferenceImpossible(Exception):
    """Fichier illisible, vide ou partie conférence introuvable dans le deck."""


def nom_slide(vendredi, i, n):
    return f"{PREFIXE}{vendredi} ({i}/{n})"


def vendredi_de(slide):
    """Date (AAAA-MM-JJ) de la conférence si la slide a été posée par ce module, sinon None."""
    m = MOTIF.match(slide._element.cSld.get("name") or "")
    return m.group(1) if m else None


def est_conference(slide):
    return vendredi_de(slide) is not None


def est_systeme(slide):
    """Slide posée par le système (conférence ou réseaux sociaux)."""
    return bool(MOTIF_SYSTEME.match(slide._element.cSld.get("name") or ""))


# ---------- structure du deck ----------

def _sld_id_lst(prs):
    return prs.part._element.find("p:sldIdLst", NS)


def _sections(prs):
    """Listes de slides de chaque section (p14:sldIdLst), ou [] sans sections."""
    return prs.part._element.findall(".//p14:sectionLst/p14:section/p14:sldIdLst", NS)


def _racine(partie):
    """XML d'une partie : objet chargé par python-pptx, ou partie brute recopiée
    d'un autre .pptx (seulement des octets jusqu'au rechargement du deck)."""
    el = getattr(partie, "_element", None)
    return el if el is not None else etree.fromstring(partie.blob)


def _ancre(prs):
    """Dernière slide « Membre à l'honneur » (hors slides posées par le système)."""
    ancre = None
    for s in prs.slides:
        if s.slide_layout.name == LAYOUT_ANCRE and not est_systeme(s):
            ancre = s
    return ancre


def _supprimer_slide(prs, sld_id):
    """Retire une slide (élément p:sldId) du deck et de sa section."""
    rid = sld_id.get(R_ID)
    num = sld_id.get("id")
    sld_id.getparent().remove(sld_id)
    for lst in _sections(prs):
        for e in lst.findall("p14:sldId", NS):
            if e.get("id") == num:
                lst.remove(e)
    prs.part.drop_rel(rid)


def _masques_orphelins(prs, prefixe_masque=PREFIXE_MASQUE):
    """Masques recopiés avec un .pptx que plus aucune slide n'utilise : retirés."""
    utilises = {id(s.slide_layout.slide_master.part) for s in prs.slides}
    lst = prs.part._element.find("p:sldMasterIdLst", NS)
    for e in list(lst):
        partie = prs.part.related_part(e.get(R_ID))
        nom = partie._element.cSld.get("name") or ""
        if nom.startswith(prefixe_masque) and id(partie) not in utilises:
            lst.remove(e)
            prs.part.drop_rel(e.get(R_ID))


def retirer_posees(prs, date_de, prefixe_masque, jusqu_au=None, essai=False):
    """Retire les slides dont `date_de(slide)` (vendredi AAAA-MM-JJ, ou None
    pour une slide à ne pas toucher) est <= jusqu_au (toutes si None), puis les
    masques recopiés devenus orphelins. Renvoie [(numéro, slide_id)] retirées."""
    a_retirer = []
    for numero, (e, s) in enumerate(zip(list(_sld_id_lst(prs)), list(prs.slides)), 1):
        v = date_de(s)
        if v is not None and (jusqu_au is None or v <= jusqu_au):
            a_retirer.append((numero, s.slide_id, e))
    if not essai:
        for _, _, e in a_retirer:
            _supprimer_slide(prs, e)
        if a_retirer:
            _masques_orphelins(prs, prefixe_masque)
    return [(numero, sid) for numero, sid, _ in a_retirer]


def retirer(prs, jusqu_au=None, essai=False):
    """Retire les slides de conférence posées par ce module dont le vendredi
    est <= jusqu_au (toutes si None). Renvoie le nombre de slides retirées."""
    return len(retirer_posees(prs, vendredi_de, PREFIXE_MASQUE, jusqu_au, essai))


def _placer_apres(prs, ancre_el, nouveaux):
    """Déplace les p:sldId `nouveaux` juste après `ancre_el`, et les range dans
    la même section qu'elle (une slide hors section peut être « réparée » par
    PowerPoint)."""
    precedent = ancre_el
    for e in nouveaux:
        e.getparent().remove(e)
        precedent.addnext(e)
        precedent = e
    for sec in _sections(prs):
        for e in sec.findall("p14:sldId", NS):
            if e.get("id") == ancre_el.get("id"):
                precedent = e
                for n in nouveaux:
                    el = e.makeelement(f"{{{NS['p14']}}}sldId", {"id": n.get("id")})
                    precedent.addnext(el)
                    precedent = el
                return


# ---------- PDF : une page = une image ----------

def pages_pdf(octets, erreur=None):
    """Rend chaque page du PDF en JPEG. Renvoie [(jpeg, largeur, hauteur)].
    erreur : exception levée si le PDF est inutilisable (ConferenceImpossible par défaut)."""
    import pymupdf  # dépendance lourde : seulement si un PDF est déposé

    erreur = erreur or ConferenceImpossible
    try:
        doc = pymupdf.open(stream=octets, filetype="pdf")
    except Exception as e:  # noqa: BLE001
        raise erreur("PDF illisible") from e
    if doc.needs_pass:
        raise erreur("PDF protégé par mot de passe")
    if doc.page_count == 0:
        raise erreur("PDF sans page")
    if doc.page_count > PAGES_MAX:
        raise erreur(f"PDF trop long ({doc.page_count} pages, {PAGES_MAX} max)")
    pages = []
    for page in doc:
        # borné sur les deux côtés : une page très haute (ou très large) ne
        # doit pas produire une image géante qui ferait tomber tout le passage
        w, h = max(page.rect.width, 1), max(page.rect.height, 1)
        zoom = min(LARGEUR_IMAGE / w, LARGEUR_IMAGE / h, (PIXELS_MAX / (w * h)) ** 0.5)
        pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False)
        img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        sortie = io.BytesIO()
        img.save(sortie, "JPEG", quality=QUALITE, optimize=True)
        pages.append((sortie.getvalue(), img.width, img.height))
    return pages


def _layout_vide(prs):
    for layout in prs.slide_layouts:
        if layout.name == LAYOUT_VIDE:
            return layout
    return min(prs.slide_layouts, key=lambda l: len(l.placeholders))


def ajouter_images(prs, pages, noms, nom_image):
    """Une image par slide « Page vide », centrée et ajustée sans recadrage.
    pages : [(jpeg, largeur, hauteur)] ; noms : nom interne de chaque slide ;
    nom_image(i) : nom de la forme image. Renvoie les p:sldId créés (en fin de deck).
    À appeler avant toute recopie .pptx (prs.slides doit rester lisible)."""
    W, H = prs.slide_width, prs.slide_height
    layout = _layout_vide(prs)
    # python-pptx nomme la nouvelle partie « slide<nb de slides + 1>.xml » : après
    # un retrait au milieu du deck, ce nom peut déjà exister (deux entrées
    # identiques dans le zip, une slide écrasée). On renumérote d'abord.
    prs.part.rename_slide_parts([e.get(R_ID) for e in _sld_id_lst(prs)])
    nouveaux = []
    for i, ((jpeg, l, h), nom) in enumerate(zip(pages, noms), 1):
        s = prs.slides.add_slide(layout)
        for ph in list(s.placeholders):
            ph._element.getparent().remove(ph._element)
        ratio = min(W / l, H / h)
        lw, lh = int(l * ratio), int(h * ratio)
        pic = s.shapes.add_picture(io.BytesIO(jpeg), int((W - lw) / 2), int((H - lh) / 2), lw, lh)
        pic.name = nom_image(i)
        s._element.cSld.set("name", nom)
        nouveaux.append(_sld_id_lst(prs)[-1])
    return nouveaux


def _ajouter_images(prs, pages, vendredi):
    noms = [nom_slide(vendredi, i, len(pages)) for i in range(1, len(pages) + 1)]
    return ajouter_images(prs, pages, noms, lambda i: f"Conférence page {i}")


# ---------- PowerPoint : slides recopiées ----------

IGNORES = (RT.NOTES_SLIDE, RT.COMMENTS)


class _Copieur:
    """Recopie dans `cible` des parties d'un autre .pptx (slide, disposition,
    masque, thème, images, médias…) en gardant les rId de chaque partie."""

    def __init__(self, cible):
        self.cible = cible
        self.copies = {}
        self.noms = {str(p.partname) for p in cible.part.package.iter_parts()}

    def _nouveau_nom(self, nom):
        dossier, base = nom.rsplit("/", 1)
        m = re.match(r"^(.*?)(\d*)(\.[^.]+)$", base)
        prefixe, ext = (m.group(1), m.group(3)) if m else (base, "")
        n = 1
        while f"{dossier}/{prefixe}{n}{ext}" in self.noms:
            n += 1
        nom = f"{dossier}/{prefixe}{n}{ext}"
        self.noms.add(nom)
        return PackURI(nom)

    def copier(self, partie):
        if id(partie) in self.copies:
            return self.copies[id(partie)]
        neuve = Part(self._nouveau_nom(str(partie.partname)), partie.content_type, self.cible.part.package, partie.blob)
        self.copies[id(partie)] = neuve
        for rid, rel in partie.rels.items():
            if rel.reltype in IGNORES or rel.reltype.endswith("/comments"):
                continue
            if rel.is_external:
                cible = rel.target_ref
                mode = "External"
            else:
                cible = self.copier(rel.target_part)
                mode = "Internal"
            neuve.rels._rels[rid] = _Relationship(neuve.partname.baseURI, rid, rel.reltype, mode, cible)
        return neuve


def _xml(partie, modifier):
    racine = etree.fromstring(partie.blob)
    modifier(racine)
    partie.blob = etree.tostring(racine, xml_declaration=True, encoding="UTF-8", standalone=True)


def ouvrir_pptx(octets, erreur=None):
    """Ouvre un .pptx déposé et vérifie son nombre de slides. Renvoie la Presentation."""
    erreur = erreur or ConferenceImpossible
    try:
        source = Presentation(io.BytesIO(octets))
    except Exception as e:  # noqa: BLE001
        raise erreur("PowerPoint illisible") from e
    n = len(source.slides)
    if not n:
        raise erreur("PowerPoint sans slide")
    if n > PAGES_MAX:
        raise erreur(f"PowerPoint trop long ({n} slides, {PAGES_MAX} max)")
    return source


def _ajouter_pptx(prs, octets, vendredi):
    source = ouvrir_pptx(octets)
    n = len(source.slides)
    return recopier_pptx(prs, source, [nom_slide(vendredi, i, n) for i in range(1, n + 1)],
                         lambda i: f"{PREFIXE_MASQUE}{vendredi} (modèle {i})")


def recopier_pptx(prs, source, noms, nom_masque):
    """Recopie toutes les slides de `source` (Presentation) en fin de deck, avec
    leurs masques et dispositions. noms : nom interne de chaque slide ;
    nom_masque(i) : nom donné au i-ème masque recopié (1, 2…).
    Renvoie (p:sldId créés, avertissement). Peut être appelée plusieurs fois
    de suite ; après elle, prs.slides n'est plus lisible avant rechargement."""
    slides = list(source.slides)
    avertissement = ""
    if (source.slide_width, source.slide_height) != (prs.slide_width, prs.slide_height):
        avertissement = "format de slide différent du deck : vérifier la mise en page"
    copieur = _Copieur(prs)
    # les masques d'abord : chacun entraîne ses dispositions et son thème
    masques = []
    for s in slides:
        m = s.slide_layout.slide_master.part
        if id(m) not in copieur.copies:
            masques.append(copieur.copier(m))
    neuves = [copieur.copier(s.part) for s in slides]

    p = prs.part._element
    ids_masques = [int(e.get("id")) for e in p.findall("p:sldMasterIdLst/p:sldMasterId", NS)]
    for rel in prs.part.rels.values():
        if rel.reltype == RT.SLIDE_MASTER:
            ids_masques += [int(e.get("id")) for e in _racine(rel.target_part).findall("p:sldLayoutIdLst/p:sldLayoutId", NS)]
    prochain = max(ids_masques + [2147483647]) + 1
    lst_masques = p.find("p:sldMasterIdLst", NS)
    for i, m in enumerate(masques, 1):
        def renumeroter(racine, i=i):
            nonlocal prochain
            racine.find("p:cSld", NS).set("name", nom_masque(i))
            # identifiants uniques parmi tous les masques et dispositions du deck
            for e in racine.findall("p:sldLayoutIdLst/p:sldLayoutId", NS):
                e.set("id", str(prochain))
                prochain += 1
        _xml(m, renumeroter)
        el = etree.SubElement(lst_masques, f"{{{NS['p']}}}sldMasterId")
        el.set("id", str(prochain))
        el.set(R_ID, prs.part.relate_to(m, RT.SLIDE_MASTER))
        prochain += 1

    lst = _sld_id_lst(prs)
    prochain_slide = max([int(e.get("id")) for e in lst] + [255]) + 1
    nouveaux = []
    for i, partie in enumerate(neuves, 1):
        _xml(partie, lambda racine, nom=noms[i - 1]: racine.find("p:cSld", NS).set("name", nom))
        el = etree.SubElement(lst, f"{{{NS['p']}}}sldId")
        el.set("id", str(prochain_slide))
        el.set(R_ID, prs.part.relate_to(partie, RT.SLIDE))
        prochain_slide += 1
        nouveaux.append(el)
    return nouveaux, avertissement


# ---------- point d'entrée ----------

def inserer(chemin_source, chemin_sortie, vendredi, type_fichier, octets):
    """Remplace la conférence dans le deck : retire les slides de conférence
    déjà posées par ce module (vendredi <= celui-ci), puis insère les
    nouvelles juste après la slide « Membre à l'honneur ».

    Renvoie {"slides": n, "retirees": k, "avertissement": str}.
    Lève ConferenceImpossible (rien n'est écrit) si le fichier est illisible
    ou si la partie conférence est introuvable.
    """
    pages = pages_pdf(octets) if type_fichier == "pdf" else None
    prs = Presentation(chemin_source)
    retirees = retirer(prs, jusqu_au=vendredi)
    ancre = _ancre(prs)
    if ancre is None:
        raise ConferenceImpossible(f"partie conférence introuvable (aucune slide « {LAYOUT_ANCRE} »)")
    ancre_el = next(e for e, s in zip(_sld_id_lst(prs), prs.slides) if s.slide_id == ancre.slide_id)
    if pages is not None:
        nouveaux, avertissement = _ajouter_images(prs, pages, vendredi), ""
    elif type_fichier == "pptx":
        nouveaux, avertissement = _ajouter_pptx(prs, octets, vendredi)
    else:
        raise ConferenceImpossible(f"type de fichier inconnu : {type_fichier}")
    _placer_apres(prs, ancre_el, nouveaux)
    # après une recopie .pptx, prs.slides n'est plus lisible avant rechargement :
    # on enregistre directement
    prs.save(chemin_sortie)
    return {"slides": len(nouveaux), "retirees": retirees, "avertissement": avertissement}


def slides_de_conference(chemin_deck):
    """[(numéro, vendredi)] des slides de conférence posées par ce module."""
    prs = Presentation(chemin_deck)
    return [(i, vendredi_de(s)) for i, s in enumerate(prs.slides, 1) if est_conference(s)]

