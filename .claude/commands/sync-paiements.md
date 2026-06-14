---
description: Détecte les factures Qonto payées et sync vers Notion Suivi contrats + Clients SEO
---

Sync les paiements Qonto → Notion (Suivi contrats + Clients SEO si applicable).

**Période** : $ARGUMENTS (ex: "depuis hier", "depuis 2026-05-01", "7 derniers jours"). Si vide = depuis hier.

**Étapes** :

1. Run `C:\Users\sowph\qonto-scripts\venv\Scripts\python.exe C:\Users\sowph\qonto-scripts\daily_paid_sync.py --since YYYY-MM-DD --pretty` avec la date dérivée de $ARGUMENTS.

2. Pour chaque facture dans le JSON `paid_invoices` :
   a. Cherche la ligne dans **"📊 Suivi contrats"** Notion (data_source_url `collection://7f60c407-b438-43fe-b7b4-1b77188db582`) par `Numéro Facture` exact.
   b. Si trouvée : update ` Paiement OK` = `"Paiement OK"` (attention espace en début !).
   c. Si pas trouvée : signale dans le rapport final ("Facture F-XXX payée mais introuvable dans Suivi contrats").
   d. Si le `client_name` correspond à un client SEO connu (Oncourtiz / Safimeex / Optel / Courtier sur mesure / Biolunes / Crezabeille / Agence Simco) : update aussi la fiche **"👥 Clients SEO"** Notion (data_source_url `collection://ba7812b1-908f-4a21-8ff8-3edaf7a409b2`) — ajoute le mois de `paid_at` dans `Mois payés` (multi_select, format JSON array string en préservant les valeurs existantes).

3. **Output final** :
   - N paiements détectés
   - N lignes Suivi contrats mises à jour
   - N fiches Clients SEO mises à jour
   - Liste des éventuels écarts (factures payées sans ligne Notion)

**Note** : 100% safe (read Qonto + write Notion uniquement, aucun POST Qonto). Pas de validation requise.
