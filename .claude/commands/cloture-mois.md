---
description: Clôture mensuelle complète (SEO mensuel + prestas [PRESTA] du calendar)
---

Clôture mensuelle complète de la facturation SOWPHOTO — combine les abonnements SEO récurrents ET les prestations one-shot identifiées dans Google Calendar (préfixe `[PRESTA] `).

**Mois cible** : $ARGUMENTS (ex: "Mai 2026", "mois dernier", "juin"). Si vide = mois courant.

**Étapes obligatoires** :

1. **Source 1 — SEO mensuel** : applique la logique de `/factures-seo-mois` pour le mois cible :
   - Lit "👥 Clients SEO" (collection://ba7812b1-908f-4a21-8ff8-3edaf7a409b2), Statut=Actif ET mois ∉ Mois facturés.
   - Récupère Montant mensuel HT.

2. **Source 2 — Prestas Calendar** : list_events sur le calendar `loumiwassim@gmail.com` pour la période du mois cible, filtre les events dont le titre commence par `[PRESTA] `.
   - Si aucun [PRESTA] trouvé : signale à Wassim et propose un scan élargi des candidats potentiels (events qui ressemblent à des prestas même sans le préfixe) pour passe rétro de renommage.

3. **Source 3 — Qonto déjà émises** : run `python C:\Users\sowph\qonto-scripts\weekly_audit.py --since YYYY-MM-01 --pretty` pour récupérer les factures déjà émises ce mois, et dédupliquer (ne pas re-proposer ce qui est déjà facturé).

4. **Présente la preview combinée** : 2 tableaux distincts :
   - **A. SEO mensuelles à facturer** : Client / Montant HT / Libellé proposé "Pilotage SEO + GEO + CRO — [Mois Année]"
   - **B. Prestations one-shot à facturer** : Date / Titre event / Client (à confirmer/remplir si pas évident depuis le titre) / Tarif HT (à demander à Wassim, le calendar n'a pas les tarifs)
   - Total prévisionnel HT + TVA + TTC en bas.

5. **Pour chaque presta one-shot, demande à Wassim** : client (cross-check Qonto via find_client.py), tarif HT exact, libellé final (si différent du titre calendar).

6. **Attends "go" explicite** avant tout POST (règle absolue).

7. Sur "go" :
   - Crée clients Qonto manquants (avec SIREN INSEE + PATCH tax_identification_number).
   - POST toutes les factures (SEO + photo) une par une avec rate limit 1s.
   - Update Notion systématiquement :
     - "👥 Clients SEO" : coche le mois dans Mois facturés (pour SEO)
     - "📊 Suivi contrats" : ligne par facture (Type SEO/Photo/etc. selon, Type client Agence/Photo, Tarif, Numéro Facture, Date, ` Facture envoyée`=YES, ` Traitement OK=Livrée`=YES par défaut)

8. **Récap final** : tableau de toutes les factures créées (numéros, montants, URLs) + totaux + statut Notion + checklist factures envoyées par email (URL pay.qonto à transmettre clients).
