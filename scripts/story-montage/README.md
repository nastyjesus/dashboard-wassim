# Story SEO Montage

Pipeline pour transformer une vidéo brute verticale en story Instagram avec
sous-titres animés, overlays SEO et progress bar.

## Usage

```bash
# Installer les dépendances
pip install -r requirements.txt   # ffmpeg doit déjà être installé

# Lancer le montage
python montage.py \
  --input ~/Downloads/VID_20260519_152730.mp4 \
  --output story_finale.mp4 \
  --handle "@wassim.seo"
```

Le premier run télécharge le modèle `faster-whisper small` (~250 Mo).

## Options

- `--model` : taille du modèle Whisper (`tiny`, `base`, `small`, `medium`).
  `small` est un bon compromis qualité/vitesse pour 30 s de FR clair.
- `--skip-transcribe` : réutilise le `work/transcript.json` existant si tu l'as
  édité à la main pour corriger des erreurs de transcription.
- `--font` : police des sous-titres (défaut `DejaVu Sans`). Sur Mac essaie
  `Helvetica Neue Bold`, sur Windows `Montserrat`.

## Édition manuelle

Le fichier `work/transcript.json` est généré après transcription. Tu peux y
modifier les `text` ou les timings, puis relancer avec `--skip-transcribe`.

Pour ajouter/retirer des mots-clés qui déclenchent un emoji, édite la dict
`SEO_KEYWORDS` dans `montage.py`.

## Ce que produit le script

1. Sous-titres burned-in style story (gros, blanc, contour noir, pop-in 120 ms)
2. Barre de progression blanche en haut qui se remplit sur la durée
3. Emoji SEO (🔍 📈 🔑 etc.) en haut à droite, fade 1.4 s, sur les mots-clés
4. Handle `@wassim.seo` en bas à gauche, semi-transparent
5. Léger zoom (1.0 → 1.04) sur les 5 dernières secondes
