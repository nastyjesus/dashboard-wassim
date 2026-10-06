# Brief Cowork — pages thématiques « sorties enfants » par ville

*7 octobre 2026. Pour : Claude Cowork (site WordPress papaparfait.fr). De : Claude Code (app + worker).*

## L'idée

Des pages qui répondent aux recherches des parents : « que faire à Rennes ce
week-end avec les enfants », « sortie avec un enfant de 2 ans à Nantes »,
« activité enfant quand il pleut à Bordeaux »…

Chaque page combine deux choses :

1. **Un texte durable, rédigé par toi.** Il porte le référencement : conseils,
   lieux phares, idées par saison.
2. **Un encart « Le top du moment »**, calculé par Papa Parfait et mis à jour
   tout seul. Il garde la page fraîche et mène vers l'app. WordPress l'insère
   **côté serveur** (shortcode) : Google le lit comme du texte normal.

Pourquoi : le concurrent rennais (rennesenfamille.fr) a ~40 pages de ce type,
mais pour une seule ville et rédigées à la main. Nous visons 5 villes, avec un
encart que personne n'a à tenir à jour.

## 1. Installer le shortcode (une fois)

Avec le plugin **Code Snippets** (ou le `functions.php` du thème enfant),
ajouter ce snippet PHP, type « Exécuter partout » :

```php
<?php
/**
 * Papa Parfait — encart « Le top du moment ».
 * Usage : [papaparfait_top ville="rennes" page="ce-week-end"]
 *         [papaparfait_top ville="rennes" page="ce-week-end" jour="dimanche"]
 * Le HTML vient du worker Papa Parfait, mis en cache 1 h dans WordPress.
 * Si le worker ne répond pas, l'encart disparaît : la page reste lisible.
 */
add_shortcode('papaparfait_top', function ($atts) {
    $a = shortcode_atts(['ville' => '', 'page' => '', 'jour' => ''], $atts, 'papaparfait_top');
    if ($a['ville'] === '' || $a['page'] === '') return '';
    $url = 'https://on-sort-poc.loumiwassim.workers.dev/encart?' . http_build_query(array_filter($a));
    $cle = 'pp_top_' . md5($url);
    $html = get_transient($cle);
    if ($html === false) {
        $r = wp_remote_get($url, ['timeout' => 8]);
        $code = is_wp_error($r) ? 0 : wp_remote_retrieve_response_code($r);
        $html = $code === 200 ? wp_remote_retrieve_body($r) : '';
        // Échec réseau : on réessaie dans 10 min plutôt que dans 1 h.
        set_transient($cle, $html, ($code === 200 || $code === 204) ? HOUR_IN_SECONDS : 10 * MINUTE_IN_SECONDS);
    }
    return wp_kses_post($html);
});
```

- L'adresse `on-sort-poc.loumiwassim.workers.dev` passera à
  `app.papaparfait.fr` avec le sous-domaine : **seule ligne à changer**,
  Claude Code préviendra.
- L'encart a un style minimal en ligne (cadre encre, bouton ambre) et des
  classes `pp-encart-*` que le thème peut habiller.
- Si un plugin de cache de page est actif, la page est servie depuis son
  cache : régler sa durée à **3 h au plus** sur ces pages, sinon l'encart
  vieillit.

## 2. Les pages

**Villes, dans l'ordre :** Rennes, Nantes, Bordeaux, Lille, Paris
(identifiants : `rennes`, `nantes`, `bordeaux`, `lille`, `paris`).

| Famille | Page (`page=`) | Requête visée (exemple Rennes) | Vague |
|---|---|---|---|
| Ce week-end | `ce-week-end` (+ un 2e shortcode `jour="dimanche"`) | que faire à Rennes ce week-end avec les enfants | 1 |
| Aujourd'hui | `aujourd-hui` | que faire aujourd'hui à Rennes avec les enfants | 1 |
| Situation | `quand-il-pleut` | activité enfant Rennes quand il pleut | 1 |
| Situation | `gratuit` | sortie gratuite enfant Rennes | 1 |
| Âge | `2-ans` | que faire avec un enfant de 2 ans à Rennes | 1 |
| Âge | `3-ans` | sortie enfant 3 ans Rennes | 1 |
| Saison | `vacances-toussaint` | vacances de la Toussaint Rennes enfants | 1 (en ligne avant le 17/10) |
| Saison | `halloween` | Halloween enfants Rennes | 1 (en ligne avant le 17/10) |
| Âge | `bebe` | sortie avec bébé Rennes | 2 |
| Âge | `1-an` | activité enfant 1 an Rennes | 2 |
| Âge | `4-5-ans` | sortie enfant 4 ans / 5 ans Rennes | 2 |
| Âge | `6-10-ans` | sortie enfant 6-10 ans Rennes | 2 |
| Situation | `apres-l-ecole` | activité enfant après l'école Rennes | 2 |
| Saison | `noel` | Noël enfants Rennes (spectacles, marchés) | 2 (en ligne avant le 15/11) |
| Saison | `carnaval` | carnaval enfants Rennes | 3 (en ligne avant le 15/01) |

**Vague 1 = 8 pages × 5 villes = 40 pages**, priorité Rennes. Mesurer dans
Search Console (skill `wassim-gsc-report` côté Claude Code) avant la vague 2.

Hors saison, l'encart des pages saisonnières renvoie **rien** (204) : le
shortcode n'affiche alors rien, la page garde son texte. Ne pas dépublier
une page saisonnière : elle reprend de la valeur l'année suivante.

### Gabarits

- **URL** : `https://papaparfait.fr/sorties-enfants/<ville>/<page>/`
  (ex. `/sorties-enfants/rennes/ce-week-end/`). Une page parente par ville
  (`/sorties-enfants/rennes/`) qui relie toutes ses pages.
- **Title** : « Que faire à Rennes ce week-end avec les enfants ? — Papa Parfait »
  (adapter la formule à la requête de chaque ligne ; 60 caractères max).
- **H1** : la question telle que le parent la tape.
- **Meta description** : promesse concrète + « mis à jour chaque jour ».
- **Données structurées** : `BreadcrumbList`. Pas d'`Event` : l'encart
  change trop souvent pour un balisage fiable.

### Le texte durable (ce qui fait ranker)

- **400 à 700 mots uniques par page.** Jamais le même texte d'une ville à
  l'autre en changeant le nom : Google le traiterait comme du contenu mince.
- Structure conseillée : une intro qui répond tout de suite (2-3 phrases),
  puis **l'encart**, puis 3-5 sous-parties (H2) : lieux incontournables, idées
  selon la météo ou l'âge, conseils pratiques (horaires de sieste, poussette,
  parkings, budget), et un mot sur l'app.
- **Lieux à citer** : voir `docs/papa-parfait/lieux-phares-seo.md`
  (151 lieux pour les 5 villes, avec ce qu'ils proposent aux enfants). Citer,
  décrire avec tes mots, faire un lien vers le site du lieu. Ne pas recopier
  les textes des lieux.
- **Pages par âge** : parler du développement de l'enfant à cet âge (ce qui
  l'amuse, ce qui le fatigue) — c'est ce qui les rend utiles et uniques.
- **Maillage** : chaque page renvoie vers la page parente de sa ville et vers
  2-3 pages sœurs (ex. « 2 ans » ↔ « 3 ans », « ce week-end » ↔ « quand il
  pleut »).

## Contrat entre nous

- Les identifiants de page (`page=`) et de ville sont fixés côté worker
  (`workers/on-sort/src/encart.js`). Une nouvelle page = demande à Claude Code.
- Les dates de saisons (Toussaint, Noël, carnaval) sont tenues côté worker,
  mises à jour chaque année.
- Le bouton de l'encart mène à l'app avec ville et âge préremplis : ces
  arrivées se mesurent dans `/mesures` (« arrivée par lien »).
