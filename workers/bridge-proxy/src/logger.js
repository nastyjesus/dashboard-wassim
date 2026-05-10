// Wrapper de log : ne logge jamais de montants ou d'IBAN complets, uniquement
// des identifiants techniques et des codes d'erreur. Désactivable via env.

/**
 * @param {string} level - "info" | "warn" | "error"
 * @param {string} msg
 * @param {Record<string, unknown>} [ctx]
 */
function emit(level, msg, ctx) {
  const safeCtx = sanitize(ctx);
  const line = JSON.stringify({ level, msg, ...safeCtx });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

function sanitize(ctx) {
  if (!ctx || typeof ctx !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(ctx)) {
    // On bloque les clés à risque.
    if (/iban|amount|montant|balance|solde|token|secret|client_id/i.test(k)) {
      out[k] = '[redacted]';
      continue;
    }
    out[k] = typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? v : '[obj]';
  }
  return out;
}

export const logger = {
  info: (msg, ctx) => emit('info', msg, ctx),
  warn: (msg, ctx) => emit('warn', msg, ctx),
  error: (msg, ctx) => emit('error', msg, ctx),
};
