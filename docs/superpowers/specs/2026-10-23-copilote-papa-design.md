# Copilote papa — conception

**Date :** 23 octobre 2026
**Auteur :** Wassim Loumi (décisions), Claude Code (rédaction)
**Statut :** validé en brainstorming, à relire avant le plan d'implémentation

## 1. Pourquoi

Audit du 23 octobre 2026, un mois après l'ouverture de l'app de sorties :
63 ouvertures, 1 sortie gardée, 0 compte, 0 alerte. L'agrégation d'agendas
est jugée trop banale : elle ne répond pas à un besoin assez fort pour faire
revenir un papa.

Nouveau cap : un **copilote** qui aide le papa aux quatre moments durs ou
répétés de sa semaine, accessible sans installer d'app (WhatsApp) et dans la
PWA existante.

## 2. Décisions prises

| Sujet | Décision |
|---|---|
| Situations couvertes | Les quatre, en version minimale, lancées ensemble |
| Accès | WhatsApp **et** PWA (onglet « Copilote ») |
| App de sorties existante | Gardée : elle devient la brique « plan du week-end ». Pages SEO inchangées |
| Ton des réponses | Au choix du papa : « pote » (direct, tutoiement) ou « coach » (posé, explique le pourquoi) |
| Caution d'expert | Oui, dès le départ, pour SOS crise. Expert à trouver |
| Modèle économique | Abonnement papa, après quotas gratuits |
| Testeurs | Réseau direct de Wassim, 10 à 30 papas |

Cette orientation remplace la règle « une app excellente sur un seul sujet »
de `docs/papa-parfait/decisions.md`, mise à jour en conséquence.

## 3. Architecture

```
 WhatsApp ──webhook──┐                    ┌── SOS crise
                     ▼                    ├── Activité maison (photo)
 PWA (onglet    ──► worker « copilote » ──┼── Histoire du soir
  Copilote)          │  routeur           └── Plan du week-end ──► worker on-sort (/top)
                     ▼
        Supabase : papas · enfants · souvenirs · usage
```

- **Worker `copilote`** (Cloudflare), nouveau et séparé de `on-sort`. Il ne
  touche ni au moteur de sorties en prod ni à sa limite CPU. Les appels à
  l'IA sont de l'attente réseau, pas du CPU.
- **Vocal** : transcription par Whisper sur Cloudflare Workers AI. Le fichier
  audio est supprimé après transcription.
- **Texte et photo** : Claude. Haiku 5.5 (`claude-haiku-5-5`) pour le routage
  et SOS crise, où la vitesse compte. Sonnet 5.5 (`claude-sonnet-5-5`) pour
  l'histoire du soir, l'activité maison (vision) et le plan du week-end.
  Tarifs vérifiés au moment du plan.
- **WhatsApp** : API Cloud de Meta, numéro dédié, webhook vers le worker.
- **PWA** : onglet « Copilote » qui remplace les teasers Couple et Moi.
  L'onglet Sorties reste.
- **Plan du week-end** : appelle `GET /top` du worker `on-sort`.

### Données (Supabase)

| Table | Contenu | Remarques |
|---|---|---|
| `papas` | id, numéro WhatsApp (haché pour la recherche), lien vers `auth.users` si compte, ton choisi, ville, plan du vendredi activé | Un papa peut n'avoir que WhatsApp |
| `enfants` | papa, prénom, date de naissance (mois/année), goûts libres | Jamais de nom de famille ni d'école |
| `souvenirs` | enfant, date, type (histoire, sortie, activité, journée), texte court | Matière de l'histoire du soir et anti-répétition du plan |
| `usage` | papa, brique, date, retour 👍/👎 | Sert aux quotas et aux mesures |

## 4. Les quatre briques

Chaque brique tient en un message en entrée et une réponse en sortie. Pas de
menu, pas de formulaire. Le routeur déduit la brique du message ; en cas de
doute, il pose une question à choix.

### 4.1 SOS crise

- **Entrée** : vocal ou texte décrivant la crise.
- **Sortie** (moins de 5 s) : trois lignes fixes — la phrase à dire, le geste
  à faire, ce qu'il ne faut pas faire. Ton selon le réglage du papa.
- **Référence** : bibliothèque d'environ 30 situations types validées par
  l'expert (colère, coucher, repas, écrans, fratrie, séparation, départ à
  l'école…). L'IA s'appuie dessus et adapte à l'âge et au prénom.
- **Hors bibliothèque** : réponse plus prudente, et la situation part dans
  une file de relecture pour l'expert.
- **Retour** : « Ça a marché ? 👍 / 👎 » après coup.
- **Ouverture** : SOS crise n'est ouvert aux testeurs qu'une fois la
  bibliothèque validée par l'expert. Les trois autres briques peuvent partir
  avant.

### 4.2 Activité maison

- **Entrée** : photo (placard, bac de recyclage, salon) ou liste tapée.
- **Sortie** : 3 activités faisables tout de suite, chacune avec durée,
  matériel repéré et 3 étapes.
- **Sécurité selon l'âge** : pas de petites pièces avant 3 ans, pas d'objet
  coupant, pas de flamme, pas de produit ménager.
- La photo n'est pas conservée après la réponse.

### 4.3 Histoire du soir

- **Entrée** : demande d'histoire, avec si le papa veut un mot sur la journée.
- **Sortie** : texte de 5 minutes à lire à voix haute. L'enfant et le papa en
  sont les héros ; la morale répond doucement à ce qui s'est passé.
- L'histoire et le résumé de la journée sont enregistrés dans `souvenirs`.
- Pas de lecture audio en V1.

### 4.4 Plan du week-end

- **Entrée** : demande de plan, ou message automatique le vendredi à 17 h
  pour les papas qui l'ont activé.
- **Sortie** : samedi et dimanche, matin et après-midi. Une sortie issue de
  `/top`, un repli s'il pleut (une activité maison), un repas simple,
  l'histoire du soir.
- Évite de reproposer ce qui figure dans les `souvenirs` des 4 dernières
  semaines.

## 5. Parcours d'un message

1. **Identification** : numéro WhatsApp ou session Supabase. Un inconnu
   reçoit une mise en route en deux questions : prénom de l'enfant, âge.
2. **Contrôle danger**, avant toute IA : liste de mots-clés plus un
   classement rapide. En cas de danger pour l'enfant ou le papa, réponse fixe
   avec le 15 (urgence médicale), le 119 (enfance en danger) ou le 3114
   (prévention du suicide), et le traitement s'arrête.
3. **Quota** : au-delà, réponse claire avec le lien d'abonnement.
4. **Routage** vers la brique, appel à Claude avec le profil de l'enfant et
   ses souvenirs récents, réponse.
5. **Enregistrement** : souvenir, usage, retour.

### Quotas gratuits (par papa et par mois)

| Brique | Gratuit |
|---|---|
| SOS crise | 5 |
| Activité maison | 5 |
| Histoire du soir | 5 |
| Plan du week-end | 2 |

Au-delà : abonnement. Le prix se décide après la bêta.

## 6. Erreurs

| Cas | Réponse |
|---|---|
| IA lente (plus de 4 s sur WhatsApp) | Message d'attente « je réfléchis… », puis la réponse |
| IA en panne | Réponse de secours tirée de la bibliothèque (SOS) ou message d'excuse avec « réessaie dans une minute ». Jamais de silence |
| Vocal incompréhensible | « Je n'ai pas bien entendu, tu peux me l'écrire ? » |
| Photo illisible | L'IA demande une liste tapée |
| Brique ambiguë | Question à choix (SOS / activité / histoire / plan) |

## 7. Vie privée

- Données gardées : prénom et mois/année de naissance de l'enfant, goûts,
  souvenirs courts. Jamais de nom de famille, d'école, d'adresse ni de photo
  d'enfant.
- Photos de placard et vocaux supprimés après traitement.
- « Efface tout » dans la PWA, commande `EFFACE` sur WhatsApp : suppression
  du papa, de ses enfants, souvenirs et usage.
- `apps/on-sort/docs/politique-confidentialite.md` mise à jour avant
  l'ouverture de la bêta.

## 8. Expert caution

- Profil visé : psychologue de l'enfant, éducateur de jeunes enfants (EJE) ou
  puéricultrice, à Rennes ou alentour.
- Rôle : valider la bibliothèque des ~30 situations et le texte des garde-fous,
  relire la file des situations hors bibliothèque, prêter son nom
  (« réponses validées par … »).
- Livrables de préparation : profil cible et message d'approche, rédigés
  dans le plan d'implémentation.

## 9. Test

- **Automatisé** (vitest, comme `workers/on-sort`) : routage, contrôle
  danger sur une liste de phrases à risque, quotas, format de chaque brique,
  effacement.
- **Bêta fermée** : 10 à 30 papas du réseau de Wassim, 2 semaines.
- **Mesures** : papas actifs par semaine, usage par brique, taux de 👍.
- **Critère de réussite** : au moins 40 % des testeurs utilisent le copilote
  au moins une fois en semaine 2.

## 10. Hors périmètre (V1)

- Lecture audio des histoires.
- Paiement intégré (le lien d'abonnement peut pointer vers une liste
  d'attente pendant la bêta).
- Piliers Couple, Moi et Tribu.
- Apps natives sur les stores.
