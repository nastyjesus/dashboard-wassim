# prospect — extraction et enrichissement de prospects locaux

Outil réutilisable : on lui donne des métiers et un périmètre géographique, il rend une liste d'entreprises qualifiées avec leurs coordonnées. Sources exclusivement publiques et gratuites, **aucune clé d'API**.

Il remplace les quinze scripts ad hoc de `data/prospection/`, dont il reprend toutes les règles durement acquises.

---

## Les trois étapes

```bash
# 1. Quel périmètre ?
python -m prospect communes --autour 35047 --rayon 10
python -m prospect metiers

# 2. Extraire depuis SIRENE
python -m prospect extract --metier osteopathe,paysagiste --commune 35047 --anciennete-min 2

# 3. Enrichir (téléphone, email, site)
python -m prospect enrich --source rpps,ameli,osm,site --cp 35170 --ville BRUZ --insee 35047

# 4. Qualifier et sortir
python -m prospect qualify --top 5 --depuis 35047
python -m prospect export --vers prospects.csv
python -m prospect etat
```

---

## Ce qui rend l'outil fiable

### Aucune valeur n'est jamais écrasée

Téléphone, email, site et métier réel ne sont pas des colonnes : ce sont des lignes de la table `valeur`, chacune avec **sa source et son niveau de confiance**. La valeur affichée est la plus fiable ; les concurrentes restent consultables.

```
manuel > registre > officiel > site_officiel > annuaire > web > deduit > incertain
```

Une correction manuelle gagne toujours. On peut relancer un enrichissement dix fois, ajouter une source, corriger à la main — rien ne se perd. C'est ce qui permet de reprendre un travail entamé sans tout recalculer.

### Le code NAF ne dit pas le métier

C'est l'erreur qui a coûté le plus cher. Le référentiel encode donc, par métier :

- les codes NAF,
- des règles de raffinement (regex sur la raison sociale),
- `mot_cle_obligatoire` pour les codes fourre-tout — sans mot-clé correspondant, la fiche est jetée,
- `autorite` : la source qui fait foi sur la profession réelle.

Exemples mesurés à Bruz :

| Code | Ce qu'il contient vraiment |
|---|---|
| `86.90F` | ostéopathes **et** psychologues, sophrologues, psychopraticiens |
| `69.10Z` | avocats **et** notaires, huissiers, juristes |
| `66.30Z` | surtout des holdings et des SCI, très peu de CGP |
| `82.11Z` | majoritairement des holdings, pas des secrétaires |
| `47.59A` | tout le commerce de meubles, literie comprise |

### Pour la santé, le registre fait foi

Quand un métier déclare `"autorite": "rpps"`, une déduction NAF ne suffit pas : `qualify` écarte toute fiche non confirmée par le registre, en indiquant le motif.

Mesure sur Bruz : sur **95 fiches** ramenées par les codes NAF « ostéopathe », **5 sont des ostéopathes**. Et sur les 18 ostéopathes réellement enregistrés dans la commune, 9 sont absents de SIRENE et 8 y sont immatriculés comme masseurs-kinésithérapeutes (double compétence).

### L'appariement repose sur la rareté, pas sur la longueur

`VALERIE`, `ISABELLE`, `ATELIER`, `AGENCEMENT` font tous plus de six lettres et n'identifient personne. Un patronyme rare, si.

Un mot n'autorise un appariement à lui seul que s'il est unique des deux côtés, fait au moins 4 caractères, **n'est pas un prénom**, et si le corpus dépasse 30 entités — en dessous, la rareté ne prouve rien. Sinon il faut deux mots communs, ou une adresse qui concorde.

Sans ces garde-fous : une ostéopathe héritait du téléphone d'une agence immobilière portant le même prénom, et un atelier de celui d'un restaurant qui partageait le mot « atelier ».

### Les emails scrapés sont filtrés

Quatre familles de faux positifs, toutes rencontrées :

| Trouvé | Réalité |
|---|---|
| `jean.dupont@gmail.com` | l'exemple du formulaire de contact |
| l'adresse d'une agence web | l'agence web créditée en pied de page |
| `contact@contact.fr` | artefact d'un `mailto:` malformé |
| une adresse nominative sur la fiche d'un autre praticien | l'adresse d'un confrère du même cabinet |

Le dernier cas n'est pas rejeté mais marqué `incertain` : l'adresse est valable comme contact de cabinet, jamais pour un « Bonjour » nominatif.

---

## Le processus de recherche de coordonnées

Il n'existe **aucune source générale, gratuite et sans carte bancaire** pour les coordonnées d'entreprises. Vérifié : Google Places exige une carte, Brave Search aussi (« anti-fraude », la carte n'est pas débitée mais reste obligatoire). Les registres ouverts ne couvrent que les professions réglementées. Le reste est un marché commercial — PagesJaunes verrouille ses numéros derrière un clic et l'interdit dans ses CGU.

Le processus fiable est donc en deux temps, et il assume cette limite au lieu de la contourner.

### Temps 1 — automatique, prouvable, rejouable

```bash
python -m prospect enrich --source apports,rpps,ameli,osm,domaine,site --cp 35170 --ville BRUZ --insee 35047
```

L'ordre compte : `apports` en premier pour que le travail humain prime, puis les registres, puis les annuaires, puis la devinette de domaine.

Rendement mesuré sur Bruz, 178 fiches : **40 % de téléphones, 27 % d'e-mails.** Le plafond est structurel — les artisans et les libéraux sans vitrine ne sont dans aucun fichier public.

### Relire ce que les règles ont écarté

```bash
python -m prospect arbitrer --metier cuisiniste
```

Un filtre par mot-clé protège des codes NAF trop larges — `47.59A` couvre tout
le commerce de meubles, literie comprise. Mais il juge sur le nom commercial,
qui ment souvent. À Bruz, sur 4 établissements en `47.59A` + `43.32C`, il a
gardé un cuisiniste au nom explicite, écarté à raison un fabricant de
rayonnage industriel et **à tort un vrai cuisiniste** immatriculé au nom de
son gérant.

Ces fiches ne sont plus jetées : elles sont enregistrées puis marquées d'un
motif, et `arbitrer` les ressort. Pour en repêcher une, on l'ajoute à
`apports.json` avec `"repecher": true` et une source — le jugement humain
prime sur la règle, mais il se justifie comme n'importe quel apport.

Corollaire appris au passage : **les mentions légales d'un site ne font pas
foi.** Celles de `pilcreation.fr` portent une autre société — PHIL CREATION,
SIREN 812993327, siège en Isère — et le téléphone de l'agence web. Un gabarit
jamais corrigé. Toujours recroiser avec SIRENE avant d'écrire une ligne.

### Temps 2 — manuel, tracé, permanent

```bash
python -m prospect manque --champ email --top 5 --depuis 35047
```

Sort la liste exacte de ce qui reste à chercher, **déjà priorisée par score de qualification** — pas 140 fiches, mais les meilleures de chaque métier. Une place BNI étant exclusive, chercher au-delà des cinq meilleurs par métier est du gâchis.

Ce qu'on trouve à la main se consigne dans **`apports.json`**, jamais dans un CSV :

```json
{
  "nom": "EXEMPLE PAYSAGES",
  "telephone": "06 00 00 00 00",
  "email": "contact@exemple.fr",
  "confiance": "manuel",
  "source": "annuaire professionnel ; site de l'entreprise"
}
```

Trois règles non négociables :

- **La source est obligatoire.** Un apport sans source est refusé au chargement. Une coordonnée dont on ne peut pas dire d'où elle vient n'a pas sa place dans un fichier de prospection — et le RGPD impose de pouvoir répondre à qui demande l'origine de ses données.
- **On ne devine jamais une adresse e-mail.** Un domaine se vérifie en lisant la page ; une adresse construite en `prenom.nom@` ne se vérifie pas, elle rebondit et abîme la réputation de l'expéditeur.
- **Les apports enrichissent, ils ne créent pas.** Une fiche écartée à l'extraction ne peut pas être rattrapée par un apport — il faut corriger la règle du référentiel. Constaté : `PIL CREATION`, cuisiniste réel, écarté parce que son nom ne contient pas « cuisin ».

C'est ce canal qui rend le processus *fiable* : le travail manuel n'est plus un patch jetable, il est rejoué à chaque reconstruction de la base et survit à tout.

---

## BODACC : le mouvement, pas l'état

SIRENE décrit un **état**, souvent en retard. Le BODACC publie les **événements**, au jour le jour. C'est la différence qui compte pour prospecter.

```bash
# Purge : croise la base avec les liquidations et radiations
python -m prospect enrich --source bodacc --ville Bruz

# Veille : qui vient de s'installer dans la commune
python -m prospect veille --ville Bruz --depuis 2026-06-01
python -m prospect veille --ville Bruz --familles vente,radiation
```

**Purger.** Une entreprise liquidée reste « active » dans SIRENE pendant des mois. Trois cas sur 178 à Bruz, trouvés un par un à la main avant d'avoir cette source. Le BODACC les sort automatiquement, et pose l'exclusion avec sa date et le lien vers l'annonce.

Il révèle aussi les **cessions** : `INTER'IN BRUZ` a changé de mains le 24/04/2026 — ce qui explique qu'aucune coordonnée ne soit trouvable. Le dirigeant connu n'est plus le bon interlocuteur.

**Veiller.** 157 créations à Bruz sur douze mois. Une entreprise qui vient de se créer n'est encore dans aucun annuaire, mais c'est le meilleur moment pour l'approcher — et pour un chapitre BNI, une place vacante se pourvoit souvent avec quelqu'un qui démarre.

Un piège d'API à connaître : le filtre `dateparution >= date"..."` avec des guillemets **doubles** renvoie zéro résultat **sans lever d'erreur**. Utiliser `dateparution >= "..."`.

---

## Les sources

| Source | Apporte | Couvre |
|---|---|---|
| **SIRENE** (recherche-entreprises) | identité, adresse, dirigeants, ancienneté, effectif | toutes les entreprises immatriculées |
| **RPPS** (ANS) | profession réelle, téléphone, **email** | tous les professionnels de santé enregistrés, ostéopathes compris |
| **Ameli** (CNAM) | profession, téléphone | professionnels de santé **conventionnés** uniquement |
| **OpenStreetMap** | téléphone, email, site | commerces avec vitrine ; faible sur les activités à domicile |
| **Site du prospect** | email | ceux dont on connaît déjà le site |

Deux pièges d'API encodés dans `sources.py` :

- `etat_administratif=A` filtre l'**entreprise**, pas l'établissement. Une société active traîne des établissements fermés — on refiltre au niveau établissement.
- La pagination SIRENE est coupée vers 1 500 résultats. Au-delà, la requête est découpée commune par commune.

Et un piège d'encodage : le fichier RPPS est en **UTF-8**. Le lire en cp1252 transforme `Ostéopathe` en `ostaopathe` et fait échouer silencieusement toutes les comparaisons. Tous les rapprochements passent donc par `matching.cle()`, qui compare en ASCII sans accents.

---

## Ajouter un métier

Éditer `referentiel.json`, sans toucher au code :

```json
"opticien": {
  "libelle": "Opticien",
  "naf": ["47.78A"],
  "mot_cle_obligatoire": false,
  "raffiner": [["optic|lunett", "Opticien"]],
  "autorite": null,
  "note": "Pourquoi ce choix de codes — utile au prochain qui relira."
}
```

Toujours renseigner `note` quand un code NAF est trompeur. C'est ce champ qui évite de refaire l'erreur.

---

## Fichiers

| Fichier | Rôle |
|---|---|
| `referentiel.json` | métiers → NAF + règles. **Le seul fichier à éditer au quotidien.** |
| `store.py` | base SQLite, provenance et confiance par champ |
| `matching.py` | rapprochement de noms, nettoyage des emails, distances |
| `sources.py` | accès aux cinq sources, avec leurs pièges documentés |
| `pipeline.py` | extract / enrich / qualify / export |
| `cli.py` | ligne de commande |
| `prospection.db` | la base — **non versionnée** |
| `cache/` | fichiers sources téléchargés — **non versionné** |

---

## Données personnelles

La base contient des noms de dirigeants, des téléphones et des emails de personnes physiques. `prospection.db` et `cache/` sont dans `.gitignore` : ne pas les committer, ne pas les publier.

Les emails issus du RPPS proviennent d'un registre publié pour l'interopérabilité des soins. Les réutiliser pour de la prospection est un changement de finalité : licite en B2B quand le message concerne l'activité professionnelle du destinataire, à condition de pouvoir citer la source sur demande et de traiter toute opposition sans délai. La colonne source le trace fiche par fiche.
