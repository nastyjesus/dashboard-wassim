---
description: Export CSV des factures Qonto pour expert-comptable (format standard)
---

Génère un fichier CSV des factures Qonto SOWPHOTO au format compatible expert-comptable.

**Période** : $ARGUMENTS (ex: "Mai 2026", "Q2 2026", "année 2026", "depuis 2026-01-01"). Si vide = mois courant.

**Étapes** :

1. Run `C:\Users\sowph\qonto-scripts\venv\Scripts\python.exe C:\Users\sowph\qonto-scripts\weekly_audit.py --since YYYY-MM-DD --pretty` avec la date dérivée.

2. **Filtre** : factures status=paid OU unpaid (exclut canceled par défaut, sauf si Wassim demande de les inclure).

3. **Génère le CSV** avec ces colonnes (format expert-comptable standard FR) :
   - Date émission (YYYY-MM-DD)
   - Numéro facture
   - Client (nom raison sociale)
   - SIREN client (tax_identification_number Qonto)
   - TVA intracom client (vat_number)
   - Libellé prestation (premier item.title de la facture)
   - Montant HT
   - Taux TVA (%)
   - Montant TVA
   - Montant TTC
   - Statut (paid / unpaid)
   - Date paiement (si paid)
   - URL Qonto (référence)

4. **Sauvegarde** dans `C:\Users\sowph\qonto-scripts\output\` avec nom horodaté + période : `export_compta_<période>_<timestamp>.csv`.

5. **Récap** : nombre de lignes exportées, total HT / TVA / TTC, chemin du fichier.

6. **Propose à Wassim** :
   - Ouvrir le fichier dans Excel pour vérif
   - Envoyer en pièce jointe par Gmail à l'expert-compta (si email connu — demander si pas)
   - Ajouter une ligne récap dans Notion (page Sowphoto par exemple)

**Format CSV** : séparateur `;` (standard FR), encoding `UTF-8 BOM` (compatible Excel FR).

**Note** : 100% safe (READ Qonto + write file local).
