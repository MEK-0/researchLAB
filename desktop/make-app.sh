#!/usr/bin/env bash
# Dock'a sabitlenebilir geçici kısayol: run.sh'ı çağıran küçük bir AppleScript uygulaması.
# Ek kurulum gerektirmez (osacompile, sips, iconutil macOS'ta hazır). Repoya girmez.
#   ./desktop/make-app.sh [hedef]    varsayılan: ~/Applications/researchLAB.app
# Not: paketleme olmadığı için çalışan pencere Dock'ta ayrıca "Electron" olarak görünür (Faz 5b).
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="${1:-$HOME/Applications/researchLAB.app}"
mkdir -p "$(dirname "$APP")"
RUN_Q="$(printf '%q' "$DIR/run.sh")"
# AppleScript dizgesi içinde \ ve " kaçışlanır
RUN_AS="$(printf '%s' "$RUN_Q" | sed 's/\\/\\\\/g; s/"/\\"/g')"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
cat > "$TMP/app.applescript" <<AS
-- researchLAB: desktop/run.sh'ı arka planda başlatır ve hemen çıkar.
do shell script "mkdir -p ~/Library/Logs; $RUN_AS >> ~/Library/Logs/researchLAB.log 2>&1 &"
AS
rm -rf "$APP"
osacompile -o "$APP" "$TMP/app.applescript"
# ikon: desktop/assets/icon.png → applet.icns
mkdir "$TMP/i.iconset"
for s in 16 32 128 256 512; do
  sips -z $s $s "$DIR/assets/icon.png" --out "$TMP/i.iconset/icon_${s}x${s}.png" >/dev/null
  d=$((s * 2)); [[ $d -le 512 ]] && sips -z $d $d "$DIR/assets/icon.png" --out "$TMP/i.iconset/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$TMP/i.iconset" -o "$APP/Contents/Resources/applet.icns"
# ikon eklenince imza bozulur; yerel (ad-hoc) imzayı yenile
codesign --force --sign - "$APP" 2>/dev/null || true
touch "$APP"
echo "Oluşturuldu: $APP  (Finder'da açıp Dock'a sürükleyebilirsin)"
