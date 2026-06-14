---
description: Facture une prestation one-shot (photo, formation, site web, etc.) interactivement
---

Crée une facture Qonto SOWPHOTO pour une prestation one-shot (photo, formation, site web, audit, etc.).

**Si arguments fournis** : $ARGUMENTS (ex: "Mariage Dupont 1500€", "Formation Cowork Manon 300€", "Phase 2 site Manon 1200€"). Sinon demande à Wassim les infos.

**Étapes obligatoires** :

1. **Collecte les infos** (depuis args ou en demandant à Wassim) :
   - Client (nom ou raison sociale)
   - Montant HT (€)
   - Libellé exact à mettre sur la facture
   - Type (Mariage / Portrait Corporate / Portrait Particulier / Corporate / Immobilier / Production / Site Web / SEO / Formation / Commission BNI / Campagne ADS)
   - Date de prestation si différente d'aujourd'hui

2. **Cross-check Qonto** : `python C:\Users\sowph\qonto-scripts\find_client.py <nom>`.
   - Si trouvé : récupère UUID.
   - Si pas trouvé : créer la fiche (demande adresse, email) puis PATCH `tax_identification_number` (SIREN via INSEE API `https://recherche-entreprises.api.gouv.fr/search?q=<nom>`).

3. **Présente la preview complète** : client + libellé + HT + TVA 20% + TTC + IBAN SOWPHOTO + date émission + échéance.

4. **Attends "go" explicite** avant POST (règle absolue cf. feedback_irreversible_writes.md).

5. Sur "go" :
   - POST `/client_invoices` via le helper Python (`payment_methods.iban` imbriqué, items avec quantity/unit_price/vat_rate en strings).
   - Récupère numéro F-2026-XXXXX + URL.

6. **Update Notion "📊 Suivi contrats"** (data_source_url `collection://7f60c407-b438-43fe-b7b4-1b77188db582`) :
   - Nouvelle ligne avec : Clients, Type, Type client (Photo si presta photo, Agence sinon), Tarif prestation (HT), Numéro Facture, Date, ` Facture envoyée`="__YES__", ` Traitement OK=Livrée`="__YES__" (sauf si Wassim précise que la prestation n'est pas livrée).
   - Si Type="Formation" et que l'option n'existe pas dans le select, `notion-update-data-source` ALTER COLUMN d'abord (cf. project_qonto_scripts.md pour la liste complète des options Type avec couleurs).

7. **Récap** : numéro de facture + URL paiement + ligne Notion créée.

**Défauts SOWPHOTO** : TVA 20%, due_date=issue_date (à réception), IBAN auto.
