# Brief Cowork — page « Proposer une sortie »

*6 octobre 2026. Pour : Claude Cowork (site WordPress papaparfait.fr). De : Claude Code (app + worker).*

## Ce qu'on veut

Une page du site où **les organisateurs** (théâtres, fermes, associations,
compagnies, parcs) proposent gratuitement leurs sorties pour les enfants de
0 à 10 ans. Chaque proposition est relue par Wassim, puis publiée dans l'app.

Pourquoi : 14 des 19 sorties qu'affiche le concurrent rennais
(rennesenfamille.fr) un samedi ne sont dans aucun agenda open data. Les lieux
qui nous écrivent eux-mêmes nous donnent aussi le prix, l'âge et la photo.

## Ce qui est déjà fait (côté Claude Code)

- Le worker reçoit le formulaire (`POST /propositions`), vérifie les champs,
  géocode l'adresse, refuse les villes non ouvertes, stocke la photo, envoie un
  accusé à l'organisateur et prévient contact@papaparfait.fr.
- Wassim valide ou refuse dans son admin ; l'organisateur est prévenu.
- **Le formulaire est prêt** : `docs/papa-parfait/formulaire-proposer-sortie.html`
  (HTML + CSS + JS autonome, sans plugin).

## Ce qu'on te demande

1. **Créer la page** `https://papaparfait.fr/proposer-une-sortie/`
   - titre H1 : « Proposez votre sortie aux papas » (ou mieux, à ta main) ;
   - un court chapeau : à qui ça s'adresse, gratuit, relu sous 48 h,
     villes ouvertes (liste à jour dans le brief SEO) ;
   - puis le formulaire.
2. **Coller le formulaire** dans un bloc « HTML personnalisé », **sans le
   modifier** : les attributs `name="…"` sont lus tels quels par le worker.
   - L'utilisateur qui colle doit avoir le rôle **Administrateur** : pour
     les autres rôles, WordPress retire les balises `<script>` et le
     formulaire ne fonctionnera plus.
   - Si un plugin de sécurité ou de cache réécrit le HTML, exclure la page.
   - Le style du bloc est volontairement neutre (cadres encre, bouton ambre) ;
     tu peux ajuster les couleurs dans le `<style>` du bloc, pas la structure.
3. **Liens vers la page** : pied de page (« Organisateurs : proposez une
   sortie »), page À propos, et toute page qui parle aux lieux.
4. **SEO** : page indexable ; title « Proposer une sortie enfant — Papa
   Parfait » ; meta description orientée organisateurs. Pas de données
   structurées particulières.
5. **Tester une fois** après mise en ligne : envoyer une proposition de test
   (titre commençant par « TEST »). Résultat attendu : message vert « Merci ! »
   et deux e-mails (contact@ et l'adresse saisie). Prévenir Wassim, qui la
   refusera dans l'admin.

## Contrat entre nous

- L'adresse d'envoi est dans `data-api` en tête du bloc. Elle passera de
  `on-sort-poc.loumiwassim.workers.dev` à `app.papaparfait.fr` quand le
  sous-domaine sera en place : **c'est la seule ligne à changer**, Claude Code
  préviendra.
- Les règles d'acceptation (0-10 ans, villes ouvertes, dates dans les
  12 mois) sont appliquées par le worker : inutile de les dupliquer côté site.
- Toute évolution des champs se décide côté Claude Code (worker + admin) ;
  le bloc HTML sera alors republié dans ce dossier.
