---
description: Statut + paiement d'une facture Qonto par numéro (F-2026-XXXXX) ou UUID
---

Récupère le statut complet d'une facture Qonto SOWPHOTO.

**Cible** : $ARGUMENTS (ex: "F-2026-05650", "019e2f95-...", ou nom du client "VERTON").

**Étapes** :

1. Si $ARGUMENTS ressemble à un numéro `F-...` ou UUID : run `C:\Users\sowph\qonto-scripts\venv\Scripts\python.exe C:\Users\sowph\qonto-scripts\invoice_status.py <ARGUMENTS>`.

2. Si $ARGUMENTS est un nom client : d'abord `python find_client.py <nom>`, puis liste les factures de ce client via `qonto_client.get_all('/client_invoices', items_key='client_invoices')` filtré côté Python sur `client.id`. Affiche un tableau récent → ancien.

3. Pour chaque facture affichée : statut (paid / unpaid / canceled), montant HT / TTC / payé / restant dû, dates émission / échéance / paiement, jours de retard si applicable, URL paiement Qonto.

4. **Bonus** : compare avec Notion **"📊 Suivi contrats"** — flag si le ` Paiement OK` Notion ne correspond pas au statut Qonto.

**Note** : 100% safe (READ uniquement).
