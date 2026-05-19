# Montage Story SEO — Handoff pour Claude Desktop

## Contexte

L'utilisateur (Wassim, consultant SEO) a tourné une vidéo verticale qu'il veut
publier en story Instagram pour sa communauté SEO. Il veut un montage avec :

- Sous-titres dynamiques (style story / "burned-in", gros, animés)
- Petits pops d'illustrations SEO sans couvrir sa voix (loupe, Google, graphique, robot, etc.)
- Du dynamisme général (barre de progression story, légers zooms, watermark discret)
- Vulgarisation du côté technique SEO

## Source

Vidéo originale : `90e32d5b-VID_20260519_152730.mp4`
- Format : 1080×1920 vertical, 30 fps, 28,8 s
- Codec : H.264 / AAC

L'utilisateur a uploadé la vidéo depuis Claude Code sur le web. Sur Claude Desktop,
**il faut lui demander le chemin local de la vidéo** (probablement
`~/Downloads/VID_20260519_152730.mp4` ou similaire).

## Ce qui a été tenté sur Claude Code Web

- ✅ ffmpeg installé et testé (vidéo lue, métadonnées OK)
- ❌ Transcription Whisper impossible : le réseau de l'environnement web bloque
  HuggingFace, Vosk, et le CDN OpenAI Whisper (`Host not in allowlist`)
- ⛔ Donc impossible de finir le montage sur le web → handoff vers Claude Desktop
  qui aura accès à internet sans restriction et au système local de Wassim

## Pipeline prévu (à exécuter sur Claude Desktop)

Le script `montage.py` fait tout :

1. **Transcription** : `faster-whisper` (modèle `small`, FR) avec timestamps par mot
2. **Sous-titres** : génère un `.ass` style story (police bold, taille ~64, blanc + outline noir + ombre, position bas-centre, animation pop par groupe de 2-3 mots)
3. **Overlays SEO** : insère des emojis/PNG aux mots-clés détectés
   (Google, SEO, référencement, mot-clé, classement, etc.) — fade-in/out 1.2s,
   coin haut-droit pour ne pas masquer le visage
4. **Dynamique** :
   - Barre de progression story (1080×6 px en haut, blanc, s'allonge sur 28,8s)
   - Léger zoom (1.0 → 1.04) sur les 5 dernières secondes pour finir en punch
   - Watermark discret coin bas-gauche : `@wassim.seo` (à personnaliser)
5. **Encodage final** : H.264 yuv420p, AAC 128k, faststart → `story_finale.mp4`

## Étapes pour Claude Desktop

```bash
cd scripts/story-montage
# 1. Vérifier ffmpeg et installer les deps Python
ffmpeg -version | head -1
pip install -r requirements.txt

# 2. Lancer le montage (chemin source = à demander à Wassim)
python montage.py --input "/CHEMIN/VERS/VID_20260519_152730.mp4" --output story_finale.mp4

# 3. Si la transcription a des erreurs, éditer transcript.json puis relancer avec --skip-transcribe
python montage.py --input "..." --output story_finale.mp4 --skip-transcribe
```

## Charte graphique

Brand validée le 19/05/2026 avec Wassim :
- Ambiance **fond sombre / accent clair** (vu sur sa home wassimloumicorporate.com)
- Couleur d'accent : **bleu corporate `#2563EB`** (utilisée pour la progress bar,
  le soulignage du watermark, et le surlignage des mots-clés dans les sous-titres)
- Police : **Montserrat** (sans-serif moderne, fallback `DejaVu Sans` si non installée)
- Handle : `@wassimloumi`

**Important sur Claude Desktop** : si tu as un accès web, va vérifier la home
`https://wassimloumicorporate.com` pour confirmer le hex exact du bleu et la
police réelle utilisée. Le sandbox web ne pouvait pas accéder au domaine
(network policy `host_not_allowed`), donc les valeurs ci-dessus sont les
choix que Wassim a confirmés à l'oral. Si la home utilise une autre nuance
de bleu ou une autre police (Inter, Poppins…), repasse-les en CLI :

```bash
python montage.py --input ... --accent "#XXXXXX" --font "Inter"
```

## Choses à confirmer avec Wassim au démarrage

1. **Transcription** : valider `work/transcript.json` avant le rendu final (recommandé)
2. **Mots-clés à surligner** : la dict `SEO_KEYWORDS` (emojis) et le flag
   `--accent-words` (couleur bleue dans les sous-titres) ont des valeurs par défaut,
    à adapter selon le contenu réel de la vidéo
3. **Couleur exacte de la home** si différente du `#2563EB` actuel

## Style validé

- Sous-titres en bas, pas trop hauts (visage doit rester visible)
- Pas trop d'illustrations (l'utilisateur a explicitement demandé "que ça ne prenne pas trop de place")
- Pops discrets, ne pas couvrir la voix (visuel only)
- Cible : communauté SEO sensible à la partie technique mais qui veut de la vulgarisation
