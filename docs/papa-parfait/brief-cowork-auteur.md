# Brief Cowork — 12 octobre 2026 : auteur réel sur les pages + une phrase à corriger

**Pour :** Claude Cowork, qui pilote le site WordPress `https://papaparfait.fr/`.
**De :** Claude Code, qui développe l'app Papa Parfait et son worker.
**Arbitre :** Wassim Loumi.

Ce brief se lit en entier avant la première action. Les briefs précédents
(SEO du 24 septembre, pages SEO et 7 octobre) restent valables.

---

## 1. Pourquoi

Google cible les contenus produits en volume. Le site compte **87 pages**
(sitemap relevé le 12/10/2026) et aucune ne nomme d'auteur, sauf `/a-propos/`.
Une personne réelle, identifiable et cohérente d'une page à l'autre, c'est le
signal qui manque.

**Décision de Wassim :** chaque page de contenu est signée
« Wassim Loumi, fondateur de Papa Parfait ».

## 2. Pages concernées

| Type | URL | Nombre (12/10) |
|---|---|---|
| Ville | `/sorties-enfants/<ville>/` | 9 (hors hub) |
| Facette | `/sorties-enfants/<ville>/<facette>/` | 70 |
| Pilier | `/activites-pere-enfant/` | 1 |
| Famille | `/sorties-en-famille/` et ses sous-pages | 3 |

Pas concernées : accueil, `/a-propos/` (elle reçoit seulement l'`@id`, voir
§ 4), `/proposer-une-sortie/`, hub `/sorties-enfants/`.

**Ne pas toucher** : title, H1, meta description. La signature s'ajoute, rien
ne se réécrit.

## 3. Signature visible

En fin de contenu rédigé (après le dernier paragraphe, avant le pied de page),
sur chaque page du § 2 :

```html
<p class="pp-auteur">Par <a href="/a-propos/" rel="author">Wassim Loumi</a>, fondateur de Papa Parfait</p>
```

Si le champ « relu le » (§ 5) est rempli, ajouter **dans le même paragraphe** :

```html
<p class="pp-auteur">Par <a href="/a-propos/" rel="author">Wassim Loumi</a>, fondateur de Papa Parfait · Relu le <time datetime="2026-10-12">12/10/2026</time></p>
```

Champ vide : aucune date, aucun « Relu le ». Jamais de date par défaut (ni date
de publication, ni date du jour).

Style : celui du texte courant, taille un cran en dessous. Pas d'encadré.

## 4. Données structurées (JSON-LD)

### Le nœud Person, identique partout

```json
{
  "@type": "Person",
  "@id": "https://papaparfait.fr/a-propos/#wassim",
  "name": "Wassim Loumi",
  "jobTitle": "Fondateur de Papa Parfait",
  "url": "https://papaparfait.fr/a-propos/"
}
```

Même `@id` sur toutes les pages : Google relie ainsi chaque page à la même
personne.

### `/a-propos/`

Le graphe actuel décrit déjà Wassim comme `founder` de l'Organization, mais sans
`@id`. À faire :

1. Ajouter le nœud Person ci-dessus au `@graph`.
2. Dans l'Organization, remplacer `"founder": {"@type":"Person","name":"Wassim Loumi"}`
   par `"founder": {"@id": "https://papaparfait.fr/a-propos/#wassim"}`.
3. Le reste ne bouge pas (AboutPage, WebSite, Organization).

### Pages ville, facette et famille

Aujourd'hui elles n'ont qu'un BreadcrumbList. **Le garder tel quel** et ajouter
un graphe :

```json
{
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Person", "@id": "https://papaparfait.fr/a-propos/#wassim", "name": "Wassim Loumi", "jobTitle": "Fondateur de Papa Parfait", "url": "https://papaparfait.fr/a-propos/" },
    {
      "@type": "WebPage",
      "@id": "<URL de la page>#webpage",
      "url": "<URL de la page>",
      "name": "<title de la page>",
      "inLanguage": "fr-FR",
      "isPartOf": { "@id": "https://papaparfait.fr/#website" },
      "author": { "@id": "https://papaparfait.fr/a-propos/#wassim" },
      "publisher": { "@id": "https://papaparfait.fr/#organization" },
      "datePublished": "<date de publication WordPress, ISO 8601>",
      "dateModified": "<date de modification WordPress, ISO 8601>"
    }
  ]
}
```

Si les nœuds Organization et WebSite ne sont pas déjà dans la page, les
inclure dans ce graphe (copie de ceux de `/a-propos/`), sinon les `@id`
pointent dans le vide.

### `/activites-pere-enfant/`

Dans l'Article existant :

- `author` passe de `{"@id": ".../#organization"}` à
  `{"@id": "https://papaparfait.fr/a-propos/#wassim"}` ;
- `publisher` reste l'Organization ;
- ajouter le nœud Person au `@graph` ;
- FAQPage et BreadcrumbList inchangés.

### « Relu le » dans le schéma

Seulement si le champ du § 5 est rempli :

- pages WebPage : ajouter au nœud WebPage
  `"lastReviewed": "AAAA-MM-JJ"` et
  `"reviewedBy": {"@id": "https://papaparfait.fr/a-propos/#wassim"}` ;
- `/activites-pere-enfant/` : `lastReviewed` n'existe pas sur Article. Passer
  `mainEntityOfPage` de l'URL simple à un nœud
  `{"@type": "WebPage", "@id": "https://papaparfait.fr/activites-pere-enfant/#webpage", "url": "https://papaparfait.fr/activites-pere-enfant/", "lastReviewed": "AAAA-MM-JJ", "reviewedBy": {"@id": "https://papaparfait.fr/a-propos/#wassim"}}`.

Champ vide : ni `lastReviewed` ni `reviewedBy`. Ne pas recopier `dateModified`
à leur place.

## 5. Le champ « relu le »

- Une méta de page (custom field), clé suggérée **`pp_relu_le`**, format
  `AAAA-MM-JJ`, **vide par défaut** sur les 87 pages.
- Seul Wassim la remplit, après avoir réellement relu la page.
- Affichage `JJ/MM/AAAA` (§ 3), valeur brute `AAAA-MM-JJ` dans `datetime` et
  dans `lastReviewed`.
- Valeur absente, vide ou mal formée : on n'affiche rien.

Si les pages viennent d'un snippet ou d'un modèle commun, voici la logique à y
brancher (adapter aux noms de ton code) :

```php
<?php
/** Date « relu le » d'une page, ou null si absente ou mal formée. */
function pp_relu_le($post_id) {
    $v = trim((string) get_post_meta($post_id, 'pp_relu_le', true));
    $d = DateTime::createFromFormat('!Y-m-d', $v);
    return ($d && $d->format('Y-m-d') === $v) ? $d : null;
}

/** Signature visible en fin de contenu. */
function pp_signature_html($post_id) {
    $html = 'Par <a href="/a-propos/" rel="author">Wassim Loumi</a>, fondateur de Papa Parfait';
    $relu = pp_relu_le($post_id);
    if ($relu) {
        $html .= ' · Relu le <time datetime="' . $relu->format('Y-m-d') . '">' . $relu->format('d/m/Y') . '</time>';
    }
    return '<p class="pp-auteur">' . $html . '</p>';
}

/** Champs « relu le » à fusionner dans le nœud WebPage ; tableau vide si non relu. */
function pp_schema_relu($post_id) {
    $relu = pp_relu_le($post_id);
    return $relu ? [
        'lastReviewed' => $relu->format('Y-m-d'),
        'reviewedBy'   => ['@id' => 'https://papaparfait.fr/a-propos/#wassim'],
    ] : [];
}
```

## 6. Une phrase à corriger

### À corriger maintenant

`/sorties-enfants/lille/bebe/` — remplacer :

> Ses cinq idées du jour suivent.

par :

> Voici les idées du moment à Lille avec un bébé.

C'est la seule page qui porte cette tournure exacte (« … suivent. ») sur les 87.

### Occurrences voisines, à signaler à Wassim (pas de correction sans son accord)

Relevé sur les 87 pages en ligne le 12/10/2026 :

| Page | Phrase | Problème |
|---|---|---|
| `/sorties-enfants/lille/noel/` | « Voici d'abord les cinq idées du jour. » | **L'encart est vide** (0 sortie) au 12/10 : la phrase annonce une liste absente. Le plus urgent des trois. |
| `/sorties-enfants/lille/1-an/` | « Les cinq idées du jour, réglées sur son âge, sont juste en dessous. » | Encart présent (5 sorties), mais « cinq » est figé alors que l'encart peut en montrer moins. |
| `/sorties-enfants/` | « Les pages détaillées suivent. » | Suivie d'une vraie liste de villes : correct, rien à faire. |

Si le contenu de ces pages sort d'un modèle ou d'un générateur de ton côté,
chercher-y « suivent », « Voici d'abord » et « juste en dessous », et
signaler toute autre occurrence à Wassim.

Les nombreuses mentions « l'app propose cinq idées » décrivent l'app, pas
l'encart : elles restent.

## 7. Vérification avant de rendre la main

Sur au moins une page de chaque type (ville, facette, pilier, famille) et
sur `/a-propos/` :

- [ ] La signature est visible en fin de contenu et le lien mène à `/a-propos/`.
- [ ] Le nœud Person avec l'`@id` `https://papaparfait.fr/a-propos/#wassim`
      est présent dans le JSON-LD.
- [ ] Test des résultats enrichis (https://search.google.com/test/rich-results)
      sans erreur, BreadcrumbList toujours détecté. Pour WebPage et Person,
      Google ne montre pas d'aperçu : valider aussi sur https://validator.schema.org/.
- [ ] Aucun « Relu le » ni `lastReviewed` sur une page dont le champ est vide
      (contrôler en remplissant le champ sur une page de test, puis en le
      vidant).
- [ ] `/sorties-enfants/lille/bebe/` ne contient plus « Ses cinq idées du jour
      suivent. »
- [ ] Title, H1 et meta description identiques à avant (comparer sur
      l'échantillon).
- [ ] Vider le cache de page après modification.

Rendre compte à Wassim : pages modifiées, résultat des tests, réponse sur les
occurrences du § 6.
