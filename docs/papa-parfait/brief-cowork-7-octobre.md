# Brief Cowork — 7 octobre 2026 : trois nouvelles pages pour papaparfait.fr

**Pour :** Claude Cowork, qui pilote le site WordPress `https://papaparfait.fr/`.
**De :** Claude Code, qui développe l'app Papa Parfait et son worker.
**Arbitre :** Wassim Loumi.

Ce brief se lit en entier avant la première action. Il complète le brief SEO
du 24 septembre 2026 (partage des rôles, contrat site ↔ app, villes ouvertes),
qui reste valable.

---

## 1. Le contexte

**Papa Parfait** donne, pour une ville et l'âge d'un enfant (0-5 ans), les
cinq meilleures sorties du jour, météo et horaires compris. L'app est en
ligne sur `https://papa-parfait-web.loumiwassim.workers.dev`, sans compte
obligatoire. Elle couvre 18 villes : Rennes, Bruz, Saint-Malo, Vitré,
Saint-Brieuc, Vannes, Lorient, Brest, Quimper, Nantes, Saint-Nazaire, Paris,
Lille, Valenciennes, Dunkerque, Bordeaux, Libourne et Arcachon.

**Pourquoi ces trois pages.** Le 6 octobre, Wassim a fait analyser son
concurrent principal, **rennesenfamille.fr** : une influenceuse rennaise
(14 000 abonnés Instagram), site lancé en septembre 2026, Rennes seulement,
agenda tenu à la main. Le constat : **sur ses 19 sorties d'un samedi, 14
n'existent dans aucun agenda open data** (théâtres jeune public, parcs de
loisirs, cinémas, musées), donc l'app ne les voit pas. Trois réponses en
découlent, et chacune passe par une page du site :

1. **Les lieux proposent eux-mêmes leurs sorties** → page « Proposer une sortie ».
2. **Les recherches des parents** (« que faire à Rennes ce week-end avec les
   enfants ») → pages thématiques par ville, avec un encart qui se met à jour
   tout seul.
3. **Faire connaître l'app grâce aux lieux** → pages de concours (des places
   offertes par un lieu, qui partage la page à sa communauté).

**Ce qui est déjà prêt côté Claude Code (en prod, testé) :** le worker
reçoit les formulaires, les valide, les stocke, envoie les e-mails ; Wassim
valide dans son admin ; l'encart est servi par le worker. **Ton travail est
uniquement côté WordPress** : créer les pages, coller les blocs fournis
ci-dessous sans les modifier, rédiger les textes.

**Règles communes aux trois missions**
- Les blocs HTML se collent dans un bloc **« HTML personnalisé »**, par un
  utilisateur au rôle **Administrateur** : pour les autres rôles, WordPress
  retire les `<script>` et les blocs ne fonctionnent plus.
- **Ne jamais renommer** les attributs `name="…"`, `data-api`, ni les classes
  `pp-…` : le worker et les scripts les lisent tels quels.
- Si un plugin de sécurité, de cache ou d'optimisation (minification JS,
  « delay JS ») réécrit le HTML, **exclure ces pages** de ces traitements.
- L'adresse du worker (`on-sort-poc.loumiwassim.workers.dev`) passera un jour
  à `app.papaparfait.fr` : Claude Code préviendra, ce sera la seule ligne à
  changer dans chaque bloc.
- Après chaque mise en ligne, **envoie l'URL à Wassim**.

---

## 2. Mission 1 — page « Proposer une sortie » (à faire en premier)

**Objectif :** une page où théâtres, fermes, parcs, musées, cinémas et
associations proposent gratuitement leurs sorties pour les 0-10 ans. Wassim
va envoyer environ 450 e-mails de prospection qui pointent vers cette page :
**elle doit être en ligne avant ces envois.**

**À faire**
1. Créer la page **`https://papaparfait.fr/proposer-une-sortie/`** (cette
   URL exacte : elle est déjà écrite dans les e-mails de prospection).
   - H1 : « Proposez votre sortie aux papas » (ou mieux, à ta main).
   - Un court chapeau (3-4 phrases) : à qui ça s'adresse (lieux et
     organisateurs de sorties pour les 0-10 ans), c'est gratuit, relu sous
     48 h, le lieu est crédité sur la fiche, villes couvertes.
   - Puis **le bloc A** ci-dessous, collé tel quel.
2. **Liens vers la page** : pied de page (« Organisateurs : proposez une
   sortie »), page À propos.
3. **SEO** : page indexable ; title « Proposer une sortie enfant — Papa
   Parfait » ; meta description tournée vers les organisateurs.
4. **Tester une fois** après mise en ligne : envoyer une proposition dont le
   titre commence par « TEST ». Attendu : message vert « Merci ! » et un
   e-mail à contact@papaparfait.fr. Prévenir Wassim, qui la refusera dans son
   admin.

Le worker applique lui-même les règles (0-10 ans, villes ouvertes, dates
dans les 12 mois, photo 2 Mo max, anti-spam) : inutile de les dupliquer.

---

## 3. Mission 2 — pages thématiques par ville avec encart « Le top du moment »

**Objectif :** répondre aux recherches des parents, ville par ville. Chaque
page combine **un texte durable que tu rédiges** (il porte le référencement)
et **un encart calculé par Papa Parfait** (top 5 du moment, mis à jour
plusieurs fois par jour, avec un bouton vers l'app). L'encart est inséré
**côté serveur** par un shortcode : Google le lit comme du texte normal.

### 3.1 Installer le shortcode (une seule fois)

Avec le plugin **Code Snippets** (ou le `functions.php` d'un thème enfant),
ajouter **le snippet PHP B** ci-dessous, en « Exécuter partout ».

Usage dans une page (bloc « Code court ») :

```
[papaparfait_top ville="rennes" page="ce-week-end"]
[papaparfait_top ville="rennes" page="ce-week-end" jour="dimanche"]
```

- Si une extension de cache de page est active, régler sa durée à **3 h au
  plus** sur ces pages, sinon l'encart vieillit.
- Si le worker ne répond pas, l'encart disparaît sans casser la page.
- Hors saison (Noël en mars…), l'encart d'une page saisonnière n'affiche
  rien : **ne pas dépublier** la page, elle reprendra de la valeur.

### 3.2 Les pages

**Villes, dans l'ordre :** Rennes, Nantes, Bordeaux, Lille, Paris
(identifiants : `rennes`, `nantes`, `bordeaux`, `lille`, `paris`).

| Famille | `page=` | Requête visée (exemple Rennes) | Vague |
|---|---|---|---|
| Ce week-end | `ce-week-end` (+ un 2ᵉ shortcode avec `jour="dimanche"`) | que faire à Rennes ce week-end avec les enfants | 1 |
| Aujourd'hui | `aujourd-hui` | que faire aujourd'hui à Rennes avec les enfants | 1 |
| Situation | `quand-il-pleut` | activité enfant Rennes quand il pleut | 1 |
| Situation | `gratuit` | sortie gratuite enfant Rennes | 1 |
| Âge | `2-ans` | que faire avec un enfant de 2 ans à Rennes | 1 |
| Âge | `3-ans` | sortie enfant 3 ans Rennes | 1 |
| Saison | `vacances-toussaint` | vacances de la Toussaint Rennes enfants | 1 — **en ligne avant le 17/10** |
| Saison | `halloween` | Halloween enfants Rennes | 1 — **en ligne avant le 17/10** |
| Âge | `bebe` | sortie avec bébé Rennes | 2 |
| Âge | `1-an` | activité enfant 1 an Rennes | 2 |
| Âge | `4-5-ans` | sortie enfant 4 ans / 5 ans Rennes | 2 |
| Âge | `6-10-ans` | sortie enfant 6-10 ans Rennes | 2 |
| Situation | `apres-l-ecole` | activité enfant après l'école Rennes | 2 |
| Saison | `noel` | Noël enfants Rennes (spectacles, marchés) | 2 — **en ligne avant le 15/11** |
| Saison | `carnaval` | carnaval enfants Rennes | 3 — en ligne avant le 15/01 |

**Vague 1 = 8 pages × 5 villes = 40 pages, Rennes en premier.** Claude Code
mesurera les résultats dans Search Console avant la vague 2.

### 3.3 Gabarits

- **URL** : `https://papaparfait.fr/sorties-enfants/<ville>/<page>/`
  (ex. `/sorties-enfants/rennes/ce-week-end/`), plus une **page parente par
  ville** (`/sorties-enfants/rennes/`) qui relie toutes ses pages.
- **Title** (60 caractères max) : la question du parent + « — Papa Parfait »
  (ex. « Que faire à Rennes ce week-end avec les enfants ? — Papa Parfait »).
- **H1** : la question telle que le parent la tape.
- **Meta description** : une promesse concrète + « mis à jour chaque jour ».
- **Données structurées** : `BreadcrumbList` seulement. Pas d'`Event` :
  l'encart change trop souvent pour un balisage fiable.

### 3.4 Le texte durable (ce qui fait ranker)

- **400 à 700 mots uniques par page.** Jamais le même texte d'une ville à
  l'autre en changeant seulement le nom : Google le traiterait comme du
  contenu mince.
- **Structure** : une intro qui répond tout de suite (2-3 phrases) → **le
  shortcode** → 3 à 5 sous-parties H2 (lieux incontournables, idées selon la
  météo ou l'âge, conseils pratiques : sieste, poussette, parkings, budget)
  → un mot sur l'app et son bouton.
- **Pages par âge** : parler de ce qui amuse et fatigue un enfant de cet âge.
  C'est ce qui les rend utiles et uniques.
- **Lieux à citer** : l'annexe C liste 151 lieux phares des 5 villes, avec
  ce qu'ils proposent aux enfants. Cite-les, décris-les avec tes mots, fais un
  lien vers leur site. Ne recopie pas leurs textes.
- **Maillage** : chaque page renvoie vers sa page parente et vers 2-3 pages
  sœurs (« 2 ans » ↔ « 3 ans », « ce week-end » ↔ « quand il pleut »).
- **Ne pas copier rennesenfamille.fr** (ses mentions légales l'interdisent) :
  on s'inspire des formats, jamais du contenu.

---

## 4. Mission 3 — pages de concours (quand Wassim en lance un)

**Objectif :** un lieu partenaire offre des places ; les parents participent
sur une page du site ; le lieu la partage à sa communauté. C'est de
l'acquisition. Pendant la participation, une case **décochée** propose
l'alerte du week-end. Ce n'est jamais une condition (RGPD).

**Pas d'action tant que Wassim ne t'a pas donné un identifiant de concours**
(il le crée dans son admin, ex. `nocturnes-parc-2026`). Ensuite, pour
chaque concours :

1. Créer la page **`https://papaparfait.fr/concours/<identifiant>/`**.
   - H1 : « À gagner : <le lot> ».
   - 2 à 4 phrases sur le lieu partenaire (ville, type d'activité), une
     photo fournie par le partenaire, un lien vers son site.
   - **Le bloc D** ci-dessous, en remplaçant **uniquement**
     `IDENTIFIANT-DU-CONCOURS` par l'identifiant donné par Wassim.
   - En bas : « Papa Parfait, c'est quoi ? » en 2 phrases + lien vers l'app.
2. **SEO** : page indexable pendant le concours (« jeu concours <lieu>
   <ville> »). Après la clôture, la laisser en ligne : le bloc affiche
   « Concours terminé » tout seul. Ajouter un lien vers le concours suivant.
3. Envoyer l'URL à Wassim : il la transmet au partenaire pour diffusion.

Le bloc lit seul le lot, les dates, les villes et l'état du concours, et
renvoie vers le règlement, que le worker génère. **Ne réécris pas les règles
du jeu sur la page** : le règlement fait foi.

---

## 5. Récapitulatif

| # | Quoi | Quand | Bloc |
|---|---|---|---|
| 1 | Page `/proposer-une-sortie/` + liens + test | **Tout de suite** (avant la prospection) | A |
| 2a | Snippet shortcode | Tout de suite | B |
| 2b | Vague 1 des pages thématiques (Toussaint et Halloween avant le 17/10) | Cette semaine, Rennes d'abord | annexe C |
| 2c | Vague 2 (Noël avant le 15/11) | Après le feu vert de Wassim | annexe C |
| 3 | Page de concours | À chaque identifiant envoyé par Wassim | D |

Questions, doutes, conflit avec le périmètre de l'app : passer par Wassim.

---

## Bloc A — formulaire « Proposer une sortie » (mission 1)

À coller tel quel dans un bloc « HTML personnalisé » de la page
`/proposer-une-sortie/`.

```html
<!--
  Formulaire « Proposer une sortie » — bloc à coller tel quel dans une page
  WordPress (bloc « HTML personnalisé »). Autonome : HTML + CSS + JS, aucun
  plugin. Il envoie au worker Papa Parfait (POST /propositions), qui valide,
  géocode, stocke et prévient Wassim. Voir brief-cowork-formulaire.md.

  Ne pas renommer les attributs name="…" : le worker les lit tels quels.
  L'adresse d'envoi est dans data-api (à passer sur https://app.papaparfait.fr
  quand le sous-domaine sera en place).
-->
<div class="pp-proposer" data-api="https://on-sort-poc.loumiwassim.workers.dev/propositions">
<style>
  .pp-proposer{--pp-encre:#1B2430;--pp-ambre:#FF8A00;--pp-alerte:#C2410C;--pp-ok:#2F7D4F;max-width:720px;margin:0 auto;font-size:16px;line-height:1.5;color:var(--pp-encre)}
  .pp-proposer fieldset{border:2px solid var(--pp-encre);border-radius:10px;padding:16px 20px;margin:0 0 20px}
  .pp-proposer legend{font-weight:700;padding:0 6px}
  .pp-proposer label{display:block;margin:12px 0 4px;font-weight:600}
  .pp-proposer .pp-aide{font-weight:400;font-size:14px;opacity:.8}
  .pp-proposer input[type=text],.pp-proposer input[type=email],.pp-proposer input[type=tel],.pp-proposer input[type=url],
  .pp-proposer input[type=date],.pp-proposer input[type=time],.pp-proposer input[type=number],.pp-proposer textarea,.pp-proposer select{
    width:100%;box-sizing:border-box;padding:10px 12px;border:1.5px solid var(--pp-encre);border-radius:6px;font:inherit;background:#fff}
  .pp-proposer .pp-ligne{display:flex;gap:12px;flex-wrap:wrap}
  .pp-proposer .pp-ligne>div{flex:1;min-width:140px}
  .pp-proposer .pp-choix{display:flex;gap:8px 18px;flex-wrap:wrap;margin-top:6px}
  .pp-proposer .pp-choix label{display:flex;gap:6px;align-items:center;margin:0;font-weight:400}
  .pp-proposer .pp-seance{display:flex;gap:8px;align-items:end;flex-wrap:wrap;margin-top:8px}
  .pp-proposer .pp-seance>div{flex:1;min-width:120px}
  .pp-proposer button{font:inherit;font-weight:700;border:2px solid var(--pp-encre);border-radius:999px;padding:10px 20px;cursor:pointer;background:#fff;color:var(--pp-encre)}
  .pp-proposer button.pp-principal{background:var(--pp-ambre)}
  .pp-proposer button:disabled{opacity:.5;cursor:wait}
  .pp-proposer .pp-erreur{color:var(--pp-alerte);font-size:14px;margin-top:4px}
  .pp-proposer .pp-message{border:2px solid var(--pp-encre);border-radius:10px;padding:16px;margin-top:16px}
  .pp-proposer .pp-message.ok{border-color:var(--pp-ok)}
  .pp-proposer .pp-message.ko{border-color:var(--pp-alerte)}
  .pp-proposer .pp-piege{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
  .pp-proposer [hidden]{display:none!important}
</style>

<form novalidate>
  <fieldset>
    <legend>Votre sortie</legend>
    <label>C’est…</label>
    <div class="pp-choix">
      <label><input type="radio" name="type" value="evenement" checked> Un événement daté (spectacle, atelier, fête…)</label>
      <label><input type="radio" name="type" value="lieu"> Un lieu ouvert toute l’année (ferme, parc, espace de jeux…)</label>
    </div>
    <label for="pp-titre">Titre *</label>
    <input type="text" id="pp-titre" name="titre" maxlength="160" required>
    <label for="pp-description">Description * <span class="pp-aide">— ce que vivent les enfants, en quelques phrases</span></label>
    <textarea id="pp-description" name="description" rows="5" maxlength="2000" required></textarea>
  </fieldset>

  <fieldset>
    <legend>Où ?</legend>
    <label for="pp-lieu">Nom du lieu *</label>
    <input type="text" id="pp-lieu" name="lieuNom" maxlength="120" required>
    <label for="pp-adresse">Adresse *</label>
    <input type="text" id="pp-adresse" name="adresse" maxlength="200" required>
    <div class="pp-ligne">
      <div><label for="pp-cp">Code postal *</label><input type="text" id="pp-cp" name="codePostal" inputmode="numeric" maxlength="5" required></div>
      <div><label for="pp-ville">Ville *</label><input type="text" id="pp-ville" name="ville" maxlength="80" required></div>
    </div>
  </fieldset>

  <fieldset data-pour="evenement">
    <legend>Quand ?</legend>
    <p class="pp-aide">Ajoutez chaque séance (jusqu’à 30). L’heure aide les papas à savoir si c’est faisable après l’école.</p>
    <div class="pp-seances"></div>
    <div class="pp-erreur" data-erreur="date"></div>
    <p><button type="button" class="pp-ajouter">+ Ajouter une date</button></p>
  </fieldset>

  <fieldset data-pour="lieu" hidden>
    <legend>Quand est-ce ouvert ?</legend>
    <label>Jours d’ouverture *</label>
    <div class="pp-choix">
      <label><input type="checkbox" name="jours" value="1"> lun</label>
      <label><input type="checkbox" name="jours" value="2"> mar</label>
      <label><input type="checkbox" name="jours" value="3"> mer</label>
      <label><input type="checkbox" name="jours" value="4"> jeu</label>
      <label><input type="checkbox" name="jours" value="5"> ven</label>
      <label><input type="checkbox" name="jours" value="6"> sam</label>
      <label><input type="checkbox" name="jours" value="0"> dim</label>
    </div>
    <div class="pp-erreur" data-erreur="jours"></div>
    <label for="pp-horaires">Horaires * <span class="pp-aide">— ex. « 10h – 18h »</span></label>
    <input type="text" id="pp-horaires" name="horaires" maxlength="160">
    <div class="pp-ligne">
      <div><label for="pp-pdebut">Ouvert du <span class="pp-aide">(facultatif)</span></label><input type="date" id="pp-pdebut" name="periodeDebut"></div>
      <div><label for="pp-pfin">au <span class="pp-aide">(facultatif)</span></label><input type="date" id="pp-pfin" name="periodeFin"></div>
    </div>
    <div class="pp-erreur" data-erreur="periode"></div>
  </fieldset>

  <fieldset>
    <legend>Pour qui, et combien ?</legend>
    <label>Âges concernés *</label>
    <div class="pp-choix">
      <label><input type="checkbox" name="ages" value="0-3"> 0-3 ans</label>
      <label><input type="checkbox" name="ages" value="3-6"> 3-6 ans</label>
      <label><input type="checkbox" name="ages" value="6-10"> 6-10 ans</label>
      <label><input type="checkbox" name="ages" value="10+"> 10 ans et +</label>
    </div>
    <div class="pp-erreur" data-erreur="ages"></div>
    <div class="pp-choix" style="margin-top:12px"><label><input type="checkbox" name="gratuit"> Gratuit</label></div>
    <div class="pp-ligne">
      <div><label for="pp-penfant">Prix enfant (€)</label><input type="text" id="pp-penfant" name="prixEnfant" inputmode="decimal" placeholder="ex. 8"></div>
      <div><label for="pp-padulte">Prix adulte (€)</label><input type="text" id="pp-padulte" name="prixAdulte" inputmode="decimal" placeholder="ex. 12"></div>
    </div>
    <div class="pp-choix" style="margin-top:12px"><label><input type="checkbox" name="reservation"> Réservation obligatoire</label></div>
    <label for="pp-billetterie">Lien de billetterie <span class="pp-aide">(facultatif)</span></label>
    <input type="url" id="pp-billetterie" name="billetterie" placeholder="https://">
    <label for="pp-url">Page officielle <span class="pp-aide">(facultatif)</span></label>
    <input type="url" id="pp-url" name="urlOfficielle" placeholder="https://">
    <label for="pp-photo">Photo <span class="pp-aide">(facultatif — JPG, PNG ou WEBP, 2 Mo max)</span></label>
    <input type="file" id="pp-photo" name="photo" accept="image/jpeg,image/png,image/webp">
  </fieldset>

  <fieldset>
    <legend>Vous</legend>
    <label for="pp-organisme">Organisme *</label>
    <input type="text" id="pp-organisme" name="organisme" maxlength="120" required>
    <div class="pp-ligne">
      <div><label for="pp-nom">Votre nom *</label><input type="text" id="pp-nom" name="contactNom" maxlength="80" required></div>
      <div><label for="pp-tel">Téléphone <span class="pp-aide">(facultatif)</span></label><input type="tel" id="pp-tel" name="telephone" maxlength="30"></div>
    </div>
    <label for="pp-email">E-mail * <span class="pp-aide">— pour vous prévenir de la publication</span></label>
    <input type="email" id="pp-email" name="contactEmail" maxlength="160" required>
  </fieldset>

  <!-- Champ piège : invisible pour un humain, rempli par les robots. -->
  <div class="pp-piege" aria-hidden="true"><label>Site web <input type="text" name="site_web" tabindex="-1" autocomplete="off"></label></div>

  <p class="pp-aide">Nous publions les sorties pensées pour les enfants de 0 à 10 ans, dans les villes où Papa Parfait est ouvert. Chaque proposition est relue sous 48 h ; vous recevez un e-mail à la publication. C’est gratuit.</p>
  <button type="submit" class="pp-principal">Proposer ma sortie</button>
  <div class="pp-message" hidden></div>
</form>

<template class="pp-modele-seance">
  <div class="pp-seance">
    <div><label>Date</label><input type="date" name="date"></div>
    <div><label>Début</label><input type="time" name="heureDebut"></div>
    <div><label>Fin</label><input type="time" name="heureFin"></div>
    <button type="button" class="pp-retirer" aria-label="Retirer cette date">✕</button>
  </div>
</template>

<script>
(function () {
  var racine = document.currentScript.closest('.pp-proposer');
  var form = racine.querySelector('form');
  var seances = racine.querySelector('.pp-seances');
  var modele = racine.querySelector('.pp-modele-seance');
  var message = racine.querySelector('.pp-message');

  function ajouterSeance() {
    if (seances.children.length >= 30) return;
    seances.appendChild(modele.content.cloneNode(true));
  }
  ajouterSeance();
  racine.querySelector('.pp-ajouter').addEventListener('click', ajouterSeance);
  seances.addEventListener('click', function (e) {
    if (e.target.classList.contains('pp-retirer') && seances.children.length > 1) e.target.closest('.pp-seance').remove();
  });

  function majType() {
    var type = form.querySelector('input[name=type]:checked').value;
    racine.querySelectorAll('[data-pour]').forEach(function (f) { f.hidden = f.getAttribute('data-pour') !== type; });
  }
  form.querySelectorAll('input[name=type]').forEach(function (r) { r.addEventListener('change', majType); });

  function afficherErreurs(erreurs) {
    racine.querySelectorAll('.pp-erreur.pp-auto').forEach(function (e) { e.remove(); });
    racine.querySelectorAll('[data-erreur]').forEach(function (e) { e.textContent = ''; });
    var premier = null;
    Object.keys(erreurs || {}).forEach(function (champ) {
      var zone = racine.querySelector('[data-erreur="' + champ + '"]');
      var cible = form.querySelector('[name="' + champ + '"]');
      if (!zone && cible) {
        zone = document.createElement('div');
        zone.className = 'pp-erreur pp-auto';
        cible.insertAdjacentElement('afterend', zone);
      }
      if (zone) { zone.textContent = erreurs[champ]; premier = premier || zone; }
    });
    if (premier) premier.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function dire(texte, ok) {
    message.hidden = false;
    message.className = 'pp-message ' + (ok ? 'ok' : 'ko');
    message.textContent = texte;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var photo = form.querySelector('[name=photo]').files[0];
    if (photo && photo.size > 2 * 1024 * 1024) { afficherErreurs({ photo: 'Photo de 2 Mo maximum.' }); return; }
    var bouton = form.querySelector('button[type=submit]');
    bouton.disabled = true;
    message.hidden = true;
    var donnees = new FormData(form);
    // Les champs de la partie masquée (événement / lieu) ne sont pas envoyés.
    var type = donnees.get('type');
    if (type === 'lieu') { ['date', 'heureDebut', 'heureFin'].forEach(function (k) { donnees.delete(k); }); }
    else { ['jours', 'horaires', 'periodeDebut', 'periodeFin'].forEach(function (k) { donnees.delete(k); }); }
    fetch(racine.getAttribute('data-api'), { method: 'POST', body: donnees })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (r) {
        bouton.disabled = false;
        if (r.ok) {
          afficherErreurs({});
          form.reset(); seances.innerHTML = ''; ajouterSeance(); majType();
          dire('Merci ! Votre sortie est bien reçue. Nous la relisons sous 48 h et vous écrivons dès qu’elle est en ligne.', true);
        } else if (r.erreurs) {
          afficherErreurs(r.erreurs);
          dire('Quelques champs sont à corriger, ils sont signalés en rouge.', false);
        } else {
          dire(r.message || 'L’envoi n’a pas abouti. Réessayez dans un instant, ou écrivez-nous à contact@papaparfait.fr.', false);
        }
      })
      .catch(function () {
        bouton.disabled = false;
        dire('L’envoi n’a pas abouti (connexion ?). Réessayez dans un instant, ou écrivez-nous à contact@papaparfait.fr.', false);
      });
  });
})();
</script>
</div>
```

## Snippet B — shortcode [papaparfait_top] (mission 2)

À ajouter une fois avec le plugin Code Snippets (« Exécuter partout »).

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

## Annexe C — lieux phares par ville (mission 2)

*Extrait de la prospection du 7 octobre 2026 (informations publiques relevées sur les sites officiels). Pour nourrir le texte durable des pages : citer, décrire, relier — ne pas recopier les textes des lieux.*

## Rennes

**Spectacles jeune public**

- [Lillico – scène jeune public](https://www.lillicojeunepublic.fr/) — Scène conventionnée art, enfance et jeunesse (salle Guy Ropartz) qui programme toute l'année des spectacles pour tout-petits et familles, plus le festival Marmaille en octobre.
- [Théâtre du Cercle](https://theatreducercle.com/) — Théâtre associatif du Cercle Paul Bert dont la saison 2026-2027 comprend des pièces tout public dès 5 ans (ex. « Super Super Super », 27 novembre 2026).
- [Le Triangle, Cité de la danse](https://letriangle.org/) — Cité de la danse au Blosne, avec des spectacles de danse et des ateliers ouverts aux familles pendant la saison 2026-2027.
- [Opéra de Rennes](https://opera-rennes.fr/) — Programmation « En famille » et « Tous à l'opéra », avec des concerts pour les jeunes et des spectacles pour enfants (ex. « Marelle », du 3 au 5 novembre 2026).
- [La Paillette](https://www.la-paillette.net/) — Théâtre et MJC dont la saison 2026-2027 propose des spectacles jeune public (« Le Loup en slip », « L'Ours » avec dessin et marionnettes).
- [Comédie de Rennes](https://www.comediederennes.fr/) — Café-théâtre des Longs Champs avec des spectacles jeune public chaque semaine (ex. « Le coffre magique », « La petite sorcière » en octobre 2026).
- [La Confluence](https://www.betton.fr/accueil/bouger-sortir/culture/programmation-la-confluence) (Betton) — Salle culturelle de Betton dont la saison 2026-2027 comprend des spectacles pour tout-petits (ex. « Babilbeloola », gratuit, le 7 novembre 2026).
- [Carré Sévigné – Saison culturelle du Pont des Arts](https://www.ville-cesson-sevigne.fr/transitions/pont-des-arts/) (Cesson-Sévigné) — Deuxième salle de spectacle de l'agglomération, qui accueille la saison culturelle de Cesson-Sévigné avec des spectacles pour les familles et les enfants.

**Loisirs**

- [Gulli Parc Rennes-Cesson](https://gulli-parc.com/nos-parcs/rennes-cesson/) (Cesson-Sévigné) — Parc de jeux couvert pour les 1-12 ans : grand parcours aventure, toboggans, piscines à balles, espace tout-petits et mini-karting.
- [Gulli Parc Rennes-Cap Malo](https://gulli-parc.com/nos-parcs/rennes-cap-malo/) (Melesse) — Parc de jeux couvert de la zone Cap Malo, au nord de Rennes, avec des espaces pour les 1-3 ans, des attractions pour les plus grands et des formules anniversaire.
- [Hapik Rennes](https://hapik.fr/centres-tarifs/rennes) (Saint-Grégoire) — Escalade ludique en auto-assurage dès 4 ans, en sessions de 45 minutes sur des murs à thèmes, au centre commercial Grand Quartier.
- [Block'Out Rennes](https://www.blockout.fr/rennes/) (Cesson-Sévigné) — Salle d'escalade de bloc avec cours d'essai pour enfants et stages pendant les vacances (stage Halloween du 26 au 30 octobre 2026).
- [SpeedPark Rennes](https://speedpark.fr/rennes/) (Cesson-Sévigné) — Complexe de loisirs couvert (bowling enfants, laser game, arcades, Pixel, karting) avec formules anniversaire pour les enfants.
- [Le Blizz – patinoire de Rennes](https://www.leblizz.com/) — Patinoire ouverte toute l'année avec séances en famille, stages de patinage pour enfants, anniversaires et animations (25 ans du Blizz du 7 au 11 octobre 2026).

**Musées et sciences**

- [Les Champs Libres (Musée de Bretagne)](https://www.leschampslibres.fr/) — Pôle culturel (Musée de Bretagne, bibliothèque, planétarium) avec une offre « en famille » : expositions, jeux, ateliers et programme pour les vacances d'automne 2026.
- [Espace des sciences](https://www.espace-sciences.org/) — Centre de sciences et planétarium aux Champs Libres, avec des expositions interactives, des séances d'astronomie et la Fête de la science 2026.
- [Écomusée de la Bintinais](https://www.ecomusee-rennes-metropole.fr/) — Ferme-musée gratuite avec animaux, vergers et jardins, et des rendez-vous en famille à l'automne 2026 (« Campagnes ensorcelées », « Pommes & cidres »).
- [Musée des beaux-arts de Rennes](https://mba.rennes.fr/) — Rubrique « Avec des enfants » et programme des vacances d'automne pour les tout-petits et les enfants (visites et ateliers, quai Zola).
- [Frac Bretagne](https://www.fracbretagne.fr/) — Centre d'art contemporain avec des visites et ateliers en famille (« Visite les mini potes en famille » le 7 novembre 2026, atelier avec une artiste le 14 novembre).
- [Musée des Transmissions – Espace Ferrié](https://www.terre.defense.gouv.fr/musee-transmissions) (Cesson-Sévigné) — Musée gratuit des télécommunications avec manipulations interactives, escape game et un événement Halloween à énigmes (« Le Signal Rouge »).

**Cinémas**

- [Cinéma Arvor](https://www.cinema-arvor.fr/) — Cinéma art et essai du centre-ville avec une programmation « Jeune public » (films d'animation, tarif réduit pour les moins de 14 ans).
- [Cinéma du TNB](https://www.t-n-b.fr/cinema-tnb) — Cinéma du Théâtre national de Bretagne, avec une offre « Public jeune » et des séances spéciales comme les soirées pyjama.
- [Cinéma Le Sévigné](https://www.cinesevigne.fr/) (Cesson-Sévigné) — Cinéma associatif de Cesson-Sévigné, une dizaine de séances par semaine et des rencontres, avec des films familiaux au programme mensuel.
- [Cinéma Le Triskel](https://www.eveil-triskel.fr/) (Betton) — Cinéma associatif art et essai de Betton (188 places) à la programmation familiale, avec des séances pour les scolaires.

## Nantes

**Spectacles jeune public**

- [Théâtre ONYX](https://www.theatreonyx.fr/) (Saint-Herblain) — Scène conventionnée dont la saison 26-27 inclut des spectacles jeune public, comme « Le Loup en slip » le 16 octobre 2026.
- [Piano'cktail](https://www.pianocktail-bouguenais.fr/) (Bouguenais) — Salle municipale avec des spectacles famille à petit prix, comme le concert pop « Oh yeah ! Oh yeah ! » dès 6 ans (21 octobre 2026).
- [Espace culturel Capellia](https://www.sortiralachapellesurerdre.fr/capellia) (La Chapelle-sur-Erdre) — Salle de spectacle municipale avec une saison culturelle 26-27, des représentations jeune public et le dispositif « Petits ambassadeurs ».
- [Théâtre de la Fleuriaye](https://www.theatre-carquefou.fr/) (Carquefou) — Théâtre municipal avec une saison 26-27 et une rubrique « Famille » pour les spectacles à voir avec les enfants.
- [Théâtre 100 Noms](https://theatre100noms.com/) — Théâtre du Hangar à Bananes qui programme des spectacles en famille (« Vaste Monde », « Merlin, les nouvelles aventures »).
- [L'Embarcadère / L'Escall (saison culturelle de Saint-Sébastien)](https://culture.saintsebastien.fr/la-culture-a-saint-sebastien/) (Saint-Sébastien-sur-Loire) — Saison municipale avec des spectacles jeune public pendant les vacances scolaires, comme le spectacle musical « A contes-gouttes ».
- [La Cachette des 3 Chardons](https://www.lacachette.fr/) — Petit théâtre de l'île de Nantes qui programme toute l'année des spectacles pour les 2-8 ans, à tarif unique.

**Loisirs**

- [Royal Kids Sainte-Luce](https://royalkids.fr/sainte-luce) (Sainte-Luce-sur-Loire) — Parc de jeux couvert et chauffé pour les 0-12 ans, ouvert du mercredi au dimanche et tous les jours pendant les vacances.
- [Block'Out Nantes](https://www.blockout.fr/nantes/) — Salle d'escalade de bloc avec cours d'essai pour les enfants et stages pendant les vacances (Halloween du 26 au 30 octobre).
- [Vertical'Art Nantes](https://nantes.vertical-art.fr/) — Salle d'escalade avec cours enfants, stages vacances et anniversaires escalade.
- [Planète Sauvage](https://www.planetesauvage.com/) (Port-Saint-Père) — Parc animalier avec piste safari en voiture et cité marine, billet enfant à prix réduit.
- [Laser Game Evolution Nantes Saint-Herblain](https://nantes-st-herblain.lasergame-evolution.fr/) (Saint-Herblain) — Laser game ouvert dès 7 ans, avec formules anniversaire pour les enfants.
- [Les Machines de l'île](https://www.lesmachines-nantes.fr/) — Balade à dos du Grand Éléphant, Carrousel des mondes marins et Galerie des machines animées, un incontournable avec les enfants.

**Musées et sciences**

- [Château des ducs de Bretagne – Musée d'histoire de Nantes](https://www.chateaunantes.fr/) — Château et musée d'histoire avec visites et ateliers en famille pendant les vacances (Noël au château, etc.).
- [Musée d'arts de Nantes](https://museedartsdenantes.nantesmetropole.fr/) — Ateliers en famille et ateliers enfants comme « Carnet de voyage » dès 7 ans (28 octobre – 30 décembre 2026).
- [Musée Jules Verne](https://julesverne.nantesmetropole.fr/) — Rubrique « Jeune public & familles » avec ateliers créatifs (fabrique à hologrammes le 23 octobre 2026), Studio 7-12 et balades Baludik.
- [Planétarium de Nantes](https://planetarium.nantesmetropole.fr/accueil.html) — Séances sous le dôme adaptées aux enfants : « Planètes junior » (4-8 ans) et « La grande aventure du système solaire » (6-12 ans).
- [Le Chronographe](https://lechronographe.nantesmetropole.fr/) (Rezé) — Centre d'interprétation archéologique avec une offre familles, des ateliers et des dimanches en famille autour de l'archéologie.

**Cinémas**

- [Le Cinématographe](https://www.lecinematographe.com/) — Cinéma art et essai avec un parcours jeune public : « Premières séances » pour les tout-petits, « Pour les plus grands » et « Les Lucioles ».
- [Cinéma Le Beaulieu](https://cinemalebeaulieu.com/) (Bouguenais) — Cinéma associatif avec une programmation jeune public : séances « Mioches au cinoch' », films des vacances et rencontres jeune public.
- [Cinéma Lutétia](https://www.cine-lutetia.net/) (Saint-Herblain) — Cinéma associatif labellisé jeune public, avec de nombreuses séances enfants et le festival de films d'animation Cinémotion.
- [Cinéma Saint-Paul](https://cinemastpaul.fr/) (Rezé) — Cinéma associatif avec des séances « Cinéminos » et des films d'animation pour les petits (Le Peuple Loup, Un petit air de famille…).

## Bordeaux

**Spectacles jeune public**

- [Glob Théâtre](https://globtheatre.net) — Scène de création qui programme des spectacles jeune public (théâtre dès 4 ans, cirque dès 8 ans).
- [Théâtre du Pont Tournant](https://www.theatreponttournant.com) — Théâtre de quartier avec une rubrique jeune public et des séances scolaires.
- [Carré-Colonnes, scène nationale](https://carrecolonnes.fr) (Saint-Médard-en-Jalles / Blanquefort) — Scène nationale qui joue des spectacles jeune public en matinée (ex. « Goupil et Kosmao »).
- [Le Rocher de Palmer](https://lerocherdepalmer.fr) (Cenon) — Salle de musiques du monde qui édite une brochure jeune public (concerts et spectacles pour enfants).
- [Le Pin Galant](https://www.lepingalant.com) (Mérignac) — Grande salle qui programme quelques spectacles tout public pour les familles (ex. « La Petite Fille aux allumettes »).
- [Théâtre des Quatre Saisons](https://t4saisons.com) (Gradignan) — Scène avec une saison jeune public et des « spectacles en famille », plus une brochure dédiée.
- [La Manufacture CDCN](https://www.lamanufacture-cdcn.org) — Centre chorégraphique qui programme de la danse jeune public à Bordeaux et alentours.
- [Opéra National de Bordeaux](https://www.opera-bordeaux.com) — Grand-Théâtre et Auditorium avec une programmation « Famille » (ex. ciné-concert Chaplin).

**Loisirs**

- [Palomano Bordeaux](https://palomano.com/bordeaux) — Mini-ville couverte pour les 0-10 ans : 9 univers de jeux d’imitation (pompier, vétérinaire, pilote…).
- [Youpi Parc Bordeaux Lac](https://www.youpiparc.com/parc/youpi-parc-bordeaux-lac-33/) — Parc de jeux couvert pour les 0-12 ans (structures, trampolines).
- [Youpi Parc Pessac](https://www.youpiparc.com/parc/youpi-parc-pessac-33/) (Pessac) — Parc de jeux couvert pour les 0-12 ans, avec des animations pendant les vacances.
- [Zoo de Bordeaux-Pessac](https://www.zoo-bordeaux-pessac.com) (Pessac) — Parc zoologique avec un espace de jeux d’eau, Aqua Jungle, pour les familles.
- [Arkose Bordeaux](https://arkose.com/bordeaux) — Salle d’escalade de bloc avec cours et stages pour les 4-8 ans, et des anniversaires.
- [Jeux Barjo Bordeaux](https://jeuxbarjo.com) — Bar à jeux de société avec une sélection de jeux pour jouer avec les enfants.
- [Château Bardins](https://www.chateaubardins.fr) (Cadaujac) — Domaine viticole qui propose aux enfants des jeux de piste et des ateliers (signalé par l’Office de tourisme de Bordeaux).
- [Musée de l’Illusion Bordeaux](https://museedelillusion.fr) — Parcours d’illusions d’optique, d’hologrammes et de casse-têtes à faire en famille.

**Musées et sciences**

- [Cap Sciences](https://www.cap-sciences.net) — Centre de sciences avec des expositions interactives, un espace pour les petits (« Le P’tit Cap ») et des ateliers.
- [Muséum de Bordeaux – sciences et nature](https://www.museum-bordeaux.fr) — Muséum avec un « Musée des tout-petits » pour les enfants qui ne savent pas encore lire.
- [Musée d’Aquitaine](https://www.musee-aquitaine-bordeaux.fr) — Musée d’histoire avec une offre « En famille » et un accueil des centres d’animation.
- [Musée des Beaux-Arts de Bordeaux (MusBA)](https://www.musba-bordeaux.fr) — Activités « Famille, enfants et ados », dont des ateliers pour les 3-6 ans.
- [CAPC musée d’art contemporain](https://www.capc-bordeaux.fr) — Programme « Capc Kids » : Cool Kids Space, visites famille le samedi et ateliers pendant les vacances.
- [La Cité du Vin](https://www.laciteduvin.com) — Parcours « junior » ludique dès 8 ans et ateliers pour les enfants.
- [Bassins des Lumières](https://www.bassins-lumieres.com) — Centre d’art numérique immersif, accessible aux poussettes et gratuit pour les moins de 5 ans.
- [Science Expériences Bordeaux](https://www.science-experiences.com/bordeaux) — Musée de sciences immersif (réalité virtuelle, expériences) avec des médiateurs, pour les enfants dès 7 ans.

**Cinémas**

- [Utopia Bordeaux](https://bordeaux.cinemas-utopia.org) — Cinéma art et essai avec une programmation jeune public régulière.
- [Cinéma Jean Eustache](https://www.webeustache.com) (Pessac) — Agenda jeune public, « P’tite Unipop » et festival Les Toiles Filantes pour les enfants.
- [Cinéma La Lanterne](https://cinemalalanterne.fr) (Bègles) — Séances jeune public « Les Loupiotes », ciné-jeunes parents, ateliers et anniversaires.
- [Ciné Mérignac](https://www.cinemerignac.fr) (Mérignac) — Séances MinoKino (goûter + spectacle + film) et avant-premières pour les familles.
- [Cinéma L’Étoile](https://www.letoile-saintmedard.fr) (Saint-Médard-en-Jalles) — Rubrique jeune public et rendez-vous « Du ciné plein les mirettes » pour les petits.
- [Cinéma Les Colonnes](https://cinelescolonnes-blanquefort.fr) (Blanquefort) — Ciné-goûters avec jeux ou discussion, et des films jeune public dès 7 ans.

## Lille

**Spectacles jeune public**

- [Le Grand Bleu](https://www.legrandbleu.com/) — Scène dédiée au spectacle vivant pour les nouvelles générations : théâtre, danse et ciné-concerts dès 4 ans, plus des ateliers.
- [La rose des vents](https://larose.fr/) (Villeneuve-d'Ascq) — Scène nationale avec un volet Enfance dans sa programmation : des spectacles à partager en famille.
- [Opéra de Lille](https://www.opera-lille.fr/) — Une catégorie « En famille » (dont l'Happy Day des enfants) et une offre petite enfance pour découvrir l'opéra, la danse et les concerts.
- [Théâtre de marionnettes Le Petit Jacques](https://lepetitjacques.fr/) — Théâtre de marionnettes semi-plein air, dans la tradition des théâtres de square : Jacques de Lille dialogue avec les enfants (saison de Pâques à début octobre).
- [La Manivelle Théâtre](https://www.lamanivelletheatre.com/) (Wasquehal) — Lieu jeune public : théâtre, objets, musique et marionnettes dès 3 ans, avec des représentations le week-end.
- [Le Prato – Pôle National Cirque](https://www.leprato.fr/) — Pôle cirque qui propose des matinées en famille (Family Circus, Déclinaison circassienne) le week-end.
- [Le Zéphyr](https://zephyrhem.fr/) (Hem) — Salle de spectacle municipale avec une catégorie « Jeunesse » dans sa programmation (spectacles interactifs pour les enfants).

**Loisirs**

- [Zoo de Lille](https://www.lille.fr/Nature-a-Lille/Zoo-et-Ferme-pedagogique/Le-Zoo-de-Lille) — Parc zoologique rouvert en février 2026, avec des livrets-jeux et des animations de l'équipe de médiation scientifique.
- [Ferme pédagogique Marcel Dhénin](https://www.lille.fr/Nature-a-Lille/Zoo-et-Ferme-pedagogique/La-ferme-pedagogique-Marcel-Dhenin) — Ferme gratuite en ville (vaches, chèvres, cochons, lapins…) avec des ateliers en famille le mercredi, le week-end et pendant les vacances.
- [Arkose Lille (bloc Wazemmes)](https://arkose.com/lille-bloc) — Salle d'escalade de bloc avec un espace kids pour les 4-12 ans, des stages pendant les vacances et des anniversaires.
- [Mosaïc, le jardin des cultures](https://enm.lillemetropole.fr/parcs/mosaic-le-jardin-des-cultures) (Houplin-Ancoisne) — Parc-jardin de la MEL avec des jardins thématiques, une serre et des animations familiales (Ludimômes).
- [Les Prés du Hem](https://enm.lillemetropole.fr/parcs/les-pres-du-hem-0) (Armentières) — Parc de loisirs nature : parcours pieds nus, accro-trampoline dès 2 ans, petit train et prêt de jeux (ouvert jusqu'au 15 novembre).
- [Relais Nature du Parc de la Deûle](https://enm.lillemetropole.fr/parcs/relais-nature-du-parc-de-la-deule) (Santes) — Ateliers nature pour les familles (Brico'Nature, Vert par Nature dès 2 ans) et fêtes saisonnières (saison d'avril à mi-octobre).
- [Ludothèque et salle de jeux « Vaisseau Fantôme »](https://www.villeneuvedascq.fr/ludotheque-et-salle-de-jeux-vaisseau-fantome-0) (Villeneuve-d'Ascq) — Ludothèque municipale avec une salle de jeux sur place et des jeux à emprunter pour les enfants et leurs parents.

**Musées et sciences**

- [Forum départemental des Sciences](https://forumdepartementaldessciences.fr/) (Villeneuve-d'Ascq) — Centre de sciences avec planétarium dès 3 ans, expositions interactives et mini-ateliers pour les 2-4 ans (Espace d'Atom).
- [Palais des Beaux-Arts de Lille](https://pba.lille.fr/) — Nouveau Musée des Enfants gratuit pour les 6-10 ans, visites flash le week-end, atelier « Mission Nénuphar » le dimanche et visites en famille.
- [LaM – Lille Métropole Musée d'art moderne](https://www.musee-lam.fr/fr) (Villeneuve-d'Ascq) — Ateliers et stages créatifs pour les enfants, visites en famille, rendez-vous du mercredi et anniversaires au musée.
- [La Piscine – Musée d'art et d'industrie](https://www.roubaix-lapiscine.com/) (Roubaix) — Musée installé dans une ancienne piscine Art déco, avec des animations en famille (par exemple « 4 sens » le 11 octobre 2026).
- [Institut du monde arabe Tourcoing](https://www.ima-tourcoing.fr/) (Tourcoing) — Visites-ateliers, un spectacle jeune public (« La fuite de Shéhérazade ») et des ateliers de danse autour des expositions.
- [Musée de Plein Air](https://enm.lillemetropole.fr/parcs/musee-de-plein-air) (Villeneuve-d'Ascq) — Village rural reconstitué avec la « Pause familiale » (bricolage, jardinage), des jeux flamands et des animaux (saison du 11 avril au 18 octobre 2026).
- [Villa Cavrois](https://www.villa-cavrois.fr/) (Croix) — Villa moderniste (Centre des monuments nationaux) avec une offre « En famille » de visites et d'activités adaptées aux enfants.

**Cinémas**

- [Cinéma Le Méliès](https://larose.fr/cinema-le-melies/) (Villeneuve-d'Ascq) — Cinéma art et essai qui programme de nombreux films d'animation pour enfants l'après-midi (Le Cygne et l'enfant, Le Chant de la mer…).
- [Cinéma l'Univers](https://www.lunivers.org/) — Cinéma associatif de Moulins avec une rubrique jeune public et des séances d'éducation aux images pour les enfants.
- [Le Fresnoy – Studio national (cinéma)](https://www.lefresnoy.net/) (Tourcoing) — Le cinéma du Fresnoy programme des séances jeune public (par exemple « Un amour d'épouvantail » dès 3 ans en octobre 2026).
- [UGC Ciné Cité Lille](https://www.ugc.fr/cinema-ugc-cine-cite-lille.html) — Multiplexe du centre-ville avec une sélection « En famille » et des séances UGC Kids pour les enfants.

## Paris

**Spectacles jeune public**

- [Théâtre Paris-Villette](https://theatre-paris-villette.fr/) (Paris 19e) — Établissement culturel de la Ville de Paris dédié à la création jeune public : théâtre, marionnette et musique pour les enfants et les familles.
- [Le Mouffetard – Centre national de la marionnette](https://www.lemouffetard.com/) (Paris 5e) — Scène dédiée aux arts de la marionnette avec une saison de spectacles visuels accessibles aux enfants et aux familles.
- [Théâtre Dunois](https://www.theatredunois.org/) (Paris 13e) — Théâtre spécialisé jeune public : spectacles dès 2 mois, dès 5 ans, dès 7 ans (théâtre, musique, danse).
- [Théâtre des Marionnettes du Jardin du Luxembourg](https://www.marionnettesduluxembourg.fr/) (Paris 6e) — Théâtre de marionnettes historique au cœur du jardin du Luxembourg, contes classiques joués pour les tout-petits.
- [Guignol du Champ-de-Mars](https://www.guignolduchampdemars.fr/) (Paris 7e) — Théâtre de Guignol couvert depuis 1902 près de la tour Eiffel : contes en marionnettes de 45 min à 15h15 et 16h30 (Cendrillon en octobre 2026).
- [Marionnettes du Parc Montsouris](https://www.guignol-parcmontsouris.com/) (Paris 14e) — Théâtre de marionnettes couvert et chauffé du parc Montsouris : spectacles de Guignol d'environ 40 min pour les petits, anniversaires et groupes.
- [Théâtre Guignol Anatole (Buttes-Chaumont)](https://www.guignol-paris.com/) (Paris 19e) — Théâtre de Guignol du parc des Buttes-Chaumont (compagnie Les Petits Bouffons) : spectacles de marionnettes interactifs pour les jeunes enfants.
- [La Comédie Saint-Michel](https://comediesaintmichel.fr/) (Paris 5e) — Théâtre face au Luxembourg avec une programmation enfants dès 4 ans les mercredis et week-ends (contes musicaux, Fables de La Fontaine).
- [Espace Paris-Plaine](https://www.espaceparisplaine.fr/) (Paris 15e) — Salle exclusivement jeune public : 12 spectacles d'octobre 2026 à avril 2027 (comédie musicale, marionnettes, ballet, théâtre) dès 4-5 ans.
- [Guignol de Paname (parc de Choisy)](https://www.guignolpaname.com/) (Paris 13e) — Théâtre de Guignol couvert au parc de Choisy : histoires modernes en marionnettes pour les petits, groupes et anniversaires.
- [Théâtre Essaïon](https://essaion-theatre.com/) (Paris 4e) — Théâtre du Marais avec une forte programmation jeune public (Peter Pan, Le Livre de la Jungle, Le Petit Chat Botté à l'automne 2026).
- [Théâtre Darius Milhaud](https://www.theatredariusmilhaud.fr/) (Paris 19e) — Petit théâtre du 19e qui programme des spectacles enfants, notamment pendant les vacances d'automne et de Noël.
- [L'Antre Magique](https://www.antremagique.net/) (Paris 9e) — Théâtre dédié à la magie avec des spectacles familiaux dès 2 ans, dont « P'tit Ours », spectacle musical et magique pour les 2-10 ans.
- [Le Lucernaire](https://www.lucernaire.fr/) (Paris 6e) — Centre d'art et d'essai qui programme du jeune public, comme « Pépito petit bateau » d'octobre 2026 à janvier 2027.
- [Théâtre de la Ville (Enfance & Jeunesse)](https://www.theatredelaville-paris.com/) (Paris 4e) — Grande scène parisienne avec un programme « Enfance & Jeunesse » : concerts tout public, Goûters classiques et spectacles pour les familles.

**Loisirs**

- [Jardin d'Acclimatation](https://www.jardindacclimatation.fr/) (Paris 16e) — Parc d'attractions familial du bois de Boulogne : manèges, 450 animaux, ateliers et événements saisonniers toute l'année.
- [Aquarium de Paris](https://aquariumdeparis.com/) (Paris 16e) — 13 000 animaux marins, la plus grande collection de méduses d'Europe, un bassin tactile et des animations tous les jours au Trocadéro.
- [Musée Grévin](https://www.grevin-paris.com/) (Paris 9e) — Musée de cire des Grands Boulevards où les enfants croisent leurs héros, des stars et des personnages historiques.
- [Parc Floral de Paris](https://www.parcfloraldeparis.com/) (Paris 12e) — La plus grande aire de jeux de Paris, mini-golf, accrobranche et rosalies au bois de Vincennes.
- [Ballon Generali de Paris](https://ballondeparis.com/) (Paris 15e) — Ballon captif du parc André-Citroën qui fait monter les familles au-dessus de Paris, sans réservation.
- [Arkose Nation](https://arkose.com/nation) (Paris 20e) — Salle d'escalade de bloc avec un espace kids pour les 4-9 ans (murs-forteresse, filet, toboggan), cours, stages et anniversaires.
- [Arkose Strasbourg Saint-Denis](https://arkose.com/strasbourg-st-denis) (Paris 10e) — Salle d'escalade avec un espace dédié aux 3-12 ans (murs colorés), cours enfants et anniversaires.
- [Little Villette](https://www.lavillette.com/little-villette/) (Paris 19e) — Espace enfants du parc de la Villette : cirque, contes, arts plastiques, biodiversité et Little Studio LEGO les week-ends et vacances.
- [Le Petit Ney](https://lepetitney.fr/) (Paris 18e) — Café littéraire associatif qui propose des lectures pour bébés (0-6 ans), des ateliers conte et cuisine et un café jeux en famille.
- [Bateaux-Mouches](https://www.bateaux-mouches.fr/) (Paris 8e) — Croisières promenade sur la Seine au départ du port de la Conférence, une sortie d'une heure facile avec des enfants toute l'année.

**Musées et sciences**

- [Musée en Herbe](https://www.musee-en-herbe.com/) (Paris 1er) — Musée d'art pensé pour les enfants dès 2 ans : expositions à hauteur d'enfant, visites contées et ateliers créatifs.
- [Musée de la Magie](https://www.museedelamagie.com/) (Paris 4e) — Caves voûtées avec spectacle de magie inclus dans la visite, musée des automates et ateliers de magie pour enfants.
- [Musée des Arts Forains](https://arts-forains.com/) (Paris 12e) — Manèges et jeux de fête foraine anciens sur lesquels on peut monter, visites thématiques et ateliers pour les 4-11 ans.
- [Choco-Story Paris (Musée du Chocolat)](https://www.museeduchocolat.fr/) (Paris 10e) — Parcours ludique pour enfants sur l'histoire du chocolat avec dégustation, ateliers DIY et anniversaires chocolat.
- [Musée de l'Illusion](https://museedelillusion.fr/) (Paris 1er) — Salles d'illusions d'optique interactives où les enfants deviennent acteurs des expériences.
- [Musée de la Libération de Paris – Musée du Général Leclerc – Musée Jean Moulin](https://www.museeliberation-leclerc-moulin.paris.fr/) (Paris 14e) — Visites en famille, ateliers enfants (diorama de la Libération) et premier serious game familial pour découvrir l'histoire de Paris.
- [Cité des sciences et de l'industrie (Cité des enfants)](https://www.cite-sciences.fr/) (Paris 19e) — La Cité des enfants (2-7 et 5-12 ans), expos interactives, planétarium et ateliers scientifiques en famille.
- [Palais de la découverte (Palais des enfants)](https://www.palais-decouverte.fr/) (Paris 8e) — Le Palais des enfants propose expériences scientifiques et exposés animés par des médiateurs pour les jeunes curieux.
- [Grande Galerie de l'Évolution (Muséum national d'Histoire naturelle)](https://www.mnhn.fr/fr/grande-galerie-de-l-evolution) (Paris 5e) — Caravane d'animaux naturalisés, galerie des enfants, visites et ateliers famille au Jardin des Plantes.
- [Musée des Arts et Métiers](https://www.arts-et-metiers.net/) (Paris 3e) — Inventions, avions et automates à découvrir en famille avec visites et ateliers jeune public.
- [Musée du quai Branly – Jacques Chirac](https://www.quaibranly.fr/) (Paris 7e) — Livrets-jeux enfants, visites contées et ateliers en famille autour des arts d'Afrique, d'Océanie, d'Asie et des Amériques.
- [Musée de l'Homme](https://www.museedelhomme.fr/) (Paris 16e) — Parcours sur l'évolution humaine avec visites et ateliers pour les familles et les enfants.
- [Musée de la musique – Philharmonie de Paris](https://philharmoniedeparis.fr/) (Paris 19e) — Visites du musée enfants et familles, ateliers enfants-familles et Philharmonie des enfants, espace d'éveil musical.

**Cinémas**

- [Studio des Ursulines](https://www.studiodesursulines.com/) (Paris 5e) — Cinéma jeune public depuis 1926 : films dès 3 ans, Ciné-mailles, Mon premier festival et L'Enfance de l'art.
- [Forum des images](https://www.forumdesimages.fr/) (Paris 1er) — CinéKids les mercredis et dimanches pour les 2-9 ans (film + animation) et séances famille dès 18 mois.
- [La Cinémathèque française](https://www.cinematheque.fr/) (Paris 12e) — Ma Petite Cinémathèque (classiques présentés aux enfants), ateliers 3-14 ans et escape game au musée Méliès pour les 7-11 ans.
- [Le Louxor – Palais du cinéma](https://www.cinemalouxor.fr/) (Paris 10e) — Palais du cinéma art et essai avec séances et événements jeune public pour les enfants.
- [Studio 28](https://www.cinema-studio28.fr/) (Paris 18e) — Anniversaires d'enfants le mercredi (séance adaptée puis goûter dans le jardin) à Montmartre.
- [L'Archipel](https://www.larchipelcinema.com/) (Paris 10e) — Séances jeune public dès 2 ans, ciné-contes, ateliers-jeux et Mon Premier Festival (21-27 octobre 2026).
- [Le Balzac](https://www.cinemabalzac.com/) (Paris 8e) — Rubrique jeune public avec films d'animation et classiques pour enfants (Le Robot sauvage, Le petit monde de Leo…).
- [Les 3 Luxembourg](https://www.lestroisluxembourg.com/) (Paris 6e) — Séances jeune public tous les mercredis à 15 h (dès 3 ans) dans le cadre de L'Enfance de l'art, d'octobre à décembre 2026.
- [L'Entrepôt](https://www.cinemalentrepot.fr/) (Paris 14e) — Cinéma art et essai avec restaurant et programmation jeune public pour les familles.
- [Luminor Hôtel de Ville](https://www.luminor-hoteldeville.com/) (Paris 4e) — Cinéma indépendant du Marais avec une rubrique jeune public dédiée aux séances pour enfants.
- [Le Brady](https://www.lebrady.fr/) (Paris 10e) — Cinéma de quartier historique avec une section « Du côté des enfants » pour les séances jeune public.
- [Cinéma des Cinéastes](https://cinema-des-cineastes.fr/) (Paris 17e) — Participe à Mon Premier Festival, le festival jeune public de la Ville de Paris (21-27 octobre 2026), avec films d'animation familiaux.

## Bloc D — participation à un concours (mission 3)

À coller dans la page de chaque concours, en remplaçant **uniquement** `IDENTIFIANT-DU-CONCOURS`.

```html
<!--
  Bloc « Participer au concours » — à coller dans la page WordPress d'un
  concours (bloc « HTML personnalisé », rôle Administrateur). Un seul réglage :
  data-concours = l'identifiant du concours, affiché dans l'admin Papa Parfait
  (onglet Concours). Le bloc lit lui-même le lot, les dates et l'état
  (ouvert / terminé) au worker, et renvoie au règlement.
  Ne pas renommer les attributs name="…" : le worker les lit tels quels.
  Voir brief-cowork-concours.md.
-->
<div class="pp-concours" data-api="https://on-sort-poc.loumiwassim.workers.dev" data-concours="IDENTIFIANT-DU-CONCOURS">
<style>
  .pp-concours{--pp-encre:#1B2430;--pp-ambre:#FF8A00;--pp-alerte:#C2410C;--pp-ok:#2F7D4F;max-width:560px;margin:0 auto;font-size:16px;line-height:1.5;color:var(--pp-encre)}
  .pp-concours .pp-cadre{border:2px solid var(--pp-encre);border-radius:10px;padding:16px 20px}
  .pp-concours label{display:block;margin:12px 0 4px;font-weight:600}
  .pp-concours input[type=text],.pp-concours input[type=email],.pp-concours select{width:100%;box-sizing:border-box;padding:10px 12px;border:1.5px solid var(--pp-encre);border-radius:6px;font:inherit;background:#fff}
  .pp-concours .pp-coche{display:flex;gap:8px;align-items:flex-start;font-weight:400;margin-top:12px}
  .pp-concours .pp-coche input{margin-top:5px}
  .pp-concours button{font:inherit;font-weight:700;border:2px solid var(--pp-encre);border-radius:999px;padding:10px 20px;cursor:pointer;background:var(--pp-ambre);color:var(--pp-encre);margin-top:16px}
  .pp-concours button:disabled{opacity:.5;cursor:wait}
  .pp-concours .pp-erreur{color:var(--pp-alerte);font-size:14px;margin-top:4px}
  .pp-concours .pp-aide{font-size:14px;opacity:.8}
  .pp-concours .pp-message{border:2px solid var(--pp-encre);border-radius:10px;padding:16px;margin-top:16px}
  .pp-concours .pp-message.ok{border-color:var(--pp-ok)}
  .pp-concours .pp-message.ko{border-color:var(--pp-alerte)}
  .pp-concours .pp-piege{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
  .pp-concours [hidden]{display:none!important}
</style>
<div class="pp-cadre">
  <p class="pp-entete"><b class="pp-lot">Chargement du concours…</b><br><span class="pp-aide pp-dates"></span></p>
  <form novalidate hidden>
    <label for="pp-c-prenom">Prénom *</label>
    <input type="text" id="pp-c-prenom" name="prenom" maxlength="60" autocomplete="given-name">
    <label for="pp-c-email">E-mail *</label>
    <input type="email" id="pp-c-email" name="email" maxlength="160" autocomplete="email">
    <label for="pp-c-ville">Votre ville *</label>
    <select id="pp-c-ville" name="ville"><option value="">Choisir…</option></select>
    <label class="pp-coche"><input type="checkbox" name="alerte"> <span>Je veux aussi recevoir <b>l’alerte du week-end</b> : le vendredi, les meilleures sorties du samedi près de chez moi. Facultatif, sans effet sur le tirage, désinscription en un clic.</span></label>
    <label class="pp-coche"><input type="checkbox" name="reglement"> <span>J’accepte le <a class="pp-reglement" href="#" target="_blank" rel="noopener">règlement du jeu</a>. *</span></label>
    <div class="pp-piege" aria-hidden="true"><label>Site web <input type="text" name="site_web" tabindex="-1" autocomplete="off"></label></div>
    <button type="submit">Je participe</button>
  </form>
  <div class="pp-message" hidden></div>
</div>
<script>
(function () {
  var racine = document.currentScript.closest('.pp-concours');
  var api = racine.getAttribute('data-api');
  var id = racine.getAttribute('data-concours');
  var form = racine.querySelector('form');
  var message = racine.querySelector('.pp-message');
  var VILLES = [['rennes','Rennes'],['bruz','Bruz'],['stmalo','Saint-Malo'],['vitre','Vitré'],['stbrieuc','Saint-Brieuc'],['vannes','Vannes'],['lorient','Lorient'],['brest','Brest'],['quimper','Quimper'],['nantes','Nantes'],['stnazaire','Saint-Nazaire'],['paris','Paris'],['lille','Lille'],['valenciennes','Valenciennes'],['dunkerque','Dunkerque'],['bordeaux','Bordeaux'],['libourne','Libourne'],['arcachon','Arcachon']];

  function dire(texte, ok) { message.hidden = false; message.className = 'pp-message ' + (ok ? 'ok' : 'ko'); message.textContent = texte; }
  function dateFr(iso) { return iso.split('-').reverse().join('/'); }

  racine.querySelector('.pp-reglement').href = api + '/concours/' + encodeURIComponent(id) + '/reglement';
  fetch(api + '/concours/' + encodeURIComponent(id)).then(function (r) { return r.json(); }).then(function (c) {
    if (!c || !c.id) { racine.querySelector('.pp-lot').textContent = 'Concours introuvable.'; return; }
    racine.querySelector('.pp-lot').textContent = 'À gagner : ' + c.lot + ' — offert par ' + c.partenaire;
    racine.querySelector('.pp-dates').textContent = (c.ouvert ? 'Participation jusqu’au ' : 'Concours terminé le ') + dateFr(c.fin) + ' inclus · ' + c.nbGagnants + ' gagnant(s) tiré(s) au sort';
    var choix = c.villes && c.villes.length ? VILLES.filter(function (v) { return c.villes.indexOf(v[0]) >= 0; }) : VILLES;
    var select = form.querySelector('[name=ville]');
    choix.forEach(function (v) { var o = document.createElement('option'); o.value = v[0]; o.textContent = v[1]; select.appendChild(o); });
    if (choix.length === 1) select.value = choix[0][0];
    form.hidden = !c.ouvert;
    if (!c.ouvert) dire('Ce concours est terminé. Merci de votre intérêt !', false);
  }).catch(function () { racine.querySelector('.pp-lot').textContent = 'Le concours ne se charge pas pour le moment. Réessayez dans un instant.'; });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    racine.querySelectorAll('.pp-erreur').forEach(function (x) { x.remove(); });
    var bouton = form.querySelector('button');
    bouton.disabled = true;
    fetch(api + '/concours/' + encodeURIComponent(id) + '/participer', { method: 'POST', body: new FormData(form) })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (r) {
        bouton.disabled = false;
        if (r.ok) {
          form.hidden = true;
          dire(r.deja ? 'Vous participez déjà avec cette adresse : bonne chance !' : 'C’est noté, bonne chance ! Les gagnants seront prévenus par e-mail après la clôture.', true);
        } else if (r.erreurs) {
          Object.keys(r.erreurs).forEach(function (champ) {
            var cible = form.querySelector('[name="' + champ + '"]');
            var zone = document.createElement('div'); zone.className = 'pp-erreur'; zone.textContent = r.erreurs[champ];
            (cible.closest('.pp-coche') || cible).insertAdjacentElement('afterend', zone);
          });
        } else {
          dire(r.message || 'La participation n’a pas abouti. Réessayez dans un instant.', false);
        }
      })
      .catch(function () { bouton.disabled = false; dire('La participation n’a pas abouti (connexion ?). Réessayez dans un instant.', false); });
  });
})();
</script>
</div>
```
