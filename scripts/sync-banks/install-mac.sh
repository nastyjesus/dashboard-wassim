#!/bin/bash
# install-mac.sh — installe le launchd agent qui sync les banques chaque jour à 7h.
#
# Usage : ./install-mac.sh

set -e
cd "$(dirname "$0")"
SCRIPT_DIR="$(pwd)"
PLIST_LABEL="com.wassim.dashboard.sync-banks"
PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_LABEL.plist"

if [ ! -f .env ]; then
  echo "❌ Crée d'abord ton .env :  cp .env.example .env  puis nano .env" >&2
  exit 2
fi

# Smoke test : on vérifie que le script run-sync marche avant d'installer launchd
chmod +x run-sync.sh
echo "── Smoke test : lancement manuel d'une sync ──"
./run-sync.sh
echo "── Smoke test OK ──"

# Si déjà installé, on unload pour que le reload prenne en compte la nouvelle plist
if [ -f "$PLIST_PATH" ]; then
  launchctl unload "$PLIST_PATH" 2>/dev/null || true
fi

# Génère la plist avec les chemins absolus actuels
cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$PLIST_LABEL</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>-l</string>
        <string>$SCRIPT_DIR/run-sync.sh</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>7</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <key>RunAtLoad</key>
    <false/>
    <key>StandardOutPath</key>
    <string>$SCRIPT_DIR/sync.log</string>
    <key>StandardErrorPath</key>
    <string>$SCRIPT_DIR/sync.error.log</string>
</dict>
</plist>
EOF

launchctl load "$PLIST_PATH"

echo
echo "✅ launchd agent installé : $PLIST_PATH"
echo "   ↳ tournera chaque jour à 7h (si Mac allumé ou au réveil)."
echo
echo "Commandes utiles :"
echo "  launchctl start  $PLIST_LABEL     # forcer un run maintenant"
echo "  launchctl unload $PLIST_PATH      # désactiver"
echo "  tail -f $SCRIPT_DIR/sync.log      # voir les logs"
echo "  tail -f $SCRIPT_DIR/sync.error.log"
