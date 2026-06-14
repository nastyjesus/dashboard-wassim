---
name: story-montage
description: "Skill pour monter les stories hebdomadaires de Wassim Loumi (format vertical 1080x1920, facecam SEO/IA/marketing) ET leur déclinaison en short YouTube. Utilise ce skill dès que Wassim parle de monter une story, faire le montage d'une story/vidéo/reel/short, story de la semaine, nouvelle story, ajouter sous-titres + logos + zoom sur une vidéo, ou via la commande /story-montage (ou /story). Le skill orchestre le pipeline Python C:\\Users\\sowph\\dashboard-wassim\\scripts\\story-montage\\montage.py : il prend la vidéo source (Drive YouTube, Downloads, Bureau ou chemin donné), coupe les respirations/silences, transcrit (faster-whisper), pose des sous-titres karaoké mot-par-mot corrigés, applique des zooms 'plateau' sur les mots clés, incruste les logos des marques/IA citées (ChatGPT, Google, Perplexity, Claude, HubSpot…) avec un effet pop + un son pop, remplace le fond par un flou via détourage RVM (systématique sur les rendus finaux), et produit DEUX sorties : (1) story_finale.mp4 pour les stories Insta/LinkedIn ; (2) short_youtube.mp4 qui ajoute une musique chill en background avec ducking sidechain (ne couvre jamais la voix) + un bouton 'S'abonner' rouge YouTube qui slide-up sur le CTA final. Avant la livraison, le skill propose SYSTÉMATIQUEMENT 5 titres YouTube optimisés pour le clic (5 angles distincts : urgence, news, curiosity-gap, conseil d'expert, peur+solution ; ≥60 chars, basés sur le contenu réel transcrit). Le skill gère le cache (nettoyage quand on change de vidéo), télécharge les logos manquants via fetch_logos.py et les ajoute durablement, télécharge une musique libre de droits via fetch_music.py si manquante, et propose de commit/push. Règle absolue — ne jamais inventer le contenu : transcrire la vraie vidéo ; si une marque citée n'a pas de logo, le télécharger réellement (Wikimedia) plutôt que d'improviser."
---

# /story-montage

Monte deux versions d'une vidéo verticale (1080×1920) pour Wassim à partir d'un facecam brut :
- **`story_finale.mp4`** — pour Insta/LinkedIn stories
- **`short_youtube.mp4`** — pour YouTube Shorts (+ musique chill duckée + bouton "S'abonner" animé)

Les deux rendus finaux ont **systématiquement** le fond flou via détourage RVM.

Le gros du travail est fait par le script `montage.py` (déjà écrit et testé). Ton rôle ici : **orchestrer**, t'adapter au contenu de CHAQUE vidéo (marques citées, mots à zoomer, corrections de sous-titres), gérer le cache, et livrer.

## Emplacement du pipeline

- Repo : `C:\Users\sowph\dashboard-wassim` (branche de travail `claude/edit-seo-story-video-fD7BC`)
- Dossier : `scripts\story-montage\`
- Script principal : `montage.py`
- Détourage fond : `rvm_matte.py` (importé par montage.py)
- Récupération de logos : `fetch_logos.py`
- Récupération de musique : `fetch_music.py` (télécharge un track chill libre de droits dans `assets/music_chill.mp3`)
- Génération bouton S'abonner : `make_subscribe_button.py` (régénère `assets/subscribe_button.png`)
- Assets persistants : `assets\` — logos de marque (`logo_*.png`), son (`pop.wav`), musique (`music_chill.mp3`), bouton (`subscribe_button.png`). Les `emoji_*.png` sont régénérés à la volée.
- Caches (jetables) : `work\` (audio, transcript, subs.ass, tightened.mp4, bg_replaced.mp4) et `work_rvm\` (pha.mp4 = masque alpha)

## Règles absolues

1. **Jamais inventer le contenu.** On transcrit la vraie vidéo avec Whisper. Les marques affichées sont celles réellement citées. Les chiffres SEO éventuels ne sont jamais inventés.
2. **Un logo manquant se télécharge, ne s'improvise pas.** Si une marque est citée sans logo dans `assets\`, utilise `fetch_logos.py` (Wikimedia Commons) puis ajoute l'entrée dans `BRAND_LOGOS`. Si le téléchargement échoue, demande à Wassim un PNG plutôt que de bricoler.
3. **Nettoyer le cache en changeant de vidéo.** `montage.py` ne clé pas son cache sur l'input → si on traite une nouvelle vidéo, supprimer les fichiers de `work\` et `work_rvm\` AVANT, sinon il réutilise l'ancien audio/transcript/matte. (Voir étape 1.)
4. **Valider le rapide avant le lent.** Le détourage RVM (fond flou) prend plusieurs minutes sur CPU. Toujours faire un 1er rendu SANS flou pour valider coupe + sous-titres + logos, puis le rendu final AVEC flou en réutilisant le cache.
5. **Confirmer avant de commit.** Ne commit/push que si Wassim valide.

## Environnement (gotchas Windows)

- Shell par défaut = **PowerShell 5.1** : pas de `&&`. Chaîner avec `;` ou `; if ($?) { … }`.
- Lancer les rendus en **arrière-plan** (`run_in_background: true`) car ça dure 30 s à plusieurs minutes ; lire ensuite le fichier de sortie.
- Le matting RVM la 1ème fois télécharge le modèle (~15 Mo) via torch.hub (déjà fait une fois, mis en cache).
- Dépendances déjà installées : `torch` (CPU), `faster-whisper`, `pims`, `Pillow`, ffmpeg/ffprobe dans le PATH. **Ne pas** laisser pip passer numpy en 2.x (casse faster-whisper) — garder `numpy==1.26.3`.

## Workflow

### Étape 0 — Trouver la vidéo source

Par défaut, le dernier `.mp4` du dossier Downloads :

```powershell
Get-ChildItem "$env:USERPROFILE\Downloads\*.mp4" | Sort-Object LastWriteTime -Descending | Select-Object -First 3 FullName, LastWriteTime
```

Montre les candidats à Wassim et confirme lequel (ou prends un chemin qu'il donne).

### Étape 1 — Nettoyer le cache + 1er rendu (rapide, sans flou)

Supprime les caches de l'ancienne vidéo (le wildcard `work\*` est bloqué — supprimer nommément) :

```powershell
$f = @("work\audio.wav","work\transcript.json","work\subs.ass","work\tightened.mp4","work\bg_replaced.mp4","work_rvm\pha.mp4","work_rvm\fgr.mp4")
foreach ($x in $f) { if (Test-Path $x) { Remove-Item $x -Force } }
```

Puis un rendu rapide qui coupe les silences, transcrit, et pose sous-titres + zoom + logos (ceux déjà connus) — **sans** flou (flag `--no-bg-blur` car le flou est désormais ON par défaut) :

```powershell
python montage.py --input "<CHEMIN_VIDEO>" --output story_preview.mp4 --cut-silence --no-bg-blur
```

### Étape 2 — Adapter au contenu (marques, mots, corrections)

Lis le transcript et la détection :

```powershell
python -c "import json,re; from montage import strip_accents,BRAND_LOGOS,find_brand_mentions,PUNCH_WORDS; s=json.load(open('work/transcript.json',encoding='utf-8')); print(' '.join(x['text'] for x in s)); print('BRANDS:',find_brand_mentions(s))"
```

- **Marques citées sans logo** : pour chaque marque entendue (ChatGPT, Google, Perplexity, Claude, HubSpot, Gemini, Mistral, Notion, Semrush, Ahrefs…) qui n'a pas d'entrée dans `BRAND_LOGOS` / de fichier dans `assets\` :
  1. Ajoute son nom + requête dans le dict `BRANDS` de `fetch_logos.py`, lance `python fetch_logos.py` (télécharge depuis Wikimedia Commons et fabrique une carte blanche « sticker »).
  2. Ajoute l'entrée dans `BRAND_LOGOS` de `montage.py` (clé = token normalisé en minuscules sans accents → `logo_<nom>.png`). Pense aux alias de mauvaise transcription (ex. `cloud` → logo Claude, `plexity` → Perplexity).
  3. Si pertinent, ajoute le mot à `PUNCH_WORDS` (zoom) et à `SUBTITLE_CORRECTIONS` (orthographe affichée).
- **Sous-titres incohérents** : Whisper se trompe sur les noms. Ajoute les corrections dans `SUBTITLE_CORRECTIONS` de `montage.py` (ex. `cloud`→`Claude`, `ria`→`IA`, `perplexi`→`Perplexity`). Re-render rapide pour vérifier.
- Montre à Wassim le texte + les marques/zooms détectés ; demande s'il veut ajouter/retirer des mots à zoomer (`--punch-words`) ou des marques.

Re-render rapide après ajustements (réutilise le cache, donc vite) :

```powershell
python montage.py --input "<CHEMIN_VIDEO>" --output story_preview.mp4 --cut-silence --skip-cut --skip-transcribe --no-bg-blur
```

Ouvre `story_preview.mp4` (`Invoke-Item`) pour valider coupe + sous-titres + logos + son pop AVANT le flou.

### Étape 3 — Rendu final story (fond flou SYSTÉMATIQUE)

Quand Wassim valide le preview, lance le rendu final story avec détourage RVM (lent, ~minutes la 1ère fois ; les rendus suivants réutilisent le matte cached). **Le flou est systématique et ON par défaut** — ne JAMAIS passer `--no-bg-blur` sur un rendu final.

```powershell
python montage.py --input "<CHEMIN_VIDEO>" --output story_finale.mp4 --cut-silence --skip-cut --skip-transcribe
```

Lancer en arrière-plan.

### Étape 4 — Rendu short YouTube (flou + musique duckée + bouton S'abonner)

**Tout montage doit produire les DEUX sorties.** Une fois la story validée et son matte cached (`work_rvm/pha.mp4`), enchaîne immédiatement avec le rendu short YouTube en réutilisant tous les caches (`--skip-cut --skip-transcribe --skip-matte`) :

```powershell
python montage.py --input "<CHEMIN_VIDEO>" --output short_youtube.mp4 --cut-silence --skip-cut --skip-transcribe --skip-matte --youtube-short
```

Ce mode ajoute en plus :
- Une **musique de fond** chill/corporate (`assets/music_chill.mp3`) **duckée** par sidechain compress (la voix garde toujours le dessus — quand Wassim parle, la musique baisse automatiquement ; sur les pauses, elle remonte). Volume par défaut 0.20 (`--music-volume`).
- Un **bouton "S'abonner"** rouge YouTube (`assets/subscribe_button.png`) qui slide-up avec un overshoot ease-out-back sur les dernières secondes (par défaut 4.5s avant la fin, configurable via `--subscribe-lead-time`).

**Si `assets/music_chill.mp3` est manquant** (premier run, ou nettoyage), lancer d'abord :

```powershell
python fetch_music.py
```

Le script teste plusieurs URLs (Mixkit, Pixabay CDN) et garde la première qui répond avec un MP3 valide. Si tout échoue, Wassim dépose un MP3 manuel dans `assets/music_chill.mp3`.

**Si `assets/subscribe_button.png` est manquant** :

```powershell
python make_subscribe_button.py
```

Re-génère le bouton (cloche + texte blanc bold sur rouge YouTube + ombre douce).

### Étape 5 — 5 titres YouTube optimisés pour le clic

**Obligatoire** à chaque montage. Avant de livrer, propose à Wassim **5 titres** pour le short YouTube, sous 5 angles distincts pour qu'il choisisse celui qui résonne le mieux ce jour-là :

1. **Urgence / alerte** — "­ƒÜ¿" ou "ÔÜá´©Å" + injonction directe ("ARRÈTE", "NE FAIS PAS", deadline)
2. **News / annonce** — fait factuel + appel à l'action ("Google sort X", "voici ce qu'il faut faire")
3. **Curiosity gap / chiffre** — l'erreur non-nommée, chiffre ou pourcentage qui intrigue
4. **Conseil d'expert** — posture d'autorité, ton posé ("mon conseil SEO", "ce que je dis à mes clients")
5. **Peur + solution** — risque émotionnel ("ton SEO va trembler") + promesse de réponse ("voici comment éviter X")

Contraintes **non-négociables** :
- **≥ 60 chars** (lisible mobile sans troncature ; 65 max si vraiment punchy)
- **Caps stratégiques** sur 1 à 2 mots forts max (jamais tout en majuscules)
- **Emoji optionnel** au tout début seulement (­ƒÜ¿ ÔÜá´©Å ­ƒôë ­ƒöÑ ­ƒñû — un seul, jamais plusieurs)
- **Mot-clé SEO de la vidéo** présent (Google, ChatGPT, SEO, IA, mise à jour, ranking, etc. — uniquement ce qui est RÉELLEMENT dit)
- **JAMAIS inventer** un angle / chiffre / promesse qui n'est pas dans la vidéo. Tous les titres doivent refléter le contenu transcrit.

Présente les 5 titres en bullet list (un angle par titre), demande à Wassim lequel il prend (ou s'il veut une variation). S'il choisit, suggère aussi une **description courte** YouTube (3-5 lignes) qui développe le hook + appel à l'action vers le site / contact.

### Étape 6 — Conseil stickers d'interaction pour la story Instagram/LinkedIn

**Obligatoire** à chaque montage. Ce skill ne touche PAS au mp4 et n'ajoute AUCUN sticker dans la vidéo : il **conseille** uniquement. Après le rendu de `story_finale.mp4`, propose à Wassim **3 stickers d'interaction** qu'il ajoutera lui-même dans l'éditeur Instagram/LinkedIn au moment du post pour faire monter l'engagement.

Catalogue des stickers possibles (Insta + LinkedIn supportent les principaux) :

| Sticker | Quand l'utiliser | Effet |
|---|---|---|
| **Sondage Oui/Non** | une question binaire claire issue de la vidéo | engagement maximal, 1 tap |
| **Quiz à choix multiple** | un fait précis énoncé dans la vidéo (date, chiffre, technique) | apprentissage + dopamine "j'avais raison" |
| **Slider emoji** | mesurer une intensité (inquiétude, confiance, accord) | engagement fluide sans bonne/mauvaise réponse |
| **Question box** | inviter à partager un cas perso ("ta plus grosse galère SEO ?") | nourrit le carnet d'idées + DM entrants |
| **Compte à rebours** | si la vidéo mentionne une deadline (update Google, lancement) | suspense, partage facile |
| **Lien** | rediriger vers une page (article, contact, ressource) | conversion vers le site |
| **Mention** | si la vidéo cite un partenaire / outil / personne | networking + reach |

Règles **non-négociables** :
- **Propose 3 stickers maximum**, chacun avec : (a) son type, (b) l'intitulé exact à taper, (c) l'option/format précis (ex. "Oui / Non", "0 → 100", liste des choix), (d) le moment de la story où le placer (début pour le hook, milieu pour engager, fin pour CTA).
- **Tout doit refléter le contenu réel** transcrit. Jamais inventer un fait, une promesse ou une question hors-sujet.
- **Toujours inclure au moins 1 sticker à fort engagement** (Sondage Oui/Non OU Quiz), car c'est ce qui pousse l'algo Insta/LinkedIn.
- Le **3ème sticker** peut être plus créatif (question box, slider, countdown) selon ce qui colle au ton de la vidéo.

Format de présentation :

```
1. **[Sondage]** "Tu utilises encore les FAQ pour ton SEO ?" → Oui / Non
   Place vers la 5e seconde (après le hook factuel).

2. **[Quiz]** "Quand l'update Google entre en vigueur ?"
   Choix : 5 juin / 8 juin / 15 juin (bonne réponse : 8 juin)
   Place au milieu de la story.

3. **[Question box]** "Quelle est ta plus grosse question SEO en ce moment ?"
   Place sur le CTA final, juste avant "n'hésite pas à me contacter".
```

Demande à Wassim s'il garde ces 3 ou s'il veut une variation.

### Étape 7 — Livraison

Une fois les deux rendus terminés (et le titre validé), ouvrir les fichiers + le dossier et **donner les deux chemins** :

```powershell
Invoke-Item "scripts\story-montage\story_finale.mp4"
Invoke-Item "scripts\story-montage\short_youtube.mp4"
Start-Process explorer.exe "/select,`"C:\Users\sowph\dashboard-wassim\scripts\story-montage\story_finale.mp4`""
```

### Étape 8 — Commit (si Wassim valide)

Si de nouveaux logos / corrections ont été ajoutés, proposer de commit + push (identité `Wassim Loumi <loumiwassim@gmail.com>` via `git -c user.name=… -c user.email=…`, car aucune identité git globale n'est configurée). Les `*.mp4` et `work*/` sont gitignorés ; les `logo_*.png` et `pop.wav` sont suivis.

## Réglages (flags de montage.py)

| Flag | Rôle | Défaut |
|---|---|---|
| `--input` / `--output` | source / sortie | — / story_finale.mp4 |
| `--cut-silence` | coupe respirations/silences | off |
| `--silence-db` | seuil silence (plus proche de 0 = + agressif ; trop = coupe la parole) | -35 |
| `--silence-min` | durée min de silence coupée (s) | 0.40 |
| `--skip-cut` | réutilise `work/tightened.mp4` | off |
| `--bg-blur SIGMA` | fond flou via RVM — **ON par défaut** (systématique sur les rendus finaux) | **20** |
| `--no-bg-blur` | désactive le flou (utiliser SEULEMENT pour les previews rapides) | off |
| `--skip-matte` | réutilise `work_rvm/pha.mp4` | off |
| `--skip-transcribe` | réutilise `work/transcript.json` | off |
| `--punch-words` | mots qui déclenchent un zoom | set PUNCH_WORDS |
| `--accent-words` | mots colorés dans les sous-titres | liste SEO |
| `--no-logo-pop-sound` | désactive le son pop | off |
| `--handle` / `--accent` | watermark / couleur de marque | @wassimloumi / #2563EB |
| **`--youtube-short`** | **mode short YouTube : ajoute musique duckée + bouton S'abonner animé** | **off** |
| `--music` | chemin vers la musique de fond | `assets/music_chill.mp3` |
| `--music-volume` | volume musique avant ducking (0..1) | 0.20 |
| `--subscribe-asset` | PNG du bouton S'abonner | `assets/subscribe_button.png` |
| `--subscribe-lead-time` | secondes avant la fin pour le slide-up du bouton | 4.5 |

Réglages « créatifs » dans le code (constantes en haut de `montage.py` / fonctions) :
- Zoom : `build_zoom_expression` (force `strength`, durée plateau `hold`).
- Pop logo : `build_pop_scale_expr` (overshoot) ; son pop : `ensure_pop_sound`.
- Sous-titres karaoké : `write_ass`.

## Calibrage de la coupe silence (important)

Chaque vidéo a un niveau sonore différent. -20 dB peut couper 1/3 d'une vidéo (DANS la parole) alors que -35 dB ne prend que les vraies respirations. Si la coupe semble trop forte ou hache la parole, sonder d'abord :

```powershell
ffmpeg -hide_banner -i "<VIDEO>" -af "silencedetect=noise=-35dB:d=0.40" -f null - 2>&1 | Select-String "silence_duration"
```

Viser ~1 à 3 s coupés au total sur une story de ~25-30 s. Si le transcript ressort haché (mots tronqués, marques disparues), c'est que la coupe est trop agressive → remonter `--silence-db` vers -38/-40.

## Ordre interne du pipeline (pour debug)

`cut-silence` (re-encode tightened.mp4) → transcribe (sur tightened) → sous-titres + détection marques/zooms → RVM matte (sur tightened) → compositing fond flou → chaîne overlay (zoom plateau → sous-titres → progress bar → watermark → emoji → logos pop) → mix audio (voix + sons pop) → **si `--youtube-short` : ducking sidechain musique + overlay bouton S'abonner slide-up** → x264.

## Dépannage

- **« 0 silences » / coupe nulle** : seuil trop bas (trop négatif) → remonter `--silence-db` (ex. -30) ou baisser `--silence-min`.
- **Transcript haché, marques manquantes** : coupe trop agressive → `--silence-db` plus négatif (-38/-40).
- **Logo pas affiché** : la marque n'est pas dans `BRAND_LOGOS`, ou le `logo_*.png` manque dans `assets\`, ou le mot est mal transcrit (ajouter un alias).
- **2 logos se chevauchent** : ils s'alternent déjà sur 2 rangées (`row`) ; si besoin espacer via la position `cy` dans `build_filter_complex`.
- **ffmpeg crash `0xC0000005` sur drawtext** : police manquante — `montage.py` passe déjà un `fontfile` explicite sous Windows.
- **pip a cassé numpy** : `pip install "numpy==1.26.3"`.
- **Exit code mais mp4 produit** : le `print` final est protégé ; vérifier la présence/horodatage du fichier de sortie.
- **`--youtube-short` plante avec « output (vout) unconnected »** : régression sur le rename du label `[vout]` → `[vpre_sub]` dans `main()`. Doit être inconditionnel (le mix audio ajoute `[aout]` après build_filter_complex donc `fc.endswith('[vout]')` est faux).
- **Musique manquante** : `python fetch_music.py` (Mixkit/Pixabay CDN). Si tout échoue, déposer manuellement un MP3 chill ÔëÑ 60s dans `assets/music_chill.mp3`.
- **Voix couverte par la musique** : baisser `--music-volume` (ex. 0.12) ou agressiver le ducking (modifier `threshold=0.05` et `ratio=12` dans le bloc `--youtube-short` de `montage.py`).
- **Bouton S'abonner pas visible** : vérifier que `assets/subscribe_button.png` existe ; sinon `python make_subscribe_button.py`. Vérifier que `--subscribe-lead-time` < durée vidéo.

