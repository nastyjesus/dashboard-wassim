---
description: Snapshot facturation SOWPHOTO — CA du mois, impayés, top clients, prochaines échéances
---

Génère un dashboard rapide de la facturation SOWPHOTO (lecture seule, ~10 secondes).

**Période** : $ARGUMENTS (ex: "ce mois", "ce trimestre", "année en cours"). Si vide = mois courant.

**Étapes** :

1. Run `C:\Users\sowph\qonto-scripts\venv\Scripts\python.exe C:\Users\sowph\qonto-scripts\weekly_audit.py --since YYYY-MM-DD --pretty` (date dérivée de la période).

2. **Calcule les KPIs** depuis le JSON :
   - **CA HT facturé période** (somme total_ht des factures non canceled)
   - **CA HT encaissé** (somme HT des factures status=paid)
   - **Reste à encaisser TTC** (somme TTC des unpaid)
   - **Nombre de factures** par statut (paid / unpaid / canceled)
   - **Délai moyen de paiement** (pour les paid : moyenne (paid_at - issue_date) en jours)
   - **Impayés > 30 jours** (count + montant)
   - **Prochaines échéances 7 jours** (unpaid avec due_date dans les 7 prochains jours)

3. **Top 5 clients par CA HT** sur la période.

4. **Comparaison vs mois précédent** : CA HT, nb factures, taux de paiement (paid / total).

5. **Cross-check Notion "👥 Clients SEO"** : combien de clients actifs avec Mois facturés non rempli pour le mois courant ? (= signal "à facturer encore")

6. **Output Markdown** sous forme de tableaux clairs :
   - Section 1 : KPIs principaux
   - Section 2 : Top clients
   - Section 3 : Alertes (impayés, échéances proches, SEO non facturés)
   - Section 4 : Recommandations d'actions (ex: "Lance /relance-impayes pour les 3 factures > 30j", "Lance /factures-seo-mois pour les 2 clients SEO non facturés")

**Note** : 100% safe (READ Qonto + Notion uniquement).
