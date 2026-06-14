---
description: Audit cohérence Qonto → Notion (factures manquantes, orphelines, impayés > 30j)
---

Audit complet cohérence entre Qonto et Notion pour la facturation SOWPHOTO.

**Période** : $ARGUMENTS (ex: "3 derniers mois", "depuis 2026-01-01", "année en cours"). Si vide = 90 derniers jours.

**Étapes** :

1. Run `C:\Users\sowph\qonto-scripts\venv\Scripts\python.exe C:\Users\sowph\qonto-scripts\weekly_audit.py --since YYYY-MM-DD --pretty`.

2. Lit la base **"📊 Suivi contrats"** Notion (data_source_url `collection://7f60c407-b438-43fe-b7b4-1b77188db582`), récupère tous les `Numéro Facture` présents.

3. Lit la base **"👥 Clients SEO"** Notion (data_source_url `collection://ba7812b1-908f-4a21-8ff8-3edaf7a409b2`), pour chaque client Actif récupère `Mois facturés` et `Mois payés`.

4. **4 cross-checks** :
   - **A. Factures Qonto SANS ligne Suivi contrats** → "MANQUANT DANS NOTION" (lignes à créer)
   - **B. Lignes Suivi contrats AVEC Numéro Facture qui n'existe pas dans Qonto** → "ORPHELIN DANS NOTION"
   - **C. Factures Qonto status=paid dont la ligne Notion n'a PAS ` Paiement OK` cochée** → "PAIEMENT NON SYNCHRO" (lance /sync-paiements pour corriger)
   - **D. Factures Qonto unpaid avec days_late > 30** → "IMPAYÉ > 30 JOURS" (à relancer)
   - **E. (Bonus) Clients SEO actifs où Mois facturés ≠ réalité Qonto** → "ÉCART MOIS FACTURÉS SEO"

5. **Output** :
   - Tableau récap par catégorie (nombre + montant total impacté)
   - Pour chaque écart : numéro de facture / client / date / montant / URL Qonto
   - Recommandations d'actions (ex: "Lance /sync-paiements depuis 2026-XX-XX pour réparer C")
   - Option : créer une page Notion "Audit Qonto-Notion - [date]" sous "📩 Sowphoto" avec le rapport complet — demande à Wassim s'il la veut.

**Note** : 100% safe (READ uniquement, aucune modif Qonto ni Notion sans validation explicite). Pas de validation requise pour l'audit lui-même.
