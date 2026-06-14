# SOWPHOTO — Contexte Wassim Loumi

## Identité
- **Nom** : Wassim LOUMI
- **Société** : SARL SOWPHOTO
- **Email** : loumiwassim@gmail.com
- **Activités** : Photographie (mariage, portrait, corporate, immobilier), SEO/GEO/CRO, Formation, Site Web

## Outils & Intégrations

### Facturation — Qonto
- Compte Qonto SOWPHOTO (API v2)
- Scripts locaux PC : `C:\Users\sowph\qonto-scripts\`
  - `weekly_audit.py` — audit + liste factures
  - `daily_paid_sync.py` — détection paiements
  - `invoice_create.py` — création factures
  - `invoice_status.py` — statut facture
  - `find_client.py` — recherche client Qonto
  - Venv : `C:\Users\sowph\qonto-scripts\venv\Scripts\python.exe`
  - Output : `C:\Users\sowph\qonto-scripts\output\`

### Notion
- **"📊 Suivi contrats"** — `collection://7f60c407-b438-43fe-b7b4-1b77188db582`
  - Champs : Clients, Type, Type client, Tarif, Numéro Facture, Date
  - Champs avec espace en début (tri Notion) : ` Acompte`, ` Facture envoyée`, ` Paiement OK`, ` Traitement OK=Livrée`
  - Valeur booléenne : `"__YES__"` pour coché
- **"👥 Clients SEO"** — `collection://ba7812b1-908f-4a21-8ff8-3edaf7a409b2`
  - Champs : Statut (Actif/Inactif), Montant mensuel HT, Mois facturés, Mois payés, Prochaine action

### Google Calendar
- Calendar principal : `loumiwassim@gmail.com`
- Convention prestas one-shot : préfixe `[PRESTA] ` dans le titre d'un event

## Clients SEO actifs
- Oncourtiz
- Safimeex
- Optel
- Courtier sur mesure (AGMD)

## Exclusions implicites (facturation SEO)
- Biolunes — arrêt juin
- Crezabeille — one-shot, pas mensuel
- Agence Simco — pas de facturation
- Wassim Loumi — perso

## Règles absolues
- **Jamais de POST Qonto sans "go" explicite de Wassim** (irréversible)
- **Jamais de création d'avoir sans "go" explicite** (irréversible)
- Toujours présenter une preview avant toute action d'écriture
- Pour les actions READ : pas de validation requise

## Défauts SOWPHOTO (facturation Qonto)
- TVA : 20%
- due_date = issue_date (paiement à réception)
- IBAN : auto via `/organization`
- Locale : `fr`
- Libellé SEO standard : `"Pilotage SEO + GEO + CRO — [Mois Année]"`

## Types de prestations (select Notion)
Mariage / Portrait Corporate / Portrait Particulier / Corporate / Immobilier / Production / Site Web / SEO / Formation / Commission BNI / Campagne ADS

## API INSEE (SIREN)
- Endpoint : `https://recherche-entreprises.api.gouv.fr/search?q=<nom>&per_page=3`
- TVA intracom FR : `FR + ((12 + 3 * (SIREN % 97)) % 97 zéropadé 2 chiffres) + SIREN`

## Numérotation factures
- Factures : `F-YYYY-XXXXX`
- Avoirs : `A-YYYY-XXX`

## Règle création client Qonto
- PATCH `tax_identification_number` (SIREN) + `vat_number` obligatoires après POST /clients
- Sans ces champs → 422 sur la première facture

## ⚠️ Piège connu — Qonto API
- Créer un avoir : utiliser `invoice_id` (PAS `client_invoice_id` → 500 PostgreSQL)
