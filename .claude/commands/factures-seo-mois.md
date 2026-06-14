---
description: Facture les clients SEO mensuels (Notion → Qonto) pour un mois donné
---

Lance le workflow de facturation SEO mensuelle pour SOWPHOTO.

**Mois cible** : $ARGUMENTS (ex: "Mai 2026", "juin", "ce mois", "mois dernier"). Si vide, demande à Wassim.

**Étapes obligatoires** :

1. Lit la base Notion **"👥 Clients SEO"** (data_source_url `collection://ba7812b1-908f-4a21-8ff8-3edaf7a409b2`).
   - Filtre : Statut=Actif ET le mois cible n'est PAS dans `Mois facturés`.
   - Récupère pour chaque client : Montant mensuel HT, et signale si vide.
   - **Exclusions implicites** : Biolunes (arrêt juin), Crezabeille (one-shot pas mensuel), Agence Simco (pas de facturation), Wassim Loumi (perso). Confirme à Wassim si une exclusion est ambiguë.

2. Cross-check chaque client avec Qonto via `python C:\Users\sowph\qonto-scripts\find_client.py <nom>` :
   - Si match : récupère l'UUID client Qonto.
   - Si pas de match : il faudra créer la fiche client (proposer création avec POST /clients + PATCH `tax_identification_number` via SIREN INSEE — voir reference_qonto_api_v2.md).

3. **Présente la preview** : tableau client / montant HT / TVA 20% / TTC / client Qonto existe ou à créer.
   Libellé standard = **"Pilotage SEO + GEO + CRO — [Mois Année]"** sauf si Wassim demande autre chose.

4. **Attends le "go" explicite** de Wassim avant tout POST Qonto. JAMAIS de POST sans validation (règle absolue, cf. feedback_irreversible_writes.md).

5. Sur "go" :
   - Crée les clients Qonto manquants (avec SIREN + vat_number).
   - POST les factures via `python C:\Users\sowph\qonto-scripts\invoice_create.py draft` puis `post`, ou directement via le helper `qonto_client.post('/client_invoices', payload)`.
   - Attention : `payment_methods.iban` imbriqué, et le client doit avoir `tax_identification_number` posé sinon 422.

6. **Update Notion** systématiquement après chaque POST :
   - Coche le mois dans `Mois facturés` de la fiche Clients SEO (multi_select, format JSON array string).
   - Ajoute une ligne dans **"📊 Suivi contrats"** (data_source_url `collection://7f60c407-b438-43fe-b7b4-1b77188db582`) :
     - Type=SEO, Type client=Agence, Tarif=HT, Numéro Facture=F-2026-XXXXX, Date=issue_date, ` Facture envoyée`="__YES__", ` Traitement OK=Livrée`="__YES__".
     - Attention espaces en début pour 4 champs : ` Acompte`, ` Facture envoyée`, ` Paiement OK`, ` Traitement OK=Livrée`.

7. **Récap final** : tableau des factures créées (numéros, TTC, URLs) + total HT/TVA/TTC + statut update Notion.

**Défauts SOWPHOTO** : TVA 20%, due_date=issue_date (à réception), IBAN auto via /organization, locale "fr".
