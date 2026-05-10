#!/usr/bin/env node
// Crée automatiquement les 3 bases Notion (Comptes, Transactions, Catégories)
// dans le workspace Wassim, et pré-remplit la base Catégories.
//
// Usage :
//   NOTION_TOKEN=secret_xxx NOTION_PARENT_PAGE_ID=150fe946... \
//     node scripts/create-notion-dbs.js
//
// Le script écrit les IDs des bases créées dans `docs/notion-ids.local.json`
// (ce fichier est gitignoré). Tu n'auras plus qu'à les copier dans les
// secrets Cloudflare via `wrangler secret put`.
//
// Sans dépendance externe : utilise fetch() global (Node 18+).

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const SCHEMAS_PATH = resolve(REPO_ROOT, 'docs/notion-schemas.json');
const OUT_PATH = resolve(REPO_ROOT, 'docs/notion-ids.local.json');

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

const TOKEN = process.env.NOTION_TOKEN;
const PARENT = process.env.NOTION_PARENT_PAGE_ID || process.env.NOTION_PARENT;

if (!TOKEN) {
  console.error('❌ NOTION_TOKEN manquant. Génère un token sur https://notion.so/my-integrations.');
  process.exit(1);
}
if (!PARENT) {
  console.error('❌ NOTION_PARENT_PAGE_ID manquant. Mets l\'ID de la page parent (workspace Agency).');
  process.exit(1);
}

function api(path, init = {}) {
  return fetch(`${NOTION_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  }).then(async (res) => {
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text; }
    if (!res.ok) {
      const msg = body?.message || body?.code || text;
      throw new Error(`Notion ${res.status} ${path} — ${msg}`);
    }
    return body;
  });
}

/**
 * Convertit la définition d'une propriété (notion-schemas.json) en payload
 * accepté par l'API Notion.
 */
function buildProperty(def) {
  switch (def.type) {
    case 'title':
      return { title: {} };
    case 'rich_text':
      return { rich_text: {} };
    case 'date':
      return { date: {} };
    case 'checkbox':
      return { checkbox: {} };
    case 'number':
      return { number: { format: def.format || 'number' } };
    case 'select':
      return { select: { options: def.options || [] } };
    case 'multi_select':
      return { multi_select: { options: def.options || [] } };
    default:
      throw new Error(`Type non supporté: ${def.type}`);
  }
}

/**
 * Crée une base Notion. Les relations sont gérées dans une seconde passe.
 */
async function createDatabase({ title, icon, properties }, parentPageId) {
  const props = {};
  for (const [name, def] of Object.entries(properties)) {
    if (def.type === 'relation') continue; // 2e passe
    props[name] = buildProperty(def);
  }
  const payload = {
    parent: { type: 'page_id', page_id: parentPageId },
    title: [{ type: 'text', text: { content: title } }],
    icon: icon ? { type: 'emoji', emoji: icon } : undefined,
    properties: props,
  };
  const created = await api('/databases', { method: 'POST', body: JSON.stringify(payload) });
  console.log(`  ✓ Créée : ${title} (${created.id})`);
  return created.id;
}

/**
 * Ajoute les propriétés relation dans une base existante.
 */
async function addRelations(databaseId, properties, ids) {
  const updates = {};
  for (const [name, def] of Object.entries(properties)) {
    if (def.type !== 'relation') continue;
    const target = ids[def.relation_target];
    if (!target) {
      console.warn(`  ⚠️  Cible inconnue pour relation ${name}: ${def.relation_target}`);
      continue;
    }
    updates[name] = { relation: { database_id: target, single_property: {} } };
  }
  if (Object.keys(updates).length === 0) return;
  await api(`/databases/${databaseId}`, {
    method: 'PATCH',
    body: JSON.stringify({ properties: updates }),
  });
  console.log(`  ✓ Relations ajoutées (${Object.keys(updates).join(', ')})`);
}

/**
 * Pré-remplit la base Catégories avec les entrées seed.
 */
async function seedCategories(databaseId, seedRows) {
  console.log(`\nPré-remplissage de ${seedRows.length} catégories...`);
  for (const row of seedRows) {
    const props = {
      Nom: { title: [{ text: { content: row.name } }] },
      Type: { select: { name: row.type } },
    };
    if (row.couleur) props['Couleur'] = { select: { name: row.couleur } };
    if (Array.isArray(row.keywords) && row.keywords.length > 0) {
      props['Mots-clés mapping'] = {
        multi_select: row.keywords.map((kw) => ({ name: kw.slice(0, 100) })),
      };
    }
    await api('/pages', {
      method: 'POST',
      body: JSON.stringify({
        parent: { database_id: databaseId },
        properties: props,
      }),
    });
    process.stdout.write(`  · ${row.name}\n`);
  }
}

async function main() {
  console.log(`🔧 Création des bases Notion sous la page ${PARENT}\n`);

  const schemas = JSON.parse(await readFile(SCHEMAS_PATH, 'utf8'));
  const dbs = schemas.databases;
  const ids = {};

  // 1) On crée d'abord les 3 bases sans relations.
  for (const key of ['accounts', 'categories', 'transactions']) {
    ids[key] = await createDatabase(dbs[key], PARENT);
  }

  // 2) On ajoute les relations à la base Transactions.
  console.log('\nConfiguration des relations...');
  await addRelations(ids.transactions, dbs.transactions.properties, ids);

  // 3) Seed Catégories.
  await seedCategories(ids.categories, schemas.categories_seed || []);

  // 4) Sauvegarde locale des IDs.
  const out = {
    NOTION_DB_ACCOUNTS_ID: ids.accounts,
    NOTION_DB_TRANSACTIONS_ID: ids.transactions,
    NOTION_DB_CATEGORIES_ID: ids.categories,
    created_at: new Date().toISOString(),
  };
  await writeFile(OUT_PATH, JSON.stringify(out, null, 2), 'utf8');

  console.log('\n✅ Terminé.');
  console.log(`📄 IDs écrits dans ${OUT_PATH}`);
  console.log('\nÀ exécuter ensuite (depuis workers/bridge-proxy/) :');
  console.log(`  wrangler secret put NOTION_DB_ACCOUNTS_ID      # ${ids.accounts}`);
  console.log(`  wrangler secret put NOTION_DB_TRANSACTIONS_ID  # ${ids.transactions}`);
  console.log(`  wrangler secret put NOTION_DB_CATEGORIES_ID    # ${ids.categories}`);
  console.log(`  wrangler secret put NOTION_TOKEN               # ${TOKEN.slice(0, 8)}…`);
}

main().catch((err) => {
  console.error('\n❌', err.message || err);
  process.exit(1);
});
