# Infomerciales BNI Bruz Envol — dépôt des photos

Les membres déposent leur photo de la semaine (+ « Qui peut m'aider à
rencontrer ») sur une page web ; le module la pose sur leur slide du support
de réunion. Plus personne n'édite le .pptx à la main.

## En ligne

```
membre (lien perso) ──► worker bni-infomerciales (KV) ◄──► job GitHub Actions ──► OneDrive (Graph)
                         workers/bni-infomerciales          job.py + deck.py
```

- Page membre : `https://bni-infomerciales.loumiwassim.workers.dev/?m=<lien perso>`
- Admin : `/admin` (jeton `BNI_ADMIN_TOKEN` du `.env` local, ou `WASSIM_AUTH_TOKEN`) : statuts, liens perso, « Appliquer maintenant ».
- Job `.github/workflows/bni-infomerciales-job.yml` : mercredi 18:05 UTC + manuel ;
  nettoyage du samedi : `bni-infomerciales-nettoyage.yml` (voir plus bas).
  Ce fichier doit être sur `main` (cron et dispatch ne lisent que la branche par
  défaut) ; il prend le code sur la branche de travail.
- Le deck n'est renvoyé que s'il n'a pas changé depuis son téléchargement
  (If-Match sur l'eTag) ; sinon le job recommence (3 essais). OneDrive garde
  l'historique des versions.
- Dépôt GitHub public : le job n'affiche que des compteurs.

### Mise en route (une fois)

1. **Inscription d'application Microsoft** — portal.azure.com › Inscriptions
   d'applications › Nouvelle inscription : « Comptes Microsoft personnels
   uniquement », sans URI de redirection. Puis Authentification › « Autoriser
   les flux de clients publics » = Oui. Noter l'ID d'application (client).
2. **Déployer le worker** : push sur la branche de travail (workflow
   `deploy-bni-infomerciales-worker.yml`).
3. **Connecter OneDrive** : `python connexion_microsoft.py` (via rclone, gratuit, sans Azure ;
   `--azure` pour une inscription d'app : ID d'application,
   lien de partage du deck, jeton admin) puis saisir le code affiché.
4. **Lancer le job une fois** (GitHub › Actions › BNI infomerciales › Run) :
   il lit le deck et crée les liens perso.
5. Admin › « Copier tous les liens » → envoyer à chaque membre son lien.
6. Optionnel, bouton « Appliquer maintenant » : jeton GitHub fin (dépôt
   dashboard-wassim, permission Actions : écriture) dans le secret de dépôt
   `BNI_GH_DISPATCH_TOKEN`, puis redéployer le worker.

Si la connexion Microsoft expire (jeton inutilisé ~90 jours), l'admin affiche
l'échec : relancer `connexion_microsoft.py`.

## Lancer (local, sans OneDrive)

```bash
pip install -r requirements.txt
python server.py
```

- Membres : http://127.0.0.1:8787
- Admin : http://127.0.0.1:8787/admin

Le deck source se place dans `data/deck-source.pptx` (téléchargé depuis
OneDrive : Fichier › Créer une copie › Télécharger une copie). `data/` n'est
jamais versionné (photos des membres).

## Cycle de la semaine

1. Les membres déposent avant **mercredi 19h** (limite affichée slide 24 du deck).
2. Admin › « Générer le deck à jour » → `data/sortie/BNI-support-<date>.pptx`.
3. Les dépôts appliqués partent dans `data/archives/<date>/`.

## Nettoyage du samedi matin

Après la réunion du vendredi, le workflow `bni-infomerciales-nettoyage.yml`
(`python job.py nettoyage`, code dans `nettoyage.py` + `deck.nettoyer`) vide
chaque slide membre reconnue : photo de la semaine retirée (l'espace réservé
« Infomerciale » de la disposition revient, vide) et bandeau « Qui peut m'aider
à rencontrer » vidé (le texte d'invite réapparaît dans PowerPoint, rien en
diaporama). Nom, métier, portrait, logo et autres formes ne sont pas touchés ;
les slides non reconnues (disposition membre sans nom) sont laissées et comptées.

- **Créneaux** : samedi 07:00, 10:00, 14:00 heure de Paris (crons UTC
  `0 5,6,9,13 * * 6`, le script ignore un passage avant 07:00 Paris). Le worker
  mémorise la semaine nettoyée (`nettoyage:<lundi>`) : les créneaux suivants ne
  font rien. Deck ouvert/verrouillé (409/423) : 5 essais espacés, puis créneau
  suivant.
- **Coupure** : vendredi 12:00 Paris (constante dans `workers/.../src/nettoyage.js`).
  Un dépôt plus récent vise la semaine suivante : il reste en attente, et s'il
  est déjà posé sur la slide, cette slide n'est pas vidée. Les dépôts jamais
  posés d'avant la coupure sont purgés ; les statuts « posé »
  (`applique:<id>`, `photo_appliquee:<id>`) de la semaine écoulée sont remis à
  zéro. Le suivi `envois:<lundi>` est gardé.
- **Sauvegarde** : l'historique des versions OneDrive (Fichier > Infos >
  Historique des versions) ; le nettoyage ne tourne que s'il répond. La copie
  datée du deck est désactivée (`COPIE_DATEE`) : OneDrive perso la refuse par
  l'API (notSupported / quotaLimitReached, constaté le 22/11/2026).
- **Manuel** (GitHub › Actions › « BNI infomerciales — nettoyage du samedi ») :
  `essai` (défaut) liste les slides qui seraient vidées sans rien écrire ;
  `forcer` nettoie tout de suite, même hors créneau ou déjà fait. En local :
  `python job.py nettoyage --essai`.
- L'admin affiche la date et le résultat du dernier nettoyage.

## Comment une slide membre est reconnue

- Disposition `Infomerciale_30s` + nom renseigné dans la colonne de droite.
- Le membre est identifié par le `slide_id` interne : réordonner les slides ne casse rien.
- Photo : zone gauche (x 1,5 %, y 14 %, 75,2 × 83,6 %, reprise de l'espace réservé
  de la disposition), ajustée sans recadrage et centrée. L'ancienne photo de la
  zone est supprimée ; portrait et logo (colonne de droite) ne sont jamais touchés.
- Texte : espace réservé du bandeau du haut ; laissé tel quel si le champ est vide.
- Photo réduite à 1920 px, JPEG 85 (certaines photos du deck pèsent 25 Mo).

## Conférence de la semaine

Parcours : secrétaire trésorier → conférencier → slides sur le deck.

1. **Admin › Secrétaire trésorier** : Wassim désigne le membre pour un mandat
   (fin proposée : prochain 30 mars / 30 septembre). L'email vient de la liste
   des rappels (ou saisi). Historique des mandats avec leurs emails. Un nouveau
   mandat invalide le lien de l'ancien.
2. **Mails au secrétaire** (`rappels.gs`) : vendredi 14h (toujours) et lundi 9h
   (seulement si personne n'est désigné), avec son lien `/secretaire?s=…`.
3. **Page secrétaire** : liste de tous les membres, pour la prochaine réunion
   (le vendredi de la semaine jusqu'à vendredi 12h, puis le suivant). Note :
   conférence de sphère → un seul membre de la sphère. L'admin peut aussi
   désigner à sa place.
4. **Mail au conférencier** (relevé toutes les 15 min par `notificationsConference`) :
   cadeau, slides avant mercredi 19h, 1 à 3 contacts spécifiques, lien
   `/conference?c=…`. Relance mercredi 14h s'il n'a rien déposé. Accord
   « le conférencier / la conférencière » réglé dans Admin › Accord des mails ;
   sans réglage, tournure neutre (« c'est toi qui fais la conférence »), jamais
   d'écriture inclusive.
5. **Page conférencier** : un fichier .pptx ou .pdf (80 Mo max, envoyé par
   morceaux de 8 Mio : le KV limite une valeur à 25 Mio) + 1 à 3 contacts, puis
   « Valider ». Les contacts ne sont jamais renvoyés par les pages publiques ni
   au job : seulement l'admin et le mail à Wassim.
6. **Mail à Wassim** à chaque validation, à l'adresse du compte Gmail qui
   exécute le script (`Session.getEffectiveUser()`), avec les demandes spécifiques.
7. **Pose** (`conference.py`, mêmes passages que les infomerciales) : juste
   après la dernière slide de disposition « Membre à l'honneur » (début de la
   partie conférence, dans sa section). PDF : une page = une image plein cadre
   sur une slide « Page vide ». PowerPoint : slides recopiées avec leur propre
   masque et dispositions (notes de l'orateur non reprises). Chaque slide posée
   s'appelle en interne « Conférence du AAAA-MM-JJ (i/n) » : un nouveau dépôt
   remplace la conférence déjà posée. Les slides posées à la main (sans ce nom)
   ne sont jamais touchées. Une conférence impossible à poser n'empêche pas les
   infomerciales : l'erreur s'affiche dans l'admin, le passage suivant réessaie.
8. **Nettoyage du samedi** : retire les slides de la conférence de la réunion
   passée (et le masque recopié), garde celles d'une réunion à venir, puis
   efface le fichier déposé du KV (la fiche reste dans l'admin).

## Réseaux sociaux de la semaine

Parcours : responsable réseaux sociaux → fichiers → slides sur le deck.

1. **Admin › Réseaux sociaux** : Wassim désigne le responsable (sans date de
   fin, jusqu'à remplacement ; historique gardé ; un nouveau responsable
   invalide le lien de l'ancien).
2. **Mails** (`rappels.gs`, textes fournis par le worker) : mercredi 9h
   (invitation à déposer), jeudi 9h (relance seulement si rien n'est validé).
3. **Page `/reseaux?r=…`** : 1 à 10 fichiers .pptx, .pdf, .jpg, .png (type
   vérifié par signature, 80 Mo au total, envoi par morceaux de 8 Mio), pour
   la réunion du vendredi ; limite jeudi 12h heure de Paris. « Valider »
   remplace tout le dépôt précédent de la semaine.
4. **Pose** (`reseaux.py`, mêmes passages que les infomerciales, après elles
   et après la conférence) : juste après la slide repère « RÉSEAUX SOCIAUX »,
   dans sa section, dans l'ordre des fichiers puis des pages.
   - Repère : `slide_id` 3854 ; à défaut, l'unique slide non système dont un
     texte (majuscules, sans accents) commence par « RESEAUX SOCIAUX ». Aucune
     ou plusieurs : « repère Réseaux sociaux introuvable », rien n'est posé.
   - Image : une slide « Page vide », image centrée sans recadrage (2400 px
     max, JPEG 88, transparence sur blanc, orientation EXIF respectée).
   - PDF : une page = une image. PowerPoint : slides recopiées avec leur
     masque (« Réseaux sociaux du AAAA-MM-JJ (modèle i) »), retiré quand plus
     aucune slide ne l'utilise.
   - Chaque slide posée s'appelle en interne « Réseaux sociaux du AAAA-MM-JJ
     (i/n) » : un nouveau dépôt retire d'abord les slides réseaux de ce
     vendredi ou d'avant. Les slides sans ce nom ne sont jamais touchées.
   - Une erreur (fichier illisible, repère introuvable) ne bloque ni les
     infomerciales ni la conférence : elle s'affiche dans l'admin
     (`reseaux` dans `/api/job/resultat`), le passage suivant réessaie.
5. **Nettoyage du samedi** : retire les slides réseaux d'un vendredi <=
   `reseaux_jusqu_au` (plan du worker), puis le worker efface les fichiers du
   KV (compteur `reseaux` dans le POST). Retrait unique
   (`reseaux_retrait_unique`, seulement la semaine du 2026-11-23, ignoré par le
   job après le 2026-11-29) des 2 slides posées à la main : seulement si la
   slide n'a pas de nom système, est en « Page vide » et suit la repère sans
   interruption (au besoin après des slides réseaux) ; sinon elle reste et le
   rapport le dit. `python job.py nettoyage --essai` liste ce qui serait retiré.

## Limites connues

- Une nouvelle slide membre n'apparaît qu'une fois son nom rempli dans le deck.
- Rendu final non vérifiable sans PowerPoint : contrôler le deck généré avant la réunion.
