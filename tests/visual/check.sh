#!/usr/bin/env bash
# Görsel regresyon: ofis sahnesini #freeze ve #freeze=work modlarında headless
# Chrome ile çizer, canvas piksellerini tests/visual/baseline/ ile karşılaştırır.
#   tests/visual/check.sh            karşılaştır (fark varsa exit 1)
#   tests/visual/check.sh --update   tabanı yenile (bilinçli görsel değişiklikten sonra)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BASE="$ROOT/tests/visual/baseline"
OUT="$(mktemp -d)"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
PORT="${PORT:-8790}"
[[ -x "$CHROME" ]] || { echo "Chrome bulunamadı: $CHROME (CHROME=... ile ver)"; exit 2; }

python3 "$ROOT/office/server.py" --port "$PORT" >"$OUT/server.log" 2>&1 &
SP=$!
trap 'kill $SP 2>/dev/null; wait $SP 2>/dev/null || true; rm -rf "$OUT"' EXIT
for _ in $(seq 20); do curl -s -o /dev/null "localhost:$PORT/" && break; sleep 0.2; done

snap() { # mod çıktı.png
  local prof; prof="$(mktemp -d)"
  perl -e 'alarm 60; exec @ARGV' "$CHROME" --headless=new --disable-gpu --virtual-time-budget=3000 \
    --user-data-dir="$prof" --dump-dom "http://localhost:$PORT/#$1" 2>/dev/null \
  | python3 -c '
import sys, re, base64
m = re.search(r"data-canvas=\"data:image/png;base64,([^\"]+)\"", sys.stdin.read())
if not m: sys.exit("canvas alınamadı (sayfa hata vermiş olabilir)")
open(sys.argv[1], "wb").write(base64.b64decode(m.group(1)))' "$2"
  rm -rf "$prof"
}

fail=0
for mode in freeze freeze=work; do
  name="${mode/=/-}.png"
  snap "$mode" "$OUT/$name"
  if [[ "${1:-}" == "--update" ]]; then cp "$OUT/$name" "$BASE/$name"; echo "güncellendi: $name"; continue; fi
  if cmp -s "$OUT/$name" "$BASE/$name"; then echo "aynı: $mode"
  else echo "FARKLI: $mode  (yeni görüntü: $ROOT/tests/visual/last-$name)"; cp "$OUT/$name" "$ROOT/tests/visual/last-$name"; fail=1; fi
done
exit $fail
