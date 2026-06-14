---
description: Bilan complet d'un client (toutes ses factures, total facturé/payé/dû, historique)
---

Bilan détaillé d'un client SOWPHOTO sur l'ensemble de son historique Qonto.

**Cible** : $ARGUMENTS (nom du client, fuzzy search). Si vide, demande.

**Étapes** :

1. **Cross-check Qonto** : `python C:\Users\sowph\qonto-scripts\find_client.py <nom>`. Si plusieurs matches, demande à Wassim de choisir l'ID exact.

2. **Récupère toutes les factures** : `qonto_client.get_all('/client_invoices', items_key='client_invoices')` filtré côté Python sur `client.id`.

3. **Fiche client** : nom, email, adresse, SIREN (tax_identification_number), TVA intracom, type, locale.

4. **Tableau historique factures** (trié récent → ancien) :
   - Date émission / Numéro / Libellé item / HT / TVA / TTC / Statut / Payé le / Days_late si unpaid

5. **Synthèse financière** :
   - Total HT facturé (vie entière)
   - Total HT encaissé (paid)
   - Total HT en attente (unpaid non canceled)
   - Total HT annulé (canceled)
   - Nb factures par statut
   - Délai moyen de paiement (sur les paid)
   - Date dernière facture / Date dernier paiement

6. **Cross-check Notion** :
   - "👥 Clients SEO" : si le client y existe → affiche son statut, type programme, Montant mensuel HT, Mois facturés, Mois payés, Prochaine action.
   - "📊 Suivi contrats" : liste les lignes Suivi contrats associées au client (par nom Clients), avec Type, Tarif, Numéro Facture, Statut envoi/livraison/paiement.

7. **Alertes** :
   - Impayés > 30j
   - Écarts Qonto vs Notion (factures Qonto sans ligne Suivi contrats, ou inverse)
   - Mois facturés non synchros avec Mois payés

8. **Output Markdown** sectionné, avec liens cliquables vers les URLs Qonto et Notion.

**Note** : 100% safe (READ uniquement).
