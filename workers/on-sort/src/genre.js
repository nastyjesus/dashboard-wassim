// Genre d'une sortie : la routine (lecture, conte) ou l'exceptionnel (cirque
// de passage, fête foraine, carnaval…).
//
// Pourquoi (audit du 6 octobre 2026, 18 villes × 3 dates, enfant de 3 ans) :
// la lecture/conte faisait 41 % des sorties retenues et 42 % des GO — une
// séance « bébés lecteurs » cumule tous les bonus (pensé pour les enfants,
// âge précis, ponctuelle, gratuite, proche). Rien ne distinguait un cirque
// de passage, qui n'avait même pas de signal enfant (« cirque » n'est qu'un
// mot faible). Le scoring lit désormais ce genre : bonus à l'exceptionnel,
// léger malus à la routine, et au plus une lecture par top.
//
// On lit le TITRE, les mots-clés et les types DATAtourisme — pas la
// description, où « arts du cirque » ou « un festival de couleurs » sont
// banals. Les regex sont compilées une fois (limite CPU du plan gratuit).

/**
 * L'exceptionnel. `enfant: true` : le genre suffit à dire que c'est une sortie
 * pour un enfant (un cirque, des manèges) ; sinon il faut le signal famille
 * habituel (un festival peut être de jazz, Halloween une soirée adulte).
 */
const EXCEPTIONNELS = [
  { genre: 'cirque', enfant: true, re: /\bcirques?\b|\bchapiteau|\bcircassien/ },
  { genre: 'fete-foraine', enfant: true, re: /f[êe]tes? foraines?|\bman[èe]ges?\b|\bducasse\b|\bfoire aux man/ },
  { genre: 'parade', enfant: true, re: /\bcarnaval|\bparade\b|\bcorso\b|\bd[ée]fil[ée] (de|du|des|aux) (lanternes|lampions|chars)/ },
  { genre: 'feu-artifice', enfant: true, re: /\bfeux? d'artifices?/ },
  { genre: 'noel', enfant: true, re: /march[ée]s? de no[ëe]l|village de no[ëe]l|p[èe]re no[ëe]l|spectacle de no[ëe]l|f[ée]erie de no[ëe]l/ },
  { genre: 'festival', enfant: false, re: /\bfestival/ },
  { genre: 'halloween', enfant: false, re: /\bhalloween/ },
  { genre: 'fete', enfant: false, re: /\bf[êe]tes? (de la science|du jeu|des jeux|des enfants|de la nature|du livre jeunesse)\b/ },
];

/** Classes DATAtourisme (ontologie core) qui disent l'exceptionnel. */
const TYPES_DATATOURISME = {
  CircusEvent: 'cirque',
  Carnival: 'parade',
  Parade: 'parade',
  Festival: 'festival',
};

/**
 * Classes génériques : toute fiche en porte plusieurs (une fiche normale a 5
 * à 10 types, dont 1 ou 2 spécifiques). Au-delà de TYPES_SPECIFIQUES_MAX
 * types spécifiques, la fiche a été typée en vrac et ses types ne disent
 * rien — constaté le 6 octobre 2026 : une visite guidée de maison natale
 * typée à la fois Festival, Congress, SaleEvent, BusinessEvent, Visit…
 */
const TYPES_GENERIQUES = new Set([
  'PointOfInterest', 'Event', 'EntertainmentAndEvent', 'CulturalEvent', 'Product', 'Practice',
  'Traineeship', 'SportsEvent', 'SocialEvent', 'ChildrensEvent', 'Game', 'Rambling', 'LocalAnimation',
]);
const TYPES_SPECIFIQUES_MAX = 3;

/** Lecture, conte, comptines : le rendez-vous régulier des médiathèques. */
const LECTURE = /\blectures?\b|\bcontes?\b|\bcontées?\b|\bconteu|\bhistoires?\b|\bhistoriettes?\b|\bbouquin|\blecteurs?\b|\blivres?\b|\bkamishiba|\bracontines?\b|\bcomptines?\b|\bbiblio|\bheure du conte|\blire\b|\bon lit\b/;

function texteGenre(ev) {
  return [ev.titre, ...(ev.motsCles || [])].join(' ').toLowerCase().replace(/[’‘]/g, "'");
}

/** Dernier segment d'un type DATAtourisme : « …core#CircusEvent » → « CircusEvent ». */
function nomType(t) {
  return String(t || '').split(/[#/:]/).pop();
}

/**
 * L'exceptionnel d'une sortie, ou null.
 * @returns {{genre: string, enfant: boolean}|null}
 */
export function exceptionnel(ev) {
  const types = (ev.types || []).map(nomType);
  const specifiques = types.filter((t) => !TYPES_GENERIQUES.has(t)).length;
  if (specifiques <= TYPES_SPECIFIQUES_MAX) {
    for (const t of types) {
      const genre = TYPES_DATATOURISME[t];
      if (genre) return { genre, enfant: EXCEPTIONNELS.find((e) => e.genre === genre).enfant };
    }
  }
  const texte = texteGenre(ev);
  for (const e of EXCEPTIONNELS) if (e.re.test(texte)) return { genre: e.genre, enfant: e.enfant };
  return null;
}

/** Lecture / conte / comptines (lu sur le titre et les mots-clés). */
export function estLecture(ev) {
  return LECTURE.test(texteGenre(ev));
}

/**
 * Genre servant à la diversité du top : 'lecture', un genre exceptionnel, ou
 * 'autre'. Un festival de contes reste un festival.
 */
export function genre(ev) {
  const ex = exceptionnel(ev);
  if (ex) return ex.genre;
  return estLecture(ev) ? 'lecture' : 'autre';
}
