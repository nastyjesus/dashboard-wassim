// Onglet Sorties : l'accueil « On sort ? » + la fiche détail. La navigation
// interne (liste ↔ fiche) vit ici, l'App ne gère que les onglets.
// C'est aussi ici que vivent les sorties gardées : elles marchent sans compte,
// et c'est le premier « garder » qui déclenche l'invitation à en créer un.

import { useEffect, useState } from 'react';
import { Accueil } from './Accueil.js';
import { Detail } from './Detail.js';
import { lireFavoris, basculerFavori, estGardee } from '../favoris.js';
import { lireDrapeau, ecrireDrapeau } from '../storage.js';

const DRAPEAU_INVITE = 'inviteCompteVue';

export function Sorties({ profil, aCompte, onModifierProfil, onDemanderCompte }) {
  const [detail, setDetail] = useState(null);
  const [favoris, setFavoris] = useState([]);
  const [invite, setInvite] = useState(false);

  useEffect(() => { lireFavoris().then(setFavoris); }, []);

  const garder = async (ev, dateISO) => {
    const { liste, gardee } = await basculerFavori(ev, dateISO);
    setFavoris(liste);
    // L'invitation au compte ne s'ouvre qu'après un vrai geste de conservation,
    // une seule fois, et sans bloquer quoi que ce soit.
    if (gardee && !aCompte && !(await lireDrapeau(DRAPEAU_INVITE))) setInvite(true);
  };

  const fermerInvite = async () => {
    setInvite(false);
    await ecrireDrapeau(DRAPEAU_INVITE);
  };

  const creerCompte = async () => {
    await ecrireDrapeau(DRAPEAU_INVITE);
    setInvite(false);
    onDemanderCompte('favori');
  };

  if (detail) {
    return (
      <Detail
        ev={detail}
        gardee={estGardee(favoris, detail)}
        onGarder={() => garder(detail, detail.dateISO)}
        onRetour={() => setDetail(null)}
      />
    );
  }

  return (
    <Accueil
      profil={profil}
      favoris={favoris}
      invite={invite}
      aCompte={aCompte}
      onGarder={garder}
      onCreerCompte={creerCompte}
      onFermerInvite={fermerInvite}
      onOuvrirDetail={setDetail}
      onModifierProfil={onModifierProfil}
      onDemanderCompte={onDemanderCompte}
    />
  );
}
