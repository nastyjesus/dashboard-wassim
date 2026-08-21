# On sort ? — app mobile (week-end 2)

App Expo du side hustle **« On sort ? »** : je choisis un jour, l'app me
propose le top 5 des sorties famille autour de chez moi, météo comprise.
Toute l'intelligence (sources open data, scoring, météo) vit dans le worker
`workers/on-sort` — l'app ne fait qu'afficher.

## Les 3 écrans

1. **Onboarding** — votre coin (8 villes d'Ille-et-Vilaine) + l'âge de
   l'enfant. Mémorisé en local, modifiable depuis l'accueil.
2. **Accueil** — chips de dates (aujourd'hui / demain / week-end), météo du
   jour, la « préférée » mise en avant puis le reste du top 5, avec les
   raisons du worker (« À l'abri s'il pleut », « 3-5 ans », « Gratuit »).
3. **Fiche** — lieu, horaires, âge, description, « Voir l'événement » et
   « Y aller » (plan).

Navigation volontairement sans dépendance (état local) : 3 écrans, pas
besoin de react-navigation pour le POC.

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
