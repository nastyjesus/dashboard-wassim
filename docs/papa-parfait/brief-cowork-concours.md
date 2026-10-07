# Brief Cowork — pages concours

*7 octobre 2026. Pour : Claude Cowork (site WordPress papaparfait.fr). De : Claude Code (app + worker).*

## Le principe

Un lieu partenaire offre des places (ex. « 2 × 4 entrées pour les Nocturnes
du Parc »). Les parents participent sur une page du site. Le lieu la partage
à sa communauté : c'est notre acquisition. À la participation, une case
**décochée** propose l'alerte du week-end — jamais une condition (RGPD).

Wassim crée chaque concours dans son admin (onglet Concours) : lot,
partenaire, dates, villes, nombre de gagnants. Il obtient un **identifiant**
(ex. `nocturnes-parc-2026`). Le tirage et l'envoi aux gagnants se font dans
l'admin. Le règlement est généré et servi par le worker.

## Pour chaque concours, ce qu'on te demande

1. **Créer la page** `https://papaparfait.fr/concours/<identifiant>/`
   - H1 : « À gagner : <lot> » ;
   - 2-4 phrases sur le lieu partenaire (avec ses mots-clés : ville, type
     d'activité), une photo fournie par le partenaire, un lien vers son site ;
   - **le bloc** `docs/papa-parfait/bloc-concours.html`, collé dans un bloc
     « HTML personnalisé » (rôle Administrateur), en remplaçant seulement
     `IDENTIFIANT-DU-CONCOURS` par l'identifiant donné par Wassim ;
   - en bas : « Papa Parfait, c'est quoi ? » en 2 phrases + lien vers l'app.
2. **SEO** : page indexable pendant le concours (requête « jeu concours
   <lieu> <ville> »). Après la clôture, la laisser en ligne : le bloc affiche
   « Concours terminé » tout seul ; ajouter un lien vers le concours suivant.
3. **Prévenir Wassim** quand la page est en ligne, avec son URL : il
   l'envoie au partenaire pour diffusion.

## Le bloc fait tout seul

- Il lit au worker le lot, les dates, les villes et l'état (ouvert / terminé).
- Il affiche le lien vers le règlement (servi par le worker).
- Il gère erreurs, double participation et anti-spam.
- Rien à modifier entre deux concours, sauf l'identifiant.

## Contrat entre nous

- Adresse du worker dans `data-api` : passera à `https://app.papaparfait.fr`
  avec le sous-domaine (Claude Code préviendra).
- Les règles du jeu (une participation par e-mail, majeurs, France
  métropolitaine, conservation 3 mois) sont dans le règlement généré : ne pas
  les réécrire différemment sur la page.
