// Design tokens — source de vérité visuelle de l'app.
// Charte « Cockpit clair » : tableau de bord d'opérations lumineux et chaud.
// Voir docs/charte-graphique.md pour le raisonnement complet.
// Parti pris : sol sable chaud, panneaux cadrés à l'encre, UN accent (ambre GO).

export const couleurs = {
  // Base
  fond: '#ECE6DA',        // sol sable de plein jour (volontairement plus gris que le crème)
  panneau: '#FBFAF7',     // surface des instruments / cartes
  carte: '#FBFAF7',       // alias de panneau (compat écrans existants)
  encre: '#1B1815',       // texte principal ET cadres des panneaux
  texte: '#5C554B',       // texte secondaire
  discret: '#8B8375',     // légendes, unités, méta
  ligne: '#D7CFC0',       // filets 1px

  // Signal — l'ambre solaire. GO / préférée / action primaire uniquement.
  accent: '#FF8A00',
  accentVif: '#FFB020',
  accentEncre: '#A85400', // ambre foncé pour petit texte ambre sur clair
  accentDoux: '#FFE9CC',  // aplat ambre très clair (fond de tag ambre)

  // Bandeau instrument sombre (haut des écrans clés)
  strip: '#1B1815',
  stripTexte: '#F4EFE6',

  // États sémantiques — sobres, ne concurrencent jamais l'ambre
  reussite: '#2E7D52',
  reussiteDoux: '#E2EFE6',
  alerte: '#C6432E',
};

// Deux familles, franchement distinctes (chargées via @expo-google-fonts).
// Tant que les polices ne sont pas chargées, fallbacks système condensé/sans.
export const police = {
  display: 'SairaCondensed_800ExtraBold',
  displayMoyen: 'SairaCondensed_700Bold',
  corps: 'IBMPlexSans_400Regular',
  corpsFort: 'IBMPlexSans_600SemiBold',
};

// Échelle de type — cf. The Elements of Typographic Style.
export const typo = {
  displayXL: { fontSize: 44, lineHeight: 44, letterSpacing: -0.5 }, // hero « ON SORT ? »
  displayL: { fontSize: 30, lineHeight: 32 },                        // titre d'écran
  section: { fontSize: 15, lineHeight: 18, letterSpacing: 0.5 },     // libellé de section (caps)
  instrument: { fontSize: 12, lineHeight: 14, letterSpacing: 0.6 },  // libellé d'instrument (caps)
  corpsL: { fontSize: 17, lineHeight: 26 },
  corps: { fontSize: 15, lineHeight: 23 },
};

export const espace = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32, xxxl: 48 };

// Rayons discrets : c'est le cadre encré qui donne le caractère, pas l'arrondi.
export const rayon = { s: 6, m: 10, pill: 999 };

// Le geste signature : bordure encre 2px. Pas de carte molle.
export const cadre = { borderWidth: 2, borderColor: couleurs.encre };
export const filet = { borderColor: couleurs.ligne, borderWidth: 1 };

// Ombres : la version molle diffuse est bannie.
// Seul relief autorisé : bloc d'encre décalé sans flou, sous le panneau GO.
export const ombre = {
  aucune: {},
  relief: {
    shadowColor: '#1B1815',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 3, height: 4 },
    elevation: 0,
  },
};
