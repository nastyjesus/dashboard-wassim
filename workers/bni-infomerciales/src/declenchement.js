// Lancement des workflows GitHub depuis le worker.
//
// Les crons GitHub Actions partent souvent avec plusieurs heures de retard
// (jeudi 12h parti à 20h21 le 26/11). Le compte Cloudflare gratuit n'a plus de
// cron disponible (5 par compte) : on profite de l'appel que le script Gmail
// (rappels.gs, notificationsConference) fait toutes les 15 minutes, à l'heure,
// pour lancer le passage dû, une seule fois par créneau. Les crons GitHub
// restent en place comme filet : le job voit que le créneau est déjà fait et
// sort sans rien toucher.

const ZONE_PARIS = 'Europe/Paris';

// Créneaux à l'heure de Paris (jour en-US court). Le passage est lancé au
// premier appel qui tombe dans [heure:minute, + FENETRE].
const PASSAGES = [
  // le job publie le créneau « mercredi soir » : la valeur doit être un des
  // crons de CRONS_PUBLICATION (job.py) pour qu'il soit noté comme fait
  { jour: 'Wed', heure: 19, minute: 5, nom: 'mercredi soir', workflow: 'job', inputs: { cron: '5 18 * * 3' } },
  { jour: 'Thu', heure: 12, minute: 5, nom: 'jeudi midi', workflow: 'job', inputs: { cron: '0 11 * * 4' } },
  // nettoyage du samedi, avec sa propre garde (samedi, à partir de 07:00)
  { jour: 'Sat', heure: 7, minute: 5, nom: 'samedi nettoyage', workflow: 'nettoyage', inputs: { mode: 'auto' } },
];
const FENETRE_MIN = 180;

function heureLocale(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONE_PARIS, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const val = (t) => parts.find((p) => p.type === t)?.value;
  return {
    jour: val('weekday'), date: `${val('year')}-${val('month')}-${val('day')}`,
    minutes: Number(val('hour')) * 60 + Number(val('minute')),
  };
}

// Le passage dû à cette date (heure de Paris), avec son identifiant de créneau
// « AAAA-MM-JJ nom », ou null.
export function passageDu(date) {
  const ici = heureLocale(date);
  for (const p of PASSAGES) {
    const debut = p.heure * 60 + p.minute;
    if (p.jour === ici.jour && ici.minutes >= debut && ici.minutes < debut + FENETRE_MIN) {
      return { creneau: `${ici.date} ${p.nom}`, workflow: p.workflow, inputs: { ...p.inputs } };
    }
  }
  return null;
}

const fichierWorkflow = (env, workflow) => (workflow === 'nettoyage'
  ? env.GITHUB_WORKFLOW_NETTOYAGE || 'bni-infomerciales-nettoyage.yml'
  : env.GITHUB_WORKFLOW);

// Lance un workflow : { ok, statut }. statut 0 = jeton absent.
export async function lancerWorkflow(env, workflow = 'job', inputs) {
  if (!env.GH_DISPATCH_TOKEN) return { ok: false, statut: 0 };
  const corps = { ref: env.GITHUB_REF };
  if (inputs) corps.inputs = inputs;
  const r = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/${fichierWorkflow(env, workflow)}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.GH_DISPATCH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'bni-infomerciales-worker',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(corps),
    // l'appel du script Gmail attend la réponse : ne jamais le bloquer longtemps
    signal: AbortSignal.timeout(10000),
  });
  return { ok: r.status === 204, statut: r.status };
}

// Appelé toutes les 15 minutes (script Gmail). Lance le passage dû s'il ne
// l'a pas déjà été ; un échec sera retenté à l'appel suivant, dans la fenêtre.
// Garde les 20 derniers essais dans le KV (état admin) ; jamais de jeton.
// Ne lève jamais : l'appel qui le porte (notifications) doit toujours répondre.
export async function declencherSiDu(env, date) {
  try {
    const passage = passageDu(date);
    if (!passage || !env.GH_DISPATCH_TOKEN) return null;
    const cle = `declenche:${passage.creneau}`;
    if (await env.KV.get(cle)) return null;
    let res;
    try { res = await lancerWorkflow(env, passage.workflow, passage.inputs); } catch { res = { ok: false, statut: -1 }; }
    // 4xx (jeton refusé, workflow introuvable) : réessayer n'y changera rien,
    // on n'insiste pas jusqu'au créneau suivant (la trace le montre à l'admin) ;
    // sauf 403/429 (limite de débit GitHub) : retenté à l'appel suivant
    const definitif = res.statut >= 400 && res.statut < 500 && res.statut !== 403 && res.statut !== 429;
    if (res.ok || definitif) {
      await env.KV.put(cle, JSON.stringify({ le: date.toISOString(), ok: res.ok }), { expirationTtl: 8 * 24 * 3600 });
    }
    const trace = { le: date.toISOString(), creneau: passage.creneau, workflow: passage.workflow, ok: res.ok, statut: res.statut };
    const liste = (await env.KV.get('declenchements', 'json')) ?? [];
    await env.KV.put('declenchements', JSON.stringify([trace, ...liste].slice(0, 20)));
    console.log('declenchement', passage.workflow, res.ok ? 'ok' : `echec ${res.statut}`);
    return trace;
  } catch (e) {
    console.error('declenchement', e && e.message);
    return null;
  }
}
