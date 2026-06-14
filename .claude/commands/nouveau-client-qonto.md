---
description: Crée un nouveau client dans Qonto avec SIREN auto-récupéré via INSEE
---

Crée une fiche client Qonto SOWPHOTO complète et fiscalement prête (avec SIRET + TVA intracom) pour pouvoir le facturer ensuite.

**Cible** : $ARGUMENTS (nom du client, ex: "AGMD Courtier sur mesure", "MANON LEFAS"). Si vide, demande.

**Étapes** :

1. **Cross-check existence** : run `python C:\Users\sowph\qonto-scripts\find_client.py <nom>` pour vérifier qu'il n'existe pas déjà. Si match : signale et stop (pas créer de doublon).

2. **Récupère SIREN via API INSEE publique** :
   ```
   https://recherche-entreprises.api.gouv.fr/search?q=<nom>&per_page=3
   ```
   Présente les 1-3 résultats avec SIREN, raison sociale légale, ville, code APE. Si plusieurs : demande à Wassim de choisir. Si 0 : demande à Wassim le SIREN manuellement OU propose un scrape mentions légales si le site est connu.

3. **Calcule la TVA intracom** : `FR + ((12 + 3 * (SIREN % 97)) % 97 zéropadé sur 2) + SIREN`.

4. **Récupère l'adresse** : demande à Wassim (ou propose scrape mentions légales du site web si fourni).

5. **Demande type client** : `Photo` (clients individuels mariage/portrait/etc.) ou `Agence` (B2B SEO/site/formation). Demande aussi l'email de contact.

6. **Construit le payload POST /clients** :
   ```json
   {
     "type": "company",
     "name": "<NOM LÉGAL ou NOM COMMERCIAL - Contact si pertinent>",
     "email": "<email>",
     "currency": "EUR",
     "locale": "fr",
     "billing_address": {
       "country_code": "FR",
       "street_address": "...",
       "zip_code": "...",
       "city": "..."
     }
   }
   ```
   Si individuel : `type=individual` avec first_name + last_name (et `first_name="À compléter"` si manquant, cf. règle).

7. **Présente la preview** + attends "go".

8. Sur "go" :
   - POST /clients via `qonto_client.post('/clients', payload)`.
   - PATCH /clients/{id} avec `tax_identification_number` (=SIREN) ET `vat_number` (=TVA intracom) — sinon les futures factures planteront en 422.
   - Vérifie via GET que les 2 champs sont posés.

9. **Récap** : nom + UUID + email + tin_number + vat_number + adresse. Confirme que le client est prêt à être facturé.

**Note** : aucune mise à jour Notion (pas dans la base Clients SEO sauf si Wassim demande explicitement).
