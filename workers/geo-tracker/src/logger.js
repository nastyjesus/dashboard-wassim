// Wrapper de log — même hygiène que bridge-proxy : jamais de secrets ni de
// données sensibles, uniquement des identifiants techniques et codes d'erreur.

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
    if (/token|secret|key|auth/i.test(k)) {
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
