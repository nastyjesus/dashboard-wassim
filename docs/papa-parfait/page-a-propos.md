# Page « À propos » — contenu prêt à coller (WordPress)

Écrit pour : le visiteur du site, et les moteurs (Google, ChatGPT, Perplexity)
qui cherchent qui est derrière l'app. Objectif E-E-A-T : un humain identifiable,
une méthode expliquée, des limites assumées.

**Zones `[À COMPLÉTER]`** : je ne les invente pas. Remplace-les avant publication
— ce sont justement les éléments qui font la crédibilité de la page.

---

## Réglages WordPress

| Champ | Valeur |
|---|---|
| Titre de la page | À propos |
| Slug / URL | `/a-propos/` |
| Balise title (SEO) | Qui est derrière Papa Parfait ? — l'app de sorties pour les papas |
| Meta description | Papa Parfait est édité par Wassim Loumi, [À COMPLÉTER : métier], à Bruz. L'app trouve en quelques secondes une sortie adaptée à l'âge de ton enfant et à la météo du jour. Voici comment elle marche, et qui la fait. |
| Menu | Remplacer le lien mort « À propos » (`href="#"`) par `/a-propos/` |
| Image | Une vraie photo de toi, pas une illustration. Le visage est ce qui rassure — et Google lit l'`alt`. `alt` : « Wassim Loumi, créateur de Papa Parfait » |
| Liens internes | Depuis le pied de page et la page d'accueil, au moins un lien vers `/a-propos/`. Depuis cette page, un lien vers la politique de confidentialité et un vers l'app. |

---

## Le contenu

### Titre H1

Qui est derrière Papa Parfait

### Chapô

Papa Parfait est une application faite par une personne, à Bruz, en Bretagne.
Pas par une start-up, pas par une équipe marketing. L'idée est née d'un vendredi
soir de trop passé à chercher « quoi faire avec les enfants demain » entre trois
groupes Facebook, deux sites d'offices de tourisme et une appli météo.

> [À VALIDER : si tu es papa, écris-le ici — « faite par un papa » est un
> argument de confiance beaucoup plus fort. Je ne l'affirme pas à ta place.]

### H2 — Le problème qu'elle règle

Les sorties existent. L'information existe aussi : agendas de mairies, offices de
tourisme, associations. Mais elle est éparpillée, rarement filtrée par âge, et
presque jamais croisée avec la météo du jour. Résultat : on cherche vingt
minutes, on renonce, et on finit devant un dessin animé.

Papa Parfait fait une seule chose, et la fait vite : tu donnes ta ville et l'âge
de ton enfant, l'app te sort **les cinq meilleures sorties du jour**, classées,
avec la météo prise en compte. Pas de compte à créer pour ça.

### H2 — Qui je suis

Je m'appelle **Wassim Loumi**. J'habite Bruz, près de Rennes, et je travaille
dans le digital : [À COMPLÉTER : ta phrase de métier — ex. « consultant SEO,
j'aide des entreprises à être trouvées sur Google et dans les IA depuis X ans »].
[À COMPLÉTER : ta situation de parent, si tu veux la mettre en avant.]

[À COMPLÉTER : une ou deux phrases personnelles — l'âge de tes enfants, ce qui a
déclenché l'app, ce que tu fabriques d'autre. C'est ce paragraphe qui distingue
une page « à propos » d'une page vide.]

Je développe et fais tourner Papa Parfait seul. Si quelque chose ne marche pas,
c'est moi que tu as au bout de l'e-mail : **loumiwassim@gmail.com**.

### H2 — D'où viennent les sorties

Les événements viennent de **données publiques** : OpenAgenda (les agendas
déposés par les mairies, associations et lieux culturels) et DATAtourisme. La
météo vient d'un service de prévision, interrogée pour ta ville et la date
choisie.

Ce que l'app ajoute, c'est le tri. Pour chaque sortie, elle regarde :

- **l'âge de ton enfant** — une sortie annoncée « dès 6 ans » ne remonte pas pour
  un enfant de 2 ans ;
- **la distance** depuis ta ville, dans un rayon de 40 km ;
- **la météo du créneau** — s'il pleut, les sorties à l'abri passent devant ;
- **l'horaire réel** — une sortie déjà terminée quand tu ouvres l'app ne sert à
  rien.

Les cinq retenues sont affichées avec la raison de leur présence. Tu vois
pourquoi l'app te propose ça, tu n'as pas à lui faire confiance à l'aveugle.

### H2 — Où l'app fonctionne aujourd'hui

Papa Parfait est née en Bretagne et s'ouvre progressivement au reste de la
France. Les départements couverts à ce jour :

- **Bretagne** : Ille-et-Vilaine, Côtes-d'Armor, Morbihan, Finistère
- **Loire-Atlantique**, **Paris**, **Nord**, **Gironde**

Une zone n'est ouverte que si les agendas publics y ont vraiment de la matière —
c'est mesuré avant, pas supposé. Mieux vaut une carte avec des trous qu'une app
qui répond « rien ce jour-là » partout. Si ta ville manque, tu peux la demander
depuis l'app : ce sont ces demandes qui décident des prochaines ouvertures.

### H2 — Ce que l'app ne fait pas

- **Pas de publicité**, pas de traceur publicitaire, pas de profilage.
- **Pas de géolocalisation** : tu choisis ta ville dans une liste, ton téléphone
  ne transmet jamais sa position.
- **Aucune donnée sur tes enfants** au-delà de l'âge que tu indiques — ni prénom,
  ni date de naissance, ni photo.
- **Pas de compte obligatoire** : l'app marche sans. Le compte ne sert qu'à
  retrouver tes sorties gardées sur un autre appareil.

Le détail est dans la [politique de confidentialité](/confidentialite/).

### H2 — Le modèle économique, dit franchement

Papa Parfait est gratuite aujourd'hui. Le jour où elle se monétise, ce sera par
un achat dans l'application — **jamais par la publicité, jamais par la revente de
données**. Ce qui restera gratuit et ce qui deviendra payant n'est pas encore
tranché : ça se décidera avec les premiers utilisateurs. Je préfère le dire
maintenant que de le découvrir ensemble dans six mois.

### H2 — Une remarque, un bug, une ville à ouvrir ?

Écris-moi : **loumiwassim@gmail.com**. Je lis tout, et l'app avance avec les
retours reçus.

### CTA de fin de page

Bouton : **Trouver une sortie** → lien vers l'app.

---

## Bonus SEO / GEO — données structurées

À coller dans le `<head>` de la page (extension SEO → champ « code d'en-tête »,
ou bloc HTML personnalisé). Remplace les `[À COMPLÉTER]` avant publication.

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "AboutPage",
  "mainEntity": {
    "@type": "Person",
    "name": "Wassim Loumi",
    "jobTitle": "[À COMPLÉTER : ton métier]",
    "email": "loumiwassim@gmail.com",
    "address": { "@type": "PostalAddress", "addressLocality": "Bruz", "addressCountry": "FR" },
    "sameAs": ["[À COMPLÉTER : URL LinkedIn]", "[À COMPLÉTER : autres profils publics]"]
  },
  "about": {
    "@type": "MobileApplication",
    "name": "Papa Parfait",
    "applicationCategory": "LifestyleApplication",
    "operatingSystem": "Web, Android",
    "offers": { "@type": "Offer", "price": "0", "priceCurrency": "EUR" }
  }
}
</script>
```

---

## Les deux autres corrections de menu

1. **« Blog » (`href="#"`)** — à **retirer du menu** tant qu'il n'y a pas
   d'articles. Un lien mort dans une navigation coûte deux fois : le visiteur
   clique dans le vide, et le crawl tourne à vide. On le remet le jour où trois
   articles sont publiés, pas avant.
2. **Le CTA vers l'app** peut maintenant envoyer droit au résultat :
   `https://papa-parfait-web.loumiwassim.workers.dev/?ville=rennes&age=3`
   La ville accepte l'identifiant ou le nom (`rennes`, `saint-brieuc`,
   `Saint-Malo`), l'âge va de 0 à 5. Sans paramètre, l'app demande les deux
   réglages elle-même — le lien nu reste valable.
   Utile pour une page ciblée (« sorties enfants à Nantes » → `?ville=nantes`).
