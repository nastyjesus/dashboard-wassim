---
name: story-montage
description: "Skill pour monter les stories hebdomadaires de Wassim Loumi (format vertical 1080x1920, facecam SEO/IA/marketing). Utilise ce skill dès que Wassim parle de monter une story, faire le montage d'une story/vidéo/reel, story de la semaine, nouvelle story, ajouter sous-titres + logos + zoom sur une vidéo, ou via la commande /story-montage (ou /story). Le skill orchestre le pipeline Python C:\\Users\\sowph\\dashboard-wassim\\scripts\\story-montage\\montage.py : il prend le dernier mp4 du dossier Downloads (ou un chemin donné), coupe les respirations/silences, transcrit (faster-whisper), pose des sous-titres karaoké mot-par-mot corrigés, applique des zooms 'plateau' sur les mots clés, incruste les logos des marques/IA citées (ChatGPT, Google, Perplexity, Claude, HubSpot…) avec un effet pop + un son pop, remplace le fond par un flou via détourage RVM, et sort un story_finale.mp4. Le skill gère le cache (nettoyage quand on change de vidéo), télécharge les logos manquants via fetch_logos.py et les ajoute durablement, et propose de commit/push. Règle absolue — ne jamais inventer le contenu : transcrire la vraie vidéo ; si une marque citée n'a pas de logo, le télécharger réellement (Wikimedia) plutôt que d'improviser."
---

# /story-montage

Monte une story verticale (1080×1920) pour Wassim à partir d'une vidéo facecam brute. Sortie : `story_finale.mp4`.

Le gros du travail est fait par le script `montage.py` (déjà écrit et testé). Ton rôle ici : **orchestrer**, t'adapter au contenu de CHAQUE vidéo (marques citées, mots à zoomer, corrections de sous-titres), gérer le cache, et livrer.

## Emplacement du pipeline

- Repo : `C:\Users\sowph\dashboard-wassim` (branche de travail `claude/edit-seo-story-video-fD7BC`)
- Dossier : `scripts\story-montage\`
- Script principal : `montage.py`
- Détourage fond : `rvm_matte.py` (importé par montage.py)
- Récupération de logos : `fetch_logos.py`
- Assets persistants : `assets\` — logos de marque (`logo_*.png`), son (`pop.wav`). Les `emoji_*.png` sont régénérés à la volée.
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
- Le matting RVM la 1ʳᵉ fois télécharge le modèle (~15 Mo) via torch.hub (déjà fait une fois, mis en cache).
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

Puis un rendu rapide qui coupe les silences, transcrit, et pose sous-titres + zoom + logos (ceux déjà connus) — **sans** flou :

```powershell
python montage.py --input "<CHEMIN_VIDEO>" --output story_preview.mp4 --cut-silence
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
python montage.py --input "<CHEMIN_VIDEO>" --output story_preview.mp4 --cut-silence --skip-cut --skip-transcribe
```

Ouvre `story_preview.mp4` (`Invoke-Item`) pour valider coupe + sous-titres + logos + son pop AVANT le flou.

### Étape 3 — Rendu final avec fond flou

Quand Wassim valide le preview, ajoute le détourage RVM (lent, ~minutes) en réutilisant le cache :

```powershell
python montage.py --input "<CHEMIN_VIDEO>" --output story_finale.mp4 --cut-silence --skip-cut --skip-transcribe --bg-blur 20
```

Lancer en arrière-plan. À la fin, ouvrir le fichier + le dossier et **donner le chemin** :

```powershell
Invoke-Item "scripts\story-montage\story_finale.mp4"
Start-Process explorer.exe "/select,`"C:\Users\sowph\dashboard-wassim\scripts\story-montage\story_finale.mp4`""
```

### Étape 4 — Commit (si Wassim valide)

Si de nouveaux logos / corrections ont été ajoutés, proposer de commit + push (identité `Wassim Loumi <loumiwassim@gmail.com>` via `git -c user.name=… -c user.email=…`, car aucune identité git globale n'est configurée). Les `*.mp4` et `work*/` sont gitignorés ; les `logo_*.png` et `pop.wav` sont suivis.

## Réglages (flags de montage.py)

| Flag | Rôle | Défaut |
|---|---|---|
| `--input` / `--output` | source / sortie | — / story_finale.mp4 |
| `--cut-silence` | coupe respirations/silences | off |
| `--silence-db` | seuil silence (plus proche de 0 = + agressif ; trop = coupe la parole) | -35 |
| `--silence-min` | durée min de silence coupée (s) | 0.40 |
| `--skip-cut` | réutilise `work/tightened.mp4` | off |
| `--bg-blur SIGMA` | fond flou via RVM (ex. 20) | off |
| `--skip-matte` | réutilise `work_rvm/pha.mp4` | off |
| `--skip-transcribe` | réutilise `work/transcript.json` | off |
| `--punch-words` | mots qui déclenchent un zoom | set PUNCH_WORDS |
| `--accent-words` | mots colorés dans les sous-titres | liste SEO |
| `--no-logo-pop-sound` | désactive le son pop | off |
| `--handle` / `--accent` | watermark / couleur de marque | @wassimloumi / #2563EB |

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

`cut-silence` (re-encode tightened.mp4) → transcribe (sur tightened) → sous-titres + détection marques/zooms → RVM matte (sur tightened) → compositing fond flou → chaîne overlay (zoom plateau → sous-titres → progress bar → watermark → emoji → logos pop) → mix audio (voix + sons pop) → x264.

## Dépannage

- **« 0 silences » / coupe nulle** : seuil trop bas (trop négatif) → remonter `--silence-db` (ex. -30) ou baisser `--silence-min`.
- **Transcript haché, marques manquantes** : coupe trop agressive → `--silence-db` plus négatif (-38/-40).
- **Logo pas affiché** : la marque n'est pas dans `BRAND_LOGOS`, ou le `logo_*.png` manque dans `assets\`, ou le mot est mal transcrit (ajouter un alias).
- **2 logos se chevauchent** : ils s'alternent déjà sur 2 rangées (`row`) ; si besoin espacer via la position `cy` dans `build_filter_complex`.
- **ffmpeg crash `0xC0000005` sur drawtext** : police manquante — `montage.py` passe déjà un `fontfile` explicite sous Windows.
- **pip a cassé numpy** : `pip install "numpy==1.26.3"`.
- **Exit code mais mp4 produit** : le `print` final est protégé ; vérifier la présence/horodatage du fichier de sortie.
