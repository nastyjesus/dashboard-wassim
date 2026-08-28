# Papa Parfait — app mobile

**Papa Parfait, le QG des papas** : sorties pour les enfants, idées pour le
couple, bien-être du papa, et la tribu. Ton complice (« entre papas, on se
comprend »), zone de lancement Bretagne (4 départements).
L'intelligence sorties (sources open data, scoring, météo) vit dans le
worker `workers/on-sort` — l'app affiche.

## Les 4 onglets

1. **🎈 Sorties** — le moteur « On sort ? » : chips de dates, météo du jour,
   la « préférée » mise en avant puis le reste du top 5, avec les raisons du
   worker (« À l'abri s'il pleut », « 3-5 ans », « Gratuit ») + fiche détail.
2. **❤️ Couple** — la mission de la semaine (rotation auto), teasers radar
   date night et rappels de dates (à brancher avec les partenariats).
3. **💪 Moi** — check-in « batterie papa » en un tap (local, 7 jours
   d'historique), défi de la semaine, micro-conseil.
4. **🔥 Tribu** — maquette du fil communautaire (posts d'exemple marqués) ;
   le backend social (comptes, posts, modération) est le prochain chantier.

L'onboarding (ville bretonne + âge de l'enfant) est mémorisé en local.
Navigation volontairement sans dépendance (état local + barre d'onglets
maison).

## Lancer

```bash
cd apps/on-sort
npm install
npx expo start        # QR code → app Expo Go sur ton téléphone
npm run web           # ou aperçu navigateur
```

Le worker est déjà déployé (`https://on-sort-poc.loumiwassim.workers.dev`),
donc l'app fonctionne immédiatement, y compris sur téléphone via Expo Go.

## Structure

- `App.js` — racine : profil chargé ? onboarding : accueil/fiche
- `src/config.js` — URL du worker, villes proposées, âges
- `src/api.js` — client `/top` (timeout 15 s)
- `src/dates.js` — chips de dates dédoublonnées
- `src/storage.js` — profil en AsyncStorage (tolérant aux échecs)
- `src/theme.js` — design tokens (crème + encre + terracotta)
- `src/screens/` et `src/components/`

## Reste à faire (week-end 3 — monétisation & polish)

- AdMob (bannière discrète) + RevenueCat (premium : illimité, alertes, sans pub)
- Géolocalisation réelle (expo-location) au lieu des villes en dur
- Icône + splash + fiche ASO, comptes stores (week-end 4)
