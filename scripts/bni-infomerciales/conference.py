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
LARGEUR_IMAGE = 2400  # px, pages PDF
QUALITE = 88

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


# ---------- structure du deck ----------

def _sld_id_lst(prs):
    return prs.part._element.find("p:sldIdLst", NS)


def _sections(prs):
    """Listes de slides de chaque section (p14:sldIdLst), ou [] sans sections."""
    return prs.part._element.findall(".//p14:sectionLst/p14:section/p14:sldIdLst", NS)


def _ancre(prs):
    """Dernière slide « Membre à l'honneur » (hors slides de conférence)."""
    ancre = None
    for s in prs.slides:
        if s.slide_layout.name == LAYOUT_ANCRE and not est_conference(s):
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


def _masques_orphelins(prs):
    """Masques recopiés avec un .pptx que plus aucune slide n'utilise : retirés."""
    utilises = {id(s.slide_layout.slide_master.part) for s in prs.slides}
    lst = prs.part._element.find("p:sldMasterIdLst", NS)
    for e in list(lst):
        partie = prs.part.related_part(e.get(R_ID))
        nom = partie._element.cSld.get("name") or ""
        if nom.startswith(PREFIXE_MASQUE) and id(partie) not in utilises:
            lst.remove(e)
            prs.part.drop_rel(e.get(R_ID))


def retirer(prs, jusqu_au=None, essai=False):
    """Retire les slides de conférence posées par ce module dont le vendredi
    est <= jusqu_au (toutes si None). Renvoie le nombre de slides retirées."""
    a_retirer = []
    for e, s in zip(list(_sld_id_lst(prs)), list(prs.slides)):
        v = vendredi_de(s)
        if v is not None and (jusqu_au is None or v <= jusqu_au):
            a_retirer.append(e)
    if essai:
        return len(a_retirer)
    for e in a_retirer:
        _supprimer_slide(prs, e)
    if a_retirer:
        _masques_orphelins(prs)
    return len(a_retirer)


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

def pages_pdf(octets):
    """Rend chaque page du PDF en JPEG. Renvoie [(jpeg, largeur, hauteur)]."""
    import pymupdf  # dépendance lourde : seulement si un PDF est déposé

    try:
        doc = pymupdf.open(stream=octets, filetype="pdf")
    except Exception as e:  # noqa: BLE001
        raise ConferenceImpossible("PDF illisible") from e
    if doc.needs_pass:
        raise ConferenceImpossible("PDF protégé par mot de passe")
    if doc.page_count == 0:
        raise ConferenceImpossible("PDF sans page")
    if doc.page_count > PAGES_MAX:
        raise ConferenceImpossible(f"PDF trop long ({doc.page_count} pages, {PAGES_MAX} max)")
    pages = []
    for page in doc:
        zoom = LARGEUR_IMAGE / max(page.rect.width, 1)
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


def _ajouter_images(prs, pages, vendredi):
    W, H = prs.slide_width, prs.slide_height
    layout = _layout_vide(prs)
    nouveaux = []
    for i, (jpeg, l, h) in enumerate(pages, 1):
        s = prs.slides.add_slide(layout)
        for ph in list(s.placeholders):
            ph._element.getparent().remove(ph._element)
        ratio = min(W / l, H / h)
        lw, lh = int(l * ratio), int(h * ratio)
        pic = s.shapes.add_picture(io.BytesIO(jpeg), int((W - lw) / 2), int((H - lh) / 2), lw, lh)
        pic.name = f"Conférence page {i}"
        s._element.cSld.set("name", nom_slide(vendredi, i, len(pages)))
        nouveaux.append(_sld_id_lst(prs)[-1])
    return nouveaux


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


def _ajouter_pptx(prs, octets, vendredi):
    try:
        source = Presentation(io.BytesIO(octets))
    except Exception as e:  # noqa: BLE001
        raise ConferenceImpossible("PowerPoint illisible") from e
    slides = list(source.slides)
    if not slides:
        raise ConferenceImpossible("PowerPoint sans slide")
    if len(slides) > PAGES_MAX:
        raise ConferenceImpossible(f"PowerPoint trop long ({len(slides)} slides, {PAGES_MAX} max)")
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
            ids_masques += [int(x) for x in rel.target_part._element.xpath("./p:sldLayoutIdLst/p:sldLayoutId/@id")]
    prochain = max(ids_masques + [2147483647]) + 1
    lst_masques = p.find("p:sldMasterIdLst", NS)
    for i, m in enumerate(masques, 1):
        def renumeroter(racine, i=i):
            nonlocal prochain
            racine.find("p:cSld", NS).set("name", f"{PREFIXE_MASQUE}{vendredi} (modèle {i})")
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
        _xml(partie, lambda racine, i=i: racine.find("p:cSld", NS).set("name", nom_slide(vendredi, i, len(neuves))))
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

