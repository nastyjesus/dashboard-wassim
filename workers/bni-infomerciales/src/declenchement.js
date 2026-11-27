// Lancement des workflows GitHub depuis le worker.
//
// Les crons GitHub Actions partent souvent avec plusieurs heures de retard
// (jusqu'à 8 h constatées) : le worker, dont l'horloge Cloudflare est
// ponctuelle, lance lui-même les passages à l'heure de Paris. Les crons GitHub
// restent en place comme filet : le job voit que le créneau est déjà fait et
// sort sans rien toucher.
//
// Un seul cron Cloudflare (UTC, wrangler.toml) réveille le worker à :05 aux
// heures utiles été comme hiver ; seul le réveil qui tombe à la bonne heure de
// Paris (jour + heure, minute ignorée) déclenche quelque chose.

const ZONE_PARIS = 'Europe/Paris';

// jour (en-US court) et heure à Paris → workflow et entrées à envoyer
const PASSAGES = [
  // le job publie le créneau « mercredi soir » : la valeur doit être un des
  // crons de CRONS_PUBLICATION (job.py) pour qu'il soit noté comme fait
  { jour: 'Wed', heure: 19, workflow: 'job', inputs: { cron: '5 18 * * 3' } },
  { jour: 'Thu', heure: 12, workflow: 'job', inputs: { cron: '0 11 * * 4' } },
  // nettoyage du samedi (07:05), avec sa propre garde (samedi, à partir de 07:00)
  { jour: 'Sat', heure: 7, workflow: 'nettoyage', inputs: { mode: 'auto' } },
];

function jourHeureParis(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONE_PARIS, weekday: 'short', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const val = (t) => parts.find((p) => p.type === t)?.value;
  return { jour: val('weekday'), heure: Number(val('hour')) };
}

// Le passage dû à cette date (heure de Paris), ou null.
export function passageDu(date) {
  const { jour, heure } = jourHeureParis(date);
  const p = PASSAGES.find((x) => x.jour === jour && x.heure === heure);
  return p ? { workflow: p.workflow, inputs: { ...p.inputs } } : null;
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
  });
  return { ok: r.status === 204, statut: r.status };
}

const ESSAIS = 3;

// Appelé par les crons Cloudflare. Garde les 20 derniers lancements dans le KV
// (visibles dans l'état admin) ; jamais de jeton ni de contenu de réponse.
export async function declencherPlanifie(env, date) {
  const passage = passageDu(date);
  if (!passage) return null;
  let res = { ok: false, statut: 0 };
  if (env.GH_DISPATCH_TOKEN) {
    for (let essai = 1; essai <= ESSAIS; essai++) {
      try { res = await lancerWorkflow(env, passage.workflow, passage.inputs); } catch { res = { ok: false, statut: -1 }; }
      // 4xx (jeton refusé, workflow introuvable) : réessayer n'y changera rien
      if (res.ok || (res.statut >= 400 && res.statut < 500)) break;
      if (essai < ESSAIS) await new Promise((ok) => setTimeout(ok, (env.PAUSE_DECLENCHEMENT_MS ?? 20000) * essai));
    }
  }
  const trace = { le: date.toISOString(), workflow: passage.workflow, ok: res.ok, statut: res.statut };
  const liste = (await env.KV.get('declenchements', 'json')) ?? [];
  await env.KV.put('declenchements', JSON.stringify([trace, ...liste].slice(0, 20)));
  console.log('declenchement', passage.workflow, res.ok ? 'ok' : `echec ${res.statut}`);
  return trace;
}
