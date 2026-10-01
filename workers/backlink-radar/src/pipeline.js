// Pipeline de contact (spec § 7). Toute transition hors de ce tableau est
// refusée (400). « perdu » est posé par la vérification automatique, mais
// reste saisissable à la main.

export const STATUSES = ['a_contacter', 'contacte', 'relance', 'obtenu', 'refuse', 'ignore', 'perdu'];

const TRANSITIONS = {
  a_contacter: ['contacte', 'obtenu', 'ignore'],
  contacte: ['relance', 'obtenu', 'refuse', 'ignore'],
  relance: ['relance', 'obtenu', 'refuse', 'ignore'],
  obtenu: ['perdu', 'ignore'],
  refuse: ['a_contacter', 'ignore'],
  ignore: ['a_contacter'],
  perdu: ['a_contacter', 'contacte', 'obtenu', 'ignore'],
};

export const DEFAULT_FOLLOWUP_DAYS = 7;

export function canTransition(from, to) {
  return Boolean(TRANSITIONS[from]?.includes(to));
}

/** Date AAAA-MM-JJ, `days` jours après `now`. */
export function addDays(now, days) {
  return new Date(now.getTime() + days * 86400000).toISOString().slice(0, 10);
}

export function isHttpUrl(s) {
  try {
    const u = new URL(String(s));
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Prépare la mise à jour d'une opportunité pour un changement de statut.
 * @returns {{ error?: string, fields?: object }}
 */
export function planTransition(current, to, payload = {}, now = new Date()) {
  if (!STATUSES.includes(to)) return { error: `statut inconnu : ${to}` };
  if (!canTransition(current.status, to)) {
    return { error: `transition interdite : ${current.status} → ${to}` };
  }
  const fields = { status: to };
  if (to === 'contacte' || to === 'relance') {
    const date = payload.next_followup_at;
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return { error: 'next_followup_at doit être au format AAAA-MM-JJ' };
    }
    fields.next_followup_at = date || addDays(now, DEFAULT_FOLLOWUP_DAYS);
  } else {
    fields.next_followup_at = null;
  }
  if (to === 'obtenu') {
    const link = payload.link_url ?? current.link_url;
    if (!isHttpUrl(link)) {
      return { error: 'link_url (URL http/https de la page du lien) est requis pour « obtenu »' };
    }
    fields.link_url = link;
  }
  return { fields };
}
