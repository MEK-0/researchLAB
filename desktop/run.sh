#!/usr/bin/env bash
# researchLAB masaüstü uygulamasını açar (paketleme yok: npm run dev).
# Finder/Dock'tan çağrıldığında PATH kısıtlıdır; npm'i login shell PATH'inden bulur.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if ! command -v npm >/dev/null 2>&1; then
  # Login shell PATH'i geçici dosyaya yazdırılır (pipe değil): rc dosyalarının başlattığı
  # arka plan süreçleri pipe'ı açık tutarsa $(...) hiç bitmez. En fazla 3 sn beklenir.
  SH="${SHELL:-/bin/zsh}"; TMPF="$(mktemp)"
  "$SH" -ilc 'printf "%s" "$PATH" > "$1"' _ "$TMPF" </dev/null >/dev/null 2>&1 &
  pid=$!
  for _ in $(seq 1 30); do kill -0 "$pid" 2>/dev/null || break; sleep 0.1; done
  kill "$pid" 2>/dev/null || true
  LP="$(cat "$TMPF" 2>/dev/null || true)"; rm -f "$TMPF"
  export PATH="${LP:+$LP:}/opt/homebrew/bin:/usr/local/bin:$PATH"
fi
command -v npm >/dev/null 2>&1 || { echo "npm bulunamadı: Node.js kur (ör. brew install node)"; exit 1; }
cd "$DIR"
[[ -x node_modules/.bin/electron ]] || npm install --no-fund --no-audit
exec npm run dev --silent -- "$@"
