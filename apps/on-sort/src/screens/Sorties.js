// Onglet Sorties : l'accueil « On sort ? » + la fiche détail. La navigation
// interne (liste ↔ fiche) vit ici, l'App ne gère que les onglets.

import { useState } from 'react';
import { Accueil } from './Accueil.js';
import { Detail } from './Detail.js';

export function Sorties({ profil, onModifierProfil }) {
  const [detail, setDetail] = useState(null);
  if (detail) return <Detail ev={detail} onRetour={() => setDetail(null)} />;
  return (
    <Accueil profil={profil} onOuvrirDetail={setDetail} onModifierProfil={onModifierProfil} />
  );
}
