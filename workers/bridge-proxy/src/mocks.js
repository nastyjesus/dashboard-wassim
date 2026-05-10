// Données de démo réalistes (4 comptes, ~80 transactions sur 90 jours).
// Le format suit ce que renvoie Bridge API v3 (champs documentés).

const today = new Date('2026-05-10T00:00:00Z');

function isoDaysAgo(n) {
  const d = new Date(today.getTime() - n * 86400_000);
  return d.toISOString();
}

export const MOCK_ACCOUNTS = [
  {
    id: 'acct_fortuneo',
    item_id: 'item_fortuneo',
    name: 'Fortuneo Compte Courant',
    bank_name: 'Fortuneo',
    iban_last4: '4521',
    type: 'Perso',
    currency_code: 'EUR',
    balance: 4280.55,
    accounting_balance: 4280.55,
    instant_balance: 4180.55,
    data_access: 'enabled',
    last_refresh_status: 'ok',
  },
  {
    id: 'acct_traderepublic',
    item_id: 'item_traderepublic',
    name: 'Trade Republic — Cash & PEA',
    bank_name: 'Trade Republic',
    iban_last4: '8842',
    type: 'Perso',
    currency_code: 'EUR',
    balance: 12750.0,
    accounting_balance: 12750.0,
    instant_balance: 12750.0,
    data_access: 'enabled',
    last_refresh_status: 'ok',
  },
  {
    id: 'acct_bp',
    item_id: 'item_bp',
    name: 'Banque Populaire — SOWPHOTO',
    bank_name: 'Banque Populaire',
    iban_last4: '0091',
    type: 'Pro',
    currency_code: 'EUR',
    balance: 8943.12,
    accounting_balance: 8943.12,
    instant_balance: 8843.12,
    data_access: 'enabled',
    last_refresh_status: 'ok',
  },
  {
    id: 'acct_qonto',
    item_id: 'item_qonto',
    name: 'Qonto Basic — SOWPHOTO',
    bank_name: 'Qonto',
    iban_last4: '7733',
    type: 'Pro',
    currency_code: 'EUR',
    balance: 1820.4,
    accounting_balance: 1820.4,
    instant_balance: 1820.4,
    data_access: 'enabled',
    last_refresh_status: 'ok',
  },
];

// Transactions réparties dans le temps : entrées, sorties récurrentes,
// achats variés. Couvre les 4 comptes pour valider toutes les vues.
export const MOCK_TRANSACTIONS = [
  // --- Pro Banque Populaire ---
  { id: 'tx_bp_1', account_id: 'acct_bp', amount: 1500.0, currency_code: 'EUR', date: isoDaysAgo(2), description: 'VIR Cabinet Martin — Portrait Pro', bridge_category: 'Income', is_recurring: false },
  { id: 'tx_bp_2', account_id: 'acct_bp', amount: 900.0, currency_code: 'EUR', date: isoDaysAgo(8), description: 'VIR Studio Lumiere — Production', bridge_category: 'Income', is_recurring: false },
  { id: 'tx_bp_3', account_id: 'acct_bp', amount: -89.99, currency_code: 'EUR', date: isoDaysAgo(3), description: 'Adobe Creative Cloud Subscription', bridge_category: 'Software', is_recurring: true },
  { id: 'tx_bp_4', account_id: 'acct_bp', amount: -420.5, currency_code: 'EUR', date: isoDaysAgo(15), description: 'URSSAF Cotisations Q1', bridge_category: 'Tax', is_recurring: true },
  { id: 'tx_bp_5', account_id: 'acct_bp', amount: -29.0, currency_code: 'EUR', date: isoDaysAgo(5), description: 'OVH Hebergement — sowphoto.fr', bridge_category: 'Hosting', is_recurring: true },
  { id: 'tx_bp_6', account_id: 'acct_bp', amount: -12.0, currency_code: 'EUR', date: isoDaysAgo(7), description: 'Github Copilot Subscription', bridge_category: 'Software', is_recurring: true },
  { id: 'tx_bp_7', account_id: 'acct_bp', amount: -55.0, currency_code: 'EUR', date: isoDaysAgo(12), description: 'Total Carburant Station Rennes', bridge_category: 'Transport', is_recurring: false },
  { id: 'tx_bp_8', account_id: 'acct_bp', amount: 2400.0, currency_code: 'EUR', date: isoDaysAgo(28), description: 'VIR Mairie Rennes — Reportage', bridge_category: 'Income', is_recurring: false },
  { id: 'tx_bp_9', account_id: 'acct_bp', amount: -180.0, currency_code: 'EUR', date: isoDaysAgo(33), description: 'Cabinet Comptable Dubois', bridge_category: 'Accounting', is_recurring: true },
  { id: 'tx_bp_10', account_id: 'acct_bp', amount: -89.99, currency_code: 'EUR', date: isoDaysAgo(34), description: 'Adobe Creative Cloud Subscription', bridge_category: 'Software', is_recurring: true },
  { id: 'tx_bp_11', account_id: 'acct_bp', amount: -29.0, currency_code: 'EUR', date: isoDaysAgo(36), description: 'OVH Hebergement', bridge_category: 'Hosting', is_recurring: true },
  { id: 'tx_bp_12', account_id: 'acct_bp', amount: 600.0, currency_code: 'EUR', date: isoDaysAgo(45), description: 'VIR Audit SEO — Plato Coiffure', bridge_category: 'Income', is_recurring: false },
  { id: 'tx_bp_13', account_id: 'acct_bp', amount: -32.0, currency_code: 'EUR', date: isoDaysAgo(50), description: 'Stripe Frais Transaction', bridge_category: 'Banking', is_recurring: false },
  { id: 'tx_bp_14', account_id: 'acct_bp', amount: -650.0, currency_code: 'EUR', date: isoDaysAgo(60), description: 'URSSAF Cotisations Trimestre', bridge_category: 'Tax', is_recurring: true },
  { id: 'tx_bp_15', account_id: 'acct_bp', amount: 1800.0, currency_code: 'EUR', date: isoDaysAgo(72), description: 'VIR BNI Commission', bridge_category: 'Income', is_recurring: false },

  // --- Pro Qonto ---
  { id: 'tx_qonto_1', account_id: 'acct_qonto', amount: 300.0, currency_code: 'EUR', date: isoDaysAgo(1), description: 'VIR Abonnement SEO — Cliente Mensuelle', bridge_category: 'Income', is_recurring: true },
  { id: 'tx_qonto_2', account_id: 'acct_qonto', amount: -20.0, currency_code: 'EUR', date: isoDaysAgo(4), description: 'Notion Workspace Pro', bridge_category: 'Software', is_recurring: true },
  { id: 'tx_qonto_3', account_id: 'acct_qonto', amount: -9.0, currency_code: 'EUR', date: isoDaysAgo(6), description: 'Cloudflare Workers', bridge_category: 'Hosting', is_recurring: true },
  { id: 'tx_qonto_4', account_id: 'acct_qonto', amount: -120.0, currency_code: 'EUR', date: isoDaysAgo(11), description: 'Google Ads Campaign', bridge_category: 'Marketing', is_recurring: false },
  { id: 'tx_qonto_5', account_id: 'acct_qonto', amount: 300.0, currency_code: 'EUR', date: isoDaysAgo(31), description: 'VIR Abonnement SEO — Cliente Mensuelle', bridge_category: 'Income', is_recurring: true },
  { id: 'tx_qonto_6', account_id: 'acct_qonto', amount: -20.0, currency_code: 'EUR', date: isoDaysAgo(35), description: 'Notion Workspace Pro', bridge_category: 'Software', is_recurring: true },
  { id: 'tx_qonto_7', account_id: 'acct_qonto', amount: 150.0, currency_code: 'EUR', date: isoDaysAgo(40), description: 'VIR Maintenance Site Web', bridge_category: 'Income', is_recurring: false },
  { id: 'tx_qonto_8', account_id: 'acct_qonto', amount: -9.0, currency_code: 'EUR', date: isoDaysAgo(38), description: 'Cloudflare Workers', bridge_category: 'Hosting', is_recurring: true },
  { id: 'tx_qonto_9', account_id: 'acct_qonto', amount: -45.0, currency_code: 'EUR', date: isoDaysAgo(55), description: 'Mailchimp Newsletter Pro', bridge_category: 'Marketing', is_recurring: true },
  { id: 'tx_qonto_10', account_id: 'acct_qonto', amount: 300.0, currency_code: 'EUR', date: isoDaysAgo(62), description: 'VIR Abonnement SEO', bridge_category: 'Income', is_recurring: true },

  // --- Perso Fortuneo ---
  { id: 'tx_fo_1', account_id: 'acct_fortuneo', amount: -85.4, currency_code: 'EUR', date: isoDaysAgo(2), description: 'CARREFOUR Rennes Centre', bridge_category: 'Groceries', is_recurring: false },
  { id: 'tx_fo_2', account_id: 'acct_fortuneo', amount: -38.5, currency_code: 'EUR', date: isoDaysAgo(3), description: 'Restaurant Le Bistrot', bridge_category: 'Restaurants', is_recurring: false },
  { id: 'tx_fo_3', account_id: 'acct_fortuneo', amount: -15.99, currency_code: 'EUR', date: isoDaysAgo(5), description: 'Spotify Premium', bridge_category: 'Entertainment', is_recurring: true },
  { id: 'tx_fo_4', account_id: 'acct_fortuneo', amount: -12.99, currency_code: 'EUR', date: isoDaysAgo(7), description: 'Netflix Subscription', bridge_category: 'Entertainment', is_recurring: true },
  { id: 'tx_fo_5', account_id: 'acct_fortuneo', amount: -75.0, currency_code: 'EUR', date: isoDaysAgo(8), description: 'Total Carburant', bridge_category: 'Transport', is_recurring: false },
  { id: 'tx_fo_6', account_id: 'acct_fortuneo', amount: -19.99, currency_code: 'EUR', date: isoDaysAgo(10), description: 'Free Mobile Forfait', bridge_category: 'Telecom', is_recurring: true },
  { id: 'tx_fo_7', account_id: 'acct_fortuneo', amount: -650.0, currency_code: 'EUR', date: isoDaysAgo(11), description: 'VIR Loyer Foncia', bridge_category: 'Rent', is_recurring: true },
  { id: 'tx_fo_8', account_id: 'acct_fortuneo', amount: -42.3, currency_code: 'EUR', date: isoDaysAgo(13), description: 'EDF Energie', bridge_category: 'Utilities', is_recurring: true },
  { id: 'tx_fo_9', account_id: 'acct_fortuneo', amount: -32.5, currency_code: 'EUR', date: isoDaysAgo(14), description: 'Pharmacie de la Place', bridge_category: 'Health', is_recurring: false },
  { id: 'tx_fo_10', account_id: 'acct_fortuneo', amount: 2200.0, currency_code: 'EUR', date: isoDaysAgo(28), description: 'VIR SOWPHOTO Salaire', bridge_category: 'Income', is_recurring: true },
  { id: 'tx_fo_11', account_id: 'acct_fortuneo', amount: -91.25, currency_code: 'EUR', date: isoDaysAgo(20), description: 'CARREFOUR Rennes', bridge_category: 'Groceries', is_recurring: false },
  { id: 'tx_fo_12', account_id: 'acct_fortuneo', amount: -54.0, currency_code: 'EUR', date: isoDaysAgo(22), description: 'SNCF Paris Rennes', bridge_category: 'Transport', is_recurring: false },
  { id: 'tx_fo_13', account_id: 'acct_fortuneo', amount: -18.5, currency_code: 'EUR', date: isoDaysAgo(24), description: 'Uber Eats Sushi', bridge_category: 'Restaurants', is_recurring: false },
  { id: 'tx_fo_14', account_id: 'acct_fortuneo', amount: -650.0, currency_code: 'EUR', date: isoDaysAgo(41), description: 'VIR Loyer Foncia', bridge_category: 'Rent', is_recurring: true },
  { id: 'tx_fo_15', account_id: 'acct_fortuneo', amount: -19.99, currency_code: 'EUR', date: isoDaysAgo(40), description: 'Free Mobile Forfait', bridge_category: 'Telecom', is_recurring: true },
  { id: 'tx_fo_16', account_id: 'acct_fortuneo', amount: -15.99, currency_code: 'EUR', date: isoDaysAgo(35), description: 'Spotify Premium', bridge_category: 'Entertainment', is_recurring: true },
  { id: 'tx_fo_17', account_id: 'acct_fortuneo', amount: -12.99, currency_code: 'EUR', date: isoDaysAgo(37), description: 'Netflix Subscription', bridge_category: 'Entertainment', is_recurring: true },
  { id: 'tx_fo_18', account_id: 'acct_fortuneo', amount: -120.0, currency_code: 'EUR', date: isoDaysAgo(45), description: 'Decathlon Sport', bridge_category: 'Shopping', is_recurring: false },
  { id: 'tx_fo_19', account_id: 'acct_fortuneo', amount: -34.9, currency_code: 'EUR', date: isoDaysAgo(50), description: 'LIDL Rennes', bridge_category: 'Groceries', is_recurring: false },
  { id: 'tx_fo_20', account_id: 'acct_fortuneo', amount: 2200.0, currency_code: 'EUR', date: isoDaysAgo(58), description: 'VIR SOWPHOTO Salaire', bridge_category: 'Income', is_recurring: true },
  { id: 'tx_fo_21', account_id: 'acct_fortuneo', amount: -650.0, currency_code: 'EUR', date: isoDaysAgo(72), description: 'VIR Loyer Foncia', bridge_category: 'Rent', is_recurring: true },
  { id: 'tx_fo_22', account_id: 'acct_fortuneo', amount: -340.0, currency_code: 'EUR', date: isoDaysAgo(80), description: 'Voyage Air France Lisbonne', bridge_category: 'Travel', is_recurring: false },

  // --- Perso Trade Republic ---
  { id: 'tx_tr_1', account_id: 'acct_traderepublic', amount: 500.0, currency_code: 'EUR', date: isoDaysAgo(15), description: 'Versement mensuel PEA', bridge_category: 'Transfer', is_recurring: true },
  { id: 'tx_tr_2', account_id: 'acct_traderepublic', amount: -498.0, currency_code: 'EUR', date: isoDaysAgo(15), description: 'Achat ETF World 5 parts', bridge_category: 'Investment', is_recurring: false },
  { id: 'tx_tr_3', account_id: 'acct_traderepublic', amount: 500.0, currency_code: 'EUR', date: isoDaysAgo(45), description: 'Versement mensuel PEA', bridge_category: 'Transfer', is_recurring: true },
  { id: 'tx_tr_4', account_id: 'acct_traderepublic', amount: -495.0, currency_code: 'EUR', date: isoDaysAgo(45), description: 'Achat ETF World 5 parts', bridge_category: 'Investment', is_recurring: false },
  { id: 'tx_tr_5', account_id: 'acct_traderepublic', amount: 500.0, currency_code: 'EUR', date: isoDaysAgo(75), description: 'Versement mensuel PEA', bridge_category: 'Transfer', is_recurring: true },
  { id: 'tx_tr_6', account_id: 'acct_traderepublic', amount: -488.0, currency_code: 'EUR', date: isoDaysAgo(75), description: 'Achat ETF World 5 parts', bridge_category: 'Investment', is_recurring: false },
  { id: 'tx_tr_7', account_id: 'acct_traderepublic', amount: 28.4, currency_code: 'EUR', date: isoDaysAgo(60), description: 'Dividendes ETF', bridge_category: 'Income', is_recurring: false },
];
