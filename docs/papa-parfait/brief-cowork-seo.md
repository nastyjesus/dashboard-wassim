# Brief pour Claude Cowork — SEO & acquisition Papa Parfait

**Pour qui** : Claude Cowork, qui pilote le site WordPress de Papa Parfait
(contenu, SEO, acquisition). À lire en entier avant la première action.

**Qui écrit** : Claude Code, qui développe l'application et ses back-ends dans le
dépôt `dashboard-wassim` (branche `claude/side-hustle-brainstorm-ykikf8`).

**Arbitre unique** : Wassim Loumi. Aucun des deux côtés ne modifie le périmètre
de l'autre sans passer par lui.

---

## 1. Le produit en dix lignes

Papa Parfait est une application de sorties famille. Tu donnes une ville et
l'âge d'un enfant, elle rend les cinq meilleures sorties du jour, météo et
horaires compris. Public : les parents, pas les enfants.

- **L'app** : PWA en ligne sur `https://papa-parfait-web.loumiwassim.workers.dev`
  (Android via Play Store plus tard). Gratuite. Depuis le 23 septembre 2026,
  **aucun compte n'est demandé** pour voir des sorties : deux réglages (ville,
  âge) et le top s'affiche.
- **Le compte** (facultatif) sert uniquement à retrouver ses sorties gardées sur
  un autre appareil.
- **Les données** viennent d'agendas publics (OpenAgenda, DATAtourisme) + météo.
- **Monétisation** : achat intégré plus tard, jamais de publicité, jamais de
  revente de données. Le découpage gratuit/payant n'est pas tranché.
- **Le site WordPress** : `https://papaparfait.fr/` (hébergé chez o2switch). Il
  n'est pas dans le dépôt : Claude Code ne le voit pas, ne peut ni le lire ni le
  modifier. Tout ce qui se passe sur ce domaine est ton périmètre.

---

## 2. Le partage des rôles

| Domaine | Qui | Détail |
|---|---|---|
| Application (écrans, parcours, onboarding, favoris, comptes) | **Claude Code** | `apps/on-sort/` |
| Back-ends (sorties, tribu, hébergement PWA) | **Claude Code** | `workers/`, Cloudflare |
| Base de données et authentification | **Claude Code** | Supabase |
| Déploiement de l'app et de la PWA | **Claude Code** | GitHub Actions |
| Pages du site, contenu, maillage interne | **Claude Cowork** | WordPress |
| Balises title / meta / Hn, données structurées du site | **Claude Cowork** | WordPress |
| Blog, contenus d'acquisition, GEO (visibilité dans les IA) | **Claude Cowork** | WordPress |
| Search Console, analyses et rapports SEO | **Claude Code** | skills `wassim-seo-program`, `wassim-gsc-report` |
| Application des recommandations sur le site | **Claude Cowork** | WordPress |
| Textes marketing du site | **Claude Cowork** | — |
| Textes **dans l'app** (écrans, boutons, messages) | **Claude Code** | cohérence avec la charte |

**Zone commune, à ne jamais modifier seul** (voir §3) : les liens site → app, la
liste des villes ouvertes, les pages légales, la décision d'indexation.

---

## 3. Le contrat entre le site et l'app

### 3.1 Les liens vers l'app — paramètres garantis

Le site peut envoyer un visiteur **directement au résultat**, sans écran
intermédiaire :

```
https://papa-parfait-web.loumiwassim.workers.dev/?ville=<ville>&age=<0-5>
```

- `ville` accepte l'identifiant ou le nom (`rennes`, `saint-brieuc`, `Saint-Malo`).
- `age` va de 0 à 5. Absent ou invalide → 3 ans par défaut.
- `code=35` (code département) marche aussi, à défaut de ville.
- Sans paramètre, l'app demande les deux réglages elle-même. **Le lien nu reste
  toujours valable** : il ne casse jamais.

Ce format est stable. S'il doit changer, Claude Code prévient Wassim avant, et
les anciens liens continuent de fonctionner.

### 3.2 Les villes ouvertes — ne pas créer de page pour une ville fermée

Une page « sorties enfants à X » qui envoie vers une ville que l'app ne couvre
pas produit une page vide : mauvaise expérience, mauvais signal.

**Villes ouvertes au 24 septembre 2026** (18 villes, 8 départements) :

| Département | Villes (identifiant de lien) |
|---|---|
| 35 Ille-et-Vilaine | `rennes`, `bruz`, `stmalo`, `vitre` |
| 22 Côtes-d'Armor | `stbrieuc` |
| 56 Morbihan | `vannes`, `lorient` |
| 29 Finistère | `brest`, `quimper` |
| 44 Loire-Atlantique | `nantes`, `stnazaire` |
| 75 Paris | `paris` |
| 59 Nord | `lille`, `valenciennes`, `dunkerque` |
| 33 Gironde | `bordeaux`, `libourne`, `arcachon` |

Toutes ne se valent pas : l'Ille-et-Vilaine, Paris, le Nord, la Loire-Atlantique
et la Gironde ont beaucoup de matière ; les Côtes-d'Armor, le Finistère et le
Morbihan sont minces (parfois zéro sortie un jour de semaine). **Prioriser les
pages locales sur les zones denses.**

La liste bouge. Claude Code la met à jour dans ce fichier à chaque ouverture de
zone. Si une ville manque à ta stratégie, demande à Wassim : les ouvertures se
décident sur la matière réellement disponible, pas sur la demande SEO.

### 3.3 Les pages légales

La politique de confidentialité est **générée par le build de l'app** et servie
sur `https://papa-parfait-web.loumiwassim.workers.dev/confidentialite`. Source
unique : `apps/on-sort/docs/politique-confidentialite.md`.

→ Le site **lie** cette page, il n'en crée pas une deuxième version. Deux textes
juridiques divergents, c'est un risque réel, pas un détail SEO.

### 3.4 Ce que le site peut affirmer sans risque

Vrai aujourd'hui, vérifié dans le code : top 5 du jour, filtre par âge (0-5 ans),
rayon 40 km, météo prise en compte, sans compte, sans publicité, sans
géolocalisation, données d'agendas publics, PWA installable.

**Ne pas écrire** : une note ou un nombre d'utilisateurs, un nombre
d'événements, une disponibilité iOS ou Play Store (pas encore publiée), un
témoignage. Si un chiffre est nécessaire, le demander à Wassim — Claude Code le
sort du code ou des données réelles.

---

## 4. Les décisions déjà prises (24 septembre 2026)

1. **Le site est la seule vitrine indexée.** L'app est passée en
   `noindex, follow`, et un vrai `robots.txt` est servi à la racine (avant, le
   routage SPA renvoyait la page de l'app à `/robots.txt`). `/confidentialite`
   reste indexable : Google Play exige une URL publique.
   *Nuance technique à connaître* : le `robots.txt` **autorise** le parcours. Un
   `Disallow: /` empêcherait les robots de lire la balise `noindex`, et l'URL
   resterait dans l'index, sans titre ni description. On laisse crawler pour
   pouvoir désindexer.
   → Conséquence pour toi : plus aucune concurrence entre le domaine de l'app et
   le site. Toute la visibilité organique doit passer par le site.
2. **L'app passera sur `https://app.papaparfait.fr`**, en remplacement de
   `papa-parfait-web.loumiwassim.workers.dev`. Prérequis en cours : le DNS de
   `papaparfait.fr` est chez o2switch et doit passer chez Cloudflare pour que le
   sous-domaine pointe sur le worker (le site WordPress, lui, ne bouge pas :
   il reste servi par o2switch).
   → D'ici là, **ne pas diffuser l'URL `workers.dev`** dans des contenus
   durables : elle va changer. Utilise-la dans les CTA (elle fonctionne), Claude
   Code te signalera le jour de la bascule pour un remplacement en une passe.
3. **Le lien « Blog » est retiré du menu** tant qu'il n'y a pas d'articles. On le
   remet le jour où trois articles sont en ligne et où un rythme est tenu.
4. **Le reporting SEO reste chez Claude Code** (skills `wassim-seo-program` et
   `wassim-gsc-report`, connecteur Search Console déjà en place) : analyse,
   audits, rapports GSC. **Cowork exécute sur WordPress** : pages, contenus,
   balises, maillage. Une seule source d'analyse, pas de double travail.
   → Concrètement : tu reçois des recommandations priorisées, tu les appliques et
   tu confirmes ce qui est en ligne. Tu n'as pas à produire les rapports.

---

## 5. Premières tâches côté Cowork

Par ordre de valeur :

1. **Fermer les deux liens morts du menu** : retirer « Blog » (décision 4.3), et
   pointer « À propos » sur la page créée à l'étape 2. Cinq minutes.
2. **Créer la page « À propos »** (`/a-propos/`). Le contenu prêt à coller, les
   réglages et les données structurées sont dans
   `docs/papa-parfait/page-a-propos.md` du dépôt — Wassim te le transmettra. Les
   zones `[À COMPLÉTER]` (métier, bio, LinkedIn) sont à remplir par lui, pas à
   inventer.
3. **Passer les CTA vers l'app au format paramétré** quand la page a un contexte
   de ville (voir 3.1). Le CTA générique de la page d'accueil reste sans
   paramètre.
4. **Vérifier les fondamentaux du site** : title et meta uniques, Hn cohérents,
   sitemap soumis, données structurées, Search Console propre. Rapport à Wassim.
5. **Ensuite seulement**, les pages locales par ville, en commençant par les
   zones denses du tableau 3.2.

---

## 6. Règles de fonctionnement

**Claude Cowork ne fait jamais** :
- modifier le dépôt `dashboard-wassim`, l'app, les workers ou Supabase ;
- créer une deuxième politique de confidentialité ou de mentions légales ;
- publier une page locale pour une ville absente du tableau 3.2 ;
- annoncer une fonctionnalité qui n'existe pas encore (stores, alertes, piliers
  Couple / Moi / Tribu — ces trois-là sont en écran « bientôt ») ;
- inventer un chiffre.

**Claude Code ne fait jamais** :
- toucher au WordPress, au contenu, aux balises du site ;
- casser le format de lien du 3.1 sans prévenir ;
- fermer une ville ouverte sans le signaler.

**Comment demander quelque chose à l'autre côté** : par Wassim, en une phrase
qui dit *quoi* et *pourquoi*. Exemples :
- Cowork → Code : « J'ai besoin d'Angers ouvert pour une page locale » ;
  « Peux-tu ajouter un paramètre `date` au lien ? »
- Code → Cowork : « L'app couvre trois villes de plus depuis aujourd'hui » ;
  « Le texte de la politique a changé, la page liée bouge aussi. »

---

## 7. Ce que Claude Code doit encore livrer (et qui te concerne)

- **Un compteur d'usage de l'app** (ouvertures, top affiché, sortie gardée,
  compte créé). Tant qu'il n'existe pas, personne ne peut relier le trafic du
  site à un usage réel de l'app : ton reporting s'arrête à la porte de l'app.
- **Le passage sur `app.papaparfait.fr`** (§4.2) : il attend la bascule DNS de
  `papaparfait.fr` vers Cloudflare. Ensuite, config du worker, redirection depuis
  l'ancienne adresse, et signal à Cowork pour remplacer les CTA en une passe.
- **La mise à jour de ce fichier** à chaque ouverture de zone.

---

*Dernière mise à jour : 24 septembre 2026 — décisions d'indexation, de domaine,
de blog et de reporting arrêtées.*
