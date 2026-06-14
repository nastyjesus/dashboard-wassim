---
description: Liste les factures impayées en retard et drafte des emails de relance
---

Identifie les factures Qonto SOWPHOTO impayées dont l'échéance est dépassée, puis drafte des emails de relance graduées (J+7, J+15, J+30, J+45) prêts à copier-coller.

**Seuil** : $ARGUMENTS (ex: "7 jours", "15 jours", "tout retard"). Si vide = tout retard (1 jour ou plus).

**Étapes** :

1. Run `C:\Users\sowph\qonto-scripts\venv\Scripts\python.exe C:\Users\sowph\qonto-scripts\weekly_audit.py --since 2026-01-01 --pretty`.

2. Filtre les factures avec `status=unpaid` ET `days_late > seuil`.

3. **Présente le tableau de relance** : Numéro / Client / Date émission / Échéance / Jours retard / Montant TTC / URL paiement Qonto. Trie par jours de retard décroissant.

4. **Pour chaque facture, classe la sévérité** :
   - J+1 à J+7 : relance douce (rappel courtois)
   - J+8 à J+15 : relance ferme (mention de l'échéance dépassée)
   - J+16 à J+30 : relance escalade (mention pénalités de retard cf. mentions légales Qonto par défaut)
   - J+31+ : relance pré-contentieuse (mention mise en demeure prochaine)

5. **Drafte un email de relance** par facture (template adapté à la sévérité) :
   - Sujet : "Rappel - Facture [numéro] échue le [date]"
   - Corps : ton adapté à la sévérité, rappel des montants, lien URL Qonto pour paiement
   - Signature Wassim LOUMI / SARL SOWPHOTO

6. **Cross-check Notion** "👥 Clients SEO" : si le client est dans la base SEO et a un email connu, propose envoi via Gmail draft (avec create_draft MCP Gmail). Sinon, affiche le draft pour copier-coller.

7. **Demande à Wassim** : "Tu veux que je crée des drafts Gmail pour les N relances ? Ou tu copies-colles juste ?" → attendre validation.

8. **Récap final** : nombre de factures en retard / montant total à recouvrer / liste des drafts créés ou textes prêts.

**Note** : aucun POST Qonto, aucune modif Notion. Que de la lecture + draft.
