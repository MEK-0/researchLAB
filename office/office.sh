#!/usr/bin/env bash
# researchLAB ofisi: SSE sunucusu + iki tmux destekli ttyd terminali.
#   ./office/office.sh [start]   başlat ve tarayıcıda aç
#   ./office/office.sh stop      durdur (tmux oturumları korunur)
#   ./office/office.sh status    durum
#   ./office/office.sh kill      durdur + tmux oturumlarını kapat
# Hepsi yalnızca 127.0.0.1'e bağlanır. Portlar: OFFICE_PORT (8765), 7681, 7682.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN="$ROOT/office/.run"
PORT="${OFFICE_PORT:-8765}"
T1=7681 T2=7682
S1=researchlab-manager S2=researchlab-shell
LO="lo0"; [[ "$(uname)" == "Linux" ]] && LO="lo"

need() { command -v "$1" >/dev/null || { echo "Eksik: $1 (brew install $2)"; exit 1; }; }
alive() { [[ -f "$RUN/$1.pid" ]] && kill -0 "$(cat "$RUN/$1.pid")" 2>/dev/null; }
port_busy() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }

launch() { # ad port komut...
  local name=$1 port=$2; shift 2
  if alive "$name"; then echo "  $name zaten çalışıyor"; return; fi
  if port_busy "$port"; then echo "  UYARI: $port portu dolu, $name atlandı"; return; fi
  nohup "$@" >"$RUN/$name.log" 2>&1 &
  echo $! >"$RUN/$name.pid"
  echo "  $name → http://localhost:$port"
}

start() {
  need tmux tmux; need ttyd ttyd; need python3 python
  mkdir -p "$RUN"
  # tmux oturumları (varsa yeniden kullanılır)
  tmux has-session -t "$S1" 2>/dev/null || tmux new-session -d -s "$S1" -c "$ROOT" \
    "command -v claude >/dev/null && claude; exec \$SHELL -l"
  tmux has-session -t "$S2" 2>/dev/null || tmux new-session -d -s "$S2" -c "$ROOT"
  echo "researchLAB ofisi başlıyor:"
  launch server "$PORT" python3 "$ROOT/office/server.py" --port "$PORT"
  # -W yazılabilir, -O farklı origin'den websocket'i reddeder, -i loopback
  launch ttyd1 "$T1" ttyd -p "$T1" -i "$LO" -W -O -w "$ROOT" -t titleFixed="Manager" tmux attach -t "$S1"
  launch ttyd2 "$T2" ttyd -p "$T2" -i "$LO" -W -O -w "$ROOT" -t titleFixed="Kabuk" tmux attach -t "$S2"
  sleep 0.5
  [[ "${NO_OPEN:-}" ]] || open "http://localhost:$PORT" 2>/dev/null || true
}

stop() {
  for n in server ttyd1 ttyd2; do
    if alive "$n"; then kill "$(cat "$RUN/$n.pid")" && echo "  $n durduruldu"; fi
    rm -f "$RUN/$n.pid"
  done
}

status() {
  for n in server ttyd1 ttyd2; do
    if alive "$n"; then echo "  $n: çalışıyor (pid $(cat "$RUN/$n.pid"))"; else echo "  $n: kapalı"; fi
  done
  for s in "$S1" "$S2"; do
    tmux has-session -t "$s" 2>/dev/null && echo "  tmux $s: açık" || echo "  tmux $s: yok"
  done
}

case "${1:-start}" in
  start) start ;;
  stop) stop ;;
  status) status ;;
  kill) stop; tmux kill-session -t "$S1" 2>/dev/null || true; tmux kill-session -t "$S2" 2>/dev/null || true ;;
  *) echo "Kullanım: $0 [start|stop|status|kill]"; exit 1 ;;
esac
