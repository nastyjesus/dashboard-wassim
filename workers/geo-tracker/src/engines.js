// Adaptateurs moteurs IA. Chaque moteur reçoit le prompt BRUT (comme un
// utilisateur le taperait — aucun biais du type « cite untel »), et renvoie
// { text, sources[] } : le texte de la réponse et les URLs des sources citées.
//
// ⚠️ Limite assumée (documentée au client) : les réponses API ne sont pas
// identiques aux produits grand public (ChatGPT Search, AI Overviews). C'est
// une tendance de citation mesurée et datée, en complément d'AEO Sensor.

import { mockAnswer } from './mocks.js';

const MAX_TOKENS = 1024;

export const ENGINES = ['perplexity', 'anthropic', 'openai', 'gemini'];

const KEY_VARS = {
  perplexity: 'PERPLEXITY_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  gemini: 'GEMINI_API_KEY',
};

export function isMock(env) {
  return (env.MOCK_MODE || '').toLowerCase() === 'true';
}

/** Moteurs actifs pour ce déploiement : tous en mock, sinon ceux qui ont une clé. */
export function enabledEngines(env) {
  if (isMock(env)) return [...ENGINES];
  return ENGINES.filter((e) => Boolean(env[KEY_VARS[e]]));
}

/**
 * Interroge un moteur avec un prompt.
 * @returns {Promise<{ text: string, sources: string[] }>}
 */
export async function askEngine(env, engine, prompt, client, dateKey) {
  if (isMock(env)) return mockAnswer(engine, prompt, client, dateKey);
  switch (engine) {
    case 'perplexity': return askPerplexity(env, prompt);
    case 'anthropic': return askAnthropic(env, prompt);
    case 'openai': return askOpenai(env, prompt);
    case 'gemini': return askGemini(env, prompt);
    default: throw new Error(`unknown engine: ${engine}`);
  }
}

async function askPerplexity(env, prompt) {
  const data = await postJson('https://api.perplexity.ai/chat/completions', {
    headers: { Authorization: `Bearer ${env.PERPLEXITY_API_KEY}` },
    body: {
      model: env.PERPLEXITY_MODEL || 'sonar',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: MAX_TOKENS,
    },
  }, 'perplexity');
  const text = data.choices?.[0]?.message?.content || '';
  // Les citations arrivent selon les versions dans `citations` (URLs) ou
  // `search_results` ([{url,…}]) — on prend les deux.
  const sources = [
    ...(data.citations || []),
    ...((data.search_results || []).map((r) => r.url).filter(Boolean)),
  ];
  return { text, sources };
}

async function askAnthropic(env, prompt) {
  const data = await postJson('https://api.anthropic.com/v1/messages', {
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: {
      model: env.ANTHROPIC_MODEL || 'claude-sonnet-4-5',
      max_tokens: MAX_TOKENS,
      messages: [{ role: 'user', content: prompt }],
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
    },
  }, 'anthropic');
  let text = '';
  const sources = [];
  for (const block of data.content || []) {
    if (block.type === 'text') {
      text += block.text || '';
      for (const c of block.citations || []) {
        if (c.url) sources.push(c.url);
      }
    }
    if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
      for (const r of block.content) {
        if (r.url) sources.push(r.url);
      }
    }
  }
  return { text, sources };
}

async function askOpenai(env, prompt) {
  const data = await postJson('https://api.openai.com/v1/responses', {
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: {
      model: env.OPENAI_MODEL || 'gpt-4o',
      input: prompt,
      tools: [{ type: 'web_search' }],
      max_output_tokens: MAX_TOKENS,
    },
  }, 'openai');
  let text = '';
  const sources = [];
  for (const item of data.output || []) {
    if (item.type !== 'message') continue;
    for (const part of item.content || []) {
      if (part.type === 'output_text') {
        text += part.text || '';
        for (const a of part.annotations || []) {
          if (a.type === 'url_citation' && a.url) sources.push(a.url);
        }
      }
    }
  }
  return { text, sources };
}

async function askGemini(env, prompt) {
  const model = env.GEMINI_MODEL || 'gemini-3.6-flash';
  const data = await postJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      headers: { 'x-goog-api-key': env.GEMINI_API_KEY },
      body: {
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: { maxOutputTokens: MAX_TOKENS },
      },
    },
    'gemini',
  );
  const candidate = data.candidates?.[0] || {};
  const text = (candidate.content?.parts || []).map((p) => p.text || '').join('');
  const sources = (candidate.groundingMetadata?.groundingChunks || [])
    .map((c) => c.web?.uri)
    .filter(Boolean);
  return { text, sources };
}

async function postJson(url, { headers, body }, engineName) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${engineName} ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}
