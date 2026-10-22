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
- Job `.github/workflows/bni-infomerciales-job.yml` : mercredi 18:05 UTC + manuel.
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
3. **Connecter OneDrive** : `python connexion_microsoft.py` (ID d'application,
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

## Comment une slide membre est reconnue

- Disposition `Infomerciale_30s` + nom renseigné dans la colonne de droite.
- Le membre est identifié par le `slide_id` interne : réordonner les slides ne casse rien.
- Photo : zone gauche (x 1,5 %, y 14 %, 75,2 × 83,6 %, reprise de l'espace réservé
  de la disposition), ajustée sans recadrage et centrée. L'ancienne photo de la
  zone est supprimée ; portrait et logo (colonne de droite) ne sont jamais touchés.
- Texte : espace réservé du bandeau du haut ; laissé tel quel si le champ est vide.
- Photo réduite à 1920 px, JPEG 85 (certaines photos du deck pèsent 25 Mo).

## Limites connues

- Une nouvelle slide membre n'apparaît qu'une fois son nom rempli dans le deck.
- Rendu final non vérifiable sans PowerPoint : contrôler le deck généré avant la réunion.
