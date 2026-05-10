// Sync vers Notion : pour chaque transaction Bridge, on upsert (idempotent)
// dans la base Notion "Transactions" en se basant sur bridge_transaction_id.
// On met aussi à jour le solde des comptes dans la base "Comptes bancaires".

import { logger } from './logger.js';
import { categorize, rulesFromNotion, DEFAULT_RULES } from './categorize.js';

/** @typedef {{ NOTION_TOKEN?: string, NOTION_API_BASE?: string, NOTION_VERSION?: string,
 *   NOTION_DB_TRANSACTIONS_ID?: string, NOTION_DB_ACCOUNTS_ID?: string,
 *   NOTION_DB_CATEGORIES_ID?: string }} NotionEnv */

export class NotionClient {
  /** @param {NotionEnv} env */
  constructor(env) {
    this.env = env;
    this.base = env.NOTION_API_BASE || 'https://api.notion.com';
    this.version = env.NOTION_VERSION || '2022-06-28';
    this.token = env.NOTION_TOKEN || '';
  }

  configured() {
    return Boolean(
      this.token &&
        this.env.NOTION_DB_TRANSACTIONS_ID &&
        this.env.NOTION_DB_ACCOUNTS_ID,
    );
  }

  headers() {
    return {
      Authorization: `Bearer ${this.token}`,
      'Notion-Version': this.version,
      'Content-Type': 'application/json',
    };
  }

  async query(databaseId, body = {}) {
    const res = await fetch(`${this.base}/v1/databases/${databaseId}/query`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`notion.query ${res.status}`);
    return res.json();
  }

  async createPage(payload) {
    const res = await fetch(`${this.base}/v1/pages`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`notion.create ${res.status}`);
    return res.json();
  }

  async updatePage(pageId, properties) {
    const res = await fetch(`${this.base}/v1/pages/${pageId}`, {
      method: 'PATCH',
      headers: this.headers(),
      body: JSON.stringify({ properties }),
    });
    if (!res.ok) throw new Error(`notion.update ${res.status}`);
    return res.json();
  }
}

/**
 * Charge les règles de catégorisation depuis la base Notion "Catégories".
 * Tolérant : si la base n'est pas accessible, on retombe sur DEFAULT_RULES.
 */
export async function loadCategoryRules(notion) {
  if (!notion.configured() || !notion.env.NOTION_DB_CATEGORIES_ID) return DEFAULT_RULES;
  try {
    const data = await notion.query(notion.env.NOTION_DB_CATEGORIES_ID, { page_size: 100 });
    const rows = (data.results || []).map((r) => parseCategoryRow(r)).filter(Boolean);
    const rules = rulesFromNotion(rows);
    return rules.length > 0 ? rules : DEFAULT_RULES;
  } catch (e) {
    logger.warn('notion.categories.fallback', { err: String(e) });
    return DEFAULT_RULES;
  }
}

function parseCategoryRow(page) {
  const p = page.properties || {};
  const name = p['Nom']?.title?.map((t) => t.plain_text).join('').trim();
  const type = p['Type']?.select?.name || 'Mixte';
  const keywords = (p['Mots-clés mapping']?.multi_select || []).map((k) => k.name);
  if (!name) return null;
  return { name, type, keywords };
}

/**
 * Construit l'index { bridge_transaction_id -> page_id } pour les transactions
 * déjà présentes dans Notion. Permet l'upsert idempotent.
 */
export async function indexExistingTransactions(notion) {
  const out = new Map();
  if (!notion.configured()) return out;
  let cursor;
  let safety = 0;
  do {
    safety++;
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const data = await notion.query(notion.env.NOTION_DB_TRANSACTIONS_ID, body);
    for (const row of data.results || []) {
      const txId = row.properties?.bridge_transaction_id?.rich_text?.[0]?.plain_text;
      if (txId) out.set(txId, row.id);
    }
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor && safety < 50);
  return out;
}

/**
 * Construit l'index { bridge_account_id -> page_id } pour les comptes.
 */
export async function indexExistingAccounts(notion) {
  const out = new Map();
  if (!notion.configured()) return out;
  const data = await notion.query(notion.env.NOTION_DB_ACCOUNTS_ID, { page_size: 100 });
  for (const row of data.results || []) {
    const accId = row.properties?.bridge_account_id?.rich_text?.[0]?.plain_text;
    if (accId) out.set(accId, row.id);
  }
  return out;
}

/**
 * Upsert d'un compte dans la base "Comptes bancaires".
 */
export async function upsertAccount(notion, account, existingMap) {
  const props = {
    'Nom du compte': { title: [{ text: { content: account.name || account.id } }] },
    Banque: { select: { name: account.bank_name || 'Inconnue' } },
    Type: { select: { name: account.type || 'Perso' } },
    'IBAN (4 derniers)': { rich_text: [{ text: { content: account.iban_last4 || '' } }] },
    'Solde actuel': { number: pickBalance(account) },
    Devise: { select: { name: account.currency_code || 'EUR' } },
    bridge_account_id: { rich_text: [{ text: { content: account.id } }] },
    'Dernière synchro': { date: { start: new Date().toISOString() } },
    Statut: { select: { name: statusFromAccount(account) } },
  };
  const existingId = existingMap.get(account.id);
  if (existingId) {
    await notion.updatePage(existingId, props);
    return { action: 'update', id: existingId };
  }
  const created = await notion.createPage({
    parent: { database_id: notion.env.NOTION_DB_ACCOUNTS_ID },
    properties: props,
  });
  existingMap.set(account.id, created.id);
  return { action: 'create', id: created.id };
}

function pickBalance(account) {
  // Brief : se baser sur balance avec fallback. Si on a explicitement
  // instant_balance et qu'il est non null, on le préfère uniquement quand
  // demandé — par défaut on prend balance.
  if (account.balance != null) return account.balance;
  if (account.instant_balance != null) return account.instant_balance;
  if (account.accounting_balance != null) return account.accounting_balance;
  return 0;
}

function statusFromAccount(account) {
  if (account.last_refresh_status === 'ok') return '🟢 OK';
  if (account.data_access === 'disabled') return '🔴 Erreur';
  return '🟡 Reconnect';
}

/**
 * Upsert d'une transaction dans la base "Transactions".
 * @param {NotionClient} notion
 * @param {object} tx - transaction Bridge
 * @param {Map<string,string>} existingTxMap - bridge_transaction_id -> page_id
 * @param {Map<string,string>} accountPageMap - bridge_account_id -> page_id
 * @param {Array} rules - règles de catégorisation
 */
export async function upsertTransaction(notion, tx, existingTxMap, accountPageMap, rules) {
  const cat = categorize(
    { description: tx.description, bridgeCategory: tx.bridge_category },
    rules,
  );
  const accountPageId = accountPageMap.get(tx.account_id);
  const props = {
    Description: { title: [{ text: { content: (tx.description || '').slice(0, 200) || '—' } }] },
    Date: { date: { start: new Date(tx.date).toISOString().split('T')[0] } },
    Montant: { number: Number(tx.amount) || 0 },
    'Catégorie auto Bridge': { rich_text: [{ text: { content: tx.bridge_category || '' } }] },
    Récurrent: { checkbox: Boolean(tx.is_recurring) },
    bridge_transaction_id: { rich_text: [{ text: { content: tx.id } }] },
    updated_at: { date: { start: new Date().toISOString() } },
  };
  if (accountPageId) props.Compte = { relation: [{ id: accountPageId }] };
  if (cat) props.Type = { select: { name: cat.type === 'Pro' ? 'Pro' : 'Perso' } };

  const existingId = existingTxMap.get(tx.id);
  if (existingId) {
    // On ne réécrase pas la note ni la catégorie manuelle : update partiel.
    delete props.Type;
    await notion.updatePage(existingId, props);
    return { action: 'update' };
  }
  await notion.createPage({
    parent: { database_id: notion.env.NOTION_DB_TRANSACTIONS_ID },
    properties: props,
  });
  return { action: 'create' };
}

/**
 * Sync complet : accounts puis transactions, idempotent.
 *
 * @param {NotionClient} notion
 * @param {{accounts: Array, transactions: Array}} data
 */
export async function runSync(notion, data) {
  if (!notion.configured()) {
    logger.warn('notion.skip.unconfigured');
    return { accounts: 0, transactions: 0, skipped: true };
  }
  const rules = await loadCategoryRules(notion);
  const accountIndex = await indexExistingAccounts(notion);
  for (const acc of data.accounts) {
    await upsertAccount(notion, acc, accountIndex);
  }
  const txIndex = await indexExistingTransactions(notion);
  let created = 0;
  let updated = 0;
  for (const tx of data.transactions) {
    const r = await upsertTransaction(notion, tx, txIndex, accountIndex, rules);
    if (r.action === 'create') created++;
    else updated++;
  }
  logger.info('notion.sync.done', { created, updated, accounts: data.accounts.length });
  return { accounts: data.accounts.length, transactions: data.transactions.length, created, updated };
}
