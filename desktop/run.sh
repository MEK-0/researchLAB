#!/usr/bin/env bash
# researchLAB masaüstü uygulamasını açar (paketleme yok: npm run dev).
# Finder/Dock'tan çağrıldığında PATH kısıtlıdır; npm'i login shell PATH'inden bulur.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if ! command -v npm >/dev/null 2>&1; then
  SH="${SHELL:-/bin/zsh}"
  LP="$("$SH" -ilc 'printf "__P__%s__P__" "$PATH"' 2>/dev/null | sed -n 's/.*__P__\(.*\)__P__.*/\1/p' || true)"
  export PATH="${LP:+$LP:}/opt/homebrew/bin:/usr/local/bin:$PATH"
fi
command -v npm >/dev/null 2>&1 || { echo "npm bulunamadı: Node.js kur (ör. brew install node)"; exit 1; }
cd "$DIR"
[[ -x node_modules/.bin/electron ]] || npm install --no-fund --no-audit
exec npm run dev --silent -- "$@"
