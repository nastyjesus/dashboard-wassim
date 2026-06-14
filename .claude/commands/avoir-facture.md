---
description: Crée un avoir (credit_note) pour annuler totalement une facture Qonto
---

Annule une facture Qonto SOWPHOTO en créant un avoir (`credit_note`) du montant total. La facture passera automatiquement en `status: canceled`.

**Cible** : $ARGUMENTS (numéro F-2026-XXXXX ou UUID). Si vide, demande.

**Étapes** :

1. **Récupère la facture** : `qonto_client.get(f'/client_invoices/{id}')` pour vérifier qu'elle existe et qu'elle n'est PAS déjà canceled. Si déjà annulée ou payée : signale et stop.

2. **Présente la preview de l'avoir** :
   - Numéro facture cible
   - Client
   - Montant total HT / TVA / TTC à avoir
   - Libellé items mirror (titre + quantité + prix unitaire + vat_rate)
   - Issue date de l'avoir = aujourd'hui

3. **Demande à Wassim un motif** (à inclure dans le titre de l'item de l'avoir, ex: "Régularisation tarif", "Erreur de facturation", "Demande client"). Le titre final sera : `"Avoir total sur facture <F-...> — <motif>"`.

4. **Attends "go" explicite** (création d'avoir = irréversible aussi, même règle que les factures).

5. Sur "go" :
   - POST `/credit_notes` via Python avec le payload :
     ```json
     {
       "invoice_id": "<UUID FACTURE>",
       "issue_date": "YYYY-MM-DD",
       "items": [
         {
           "title": "Avoir total sur facture F-XXX — <motif>",
           "quantity": "<même qté que facture>",
           "unit_price": {"value": "<même PU HT>", "currency": "EUR"},
           "vat_rate": "<même>"
         }
       ]
     }
     ```
   - ⚠️ Le champ est **`invoice_id`** (PAS `client_invoice_id` qui donne 500 PostgreSQL).
   - Vérifie via GET /client_invoices/{id} que `status` est passé à `"canceled"`.

6. **Update Notion "📊 Suivi contrats"** :
   - **Par défaut (convention Wassim)** : skip totalement — supprime la ligne existante de la facture annulée si elle existait (sinon laisser, c'est mieux qu'un fantôme).
   - Si Wassim demande l'audit trail : ajouter une ligne pour l'avoir avec Tarif négatif (ex: -300€) et Numéro Facture = A-2026-XXX.

7. **Récap** : numéro avoir (A-YYYY-XXX), URL PDF, confirmation que la facture cible est canceled, état Notion final.

**Note** : pour les rectifications partielles (changer juste le montant sans annuler totalement), passer par UI Qonto manuellement ou faire un avoir total puis recréer une nouvelle facture corrigée.
