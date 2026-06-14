---
description: Pipeline design complet — Taste → UI UX Pro Max → Huashu → Impeccable → Playwright. Engage les 5 outils en un coup sur un brief ou une URL.
---

Orchestre les 5 outils design en pipeline sur un seul brief. Chaque étape passe son output à la suivante.

**Input** : $ARGUMENTS
- URL existante (ex: `https://exemple.com`) → mode **redesign** (audit-first).
- Brief texte (ex: `landing page SaaS pour mon outil SEO`) → mode **création**.
- Si vide : demander le brief avant de lancer.

**Détection mode** : si $ARGUMENTS contient une URL → redesign. Sinon → création.

---

## Pipeline (exécuter dans l'ordre, ne pas paralléliser — chaque étape dépend de la précédente)

### Étape 1 — Direction design (skill `design-taste-frontend`)
Invoquer le skill **design-taste-frontend** avec le brief.
- Mode redesign : audit-first de l'URL (capturer le rendu actuel via Playwright `browser_navigate` + `browser_take_screenshot` AVANT, lister les problèmes).
- Mode création : inférer la bonne direction design depuis le brief.
- **Output attendu** : direction design choisie (mood, références, anti-slop check) + pré-flight.

### Étape 2 — Système design (skill `ui-ux-pro-max`)
Passer la direction de l'étape 1 au skill **ui-ux-pro-max**.
- Choisir : palette couleurs, font pairing, style (glassmorphism / minimal / bento / etc. selon direction), layout, espacement.
- **Output attendu** : design system concret (tokens couleurs, fonts, échelle d'espacement, composants clés).

### Étape 3 — Proto HTML hi-fi (skill `huashu-design`)
Passer le système de l'étape 2 au skill **huashu-design**.
- Produire un proto HTML haute-fidélité (un seul fichier autonome, pas de web design tropes).
- Sortie fichier : `design-all-output/proto.html` (créer le dossier).
- **Output attendu** : `proto.html` rendu fidèle au système.

### Étape 4 — Polish final (skill `impeccable`)
Passer `proto.html` au skill **impeccable**.
- Audit + polish : hiérarchie visuelle, micro-interactions, accessibilité, responsive, copy.
- Éditer `proto.html` en place.
- **Output attendu** : `proto.html` poli.

### Étape 5 — Vérif rendu (Playwright MCP)
- `browser_navigate` vers `file:///` + chemin absolu de `proto.html`.
- `browser_resize` desktop (1440x900) → `browser_take_screenshot` → `design-all-output/render-desktop.png`.
- `browser_resize` mobile (390x844) → `browser_take_screenshot` → `design-all-output/render-mobile.png`.
- `browser_console_messages` : vérifier 0 erreur.

---

## Output final (Markdown)
- Résumé direction design (étape 1).
- Système retenu : couleurs / fonts / style (étape 2).
- Liens fichiers : `proto.html`, `render-desktop.png`, `render-mobile.png`.
- Mode redesign : tableau **avant / après** (problèmes audités → corrigés).
- Erreurs console Playwright (si présentes).

**Note** : génère des fichiers dans `design-all-output/`. Aucune action destructive hors ce dossier.
