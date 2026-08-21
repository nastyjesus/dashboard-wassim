// Design tokens — un seul endroit pour la personnalité visuelle de l'app.
// Parti pris : chaleureux et calme (crème + encre), un seul accent terracotta.

export const couleurs = {
  fond: '#FAF6EF',
  carte: '#FFFFFF',
  encre: '#26221B',
  texte: '#4A443A',
  discret: '#8A8272',
  accent: '#D95B43',
  accentDoux: '#FBE9E2',
  ligne: '#EDE6D9',
  reussite: '#2F6B4F',
  reussiteDoux: '#E4EFE8',
};

export const espace = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 };

export const rayon = { s: 10, m: 16, l: 22, pill: 999 };

export const ombre = {
  carte: {
    shadowColor: '#26221B',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
};
