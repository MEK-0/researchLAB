#!/usr/bin/env bash
# researchLAB ofisi: SSE sunucusu + iki tmux destekli ttyd terminali.
# Süreç başlatma mantığının TEK kaynağıdır; masaüstü uygulaması (desktop/) da bunu çağırır.
#   ./office/office.sh [start]       başlat ve tarayıcıda aç (NO_OPEN=1 açmaz)
#   ./office/office.sh stop          durdur (tmux oturumları korunur)
#   ./office/office.sh status [--json]  durum
#   ./office/office.sh kill          durdur + tmux oturumlarını kapat
#   ./office/office.sh manager-start Manager'ı başlat (oturum yoksa kur; varsa kabuğa
#                                    manager.sh yaz). claude'un çalışmadığını sunucu denetler.
# Hepsi yalnızca 127.0.0.1'e bağlanır.
# Ortam değişkenleri (testler için): OFFICE_PORT (8765), OFFICE_T1 (7681), OFFICE_T2 (7682),
# OFFICE_S1 (researchlab-manager), OFFICE_S2 (researchlab-shell), OFFICE_RUN (office/.run),
# OFFICE_MANAGER_BIN (manager.sh'a geçer).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN="${OFFICE_RUN:-$ROOT/office/.run}"
PORT="${OFFICE_PORT:-8765}"
T1="${OFFICE_T1:-7681}" T2="${OFFICE_T2:-7682}"
S1="${OFFICE_S1:-researchlab-manager}" S2="${OFFICE_S2:-researchlab-shell}"
LO="lo0"; [[ "$(uname)" == "Linux" ]] && LO="lo"
# Manager oturumunun komutu: claude bitince oturum kabukta açık kalır.
MANAGER_CMD="$(printf '%q' "$ROOT/office/manager.sh"); exec \$SHELL -l"
# tmux komutları tmux sunucusunun ortamında çalışır; test değişkenini -e ile geçir.
MENV=(); [[ -n "${OFFICE_MANAGER_BIN:-}" ]] && MENV=(-e "OFFICE_MANAGER_BIN=$OFFICE_MANAGER_BIN")

need() { command -v "$1" >/dev/null || { echo "Eksik: $1 (brew install $2)"; exit 1; }; }
pid_of() { [[ -f "$RUN/$1.pid" ]] && cat "$RUN/$1.pid" || true; }
alive() { local p; p="$(pid_of "$1")"; [[ -n "$p" ]] && kill -0 "$p" 2>/dev/null; }
listeners() { lsof -nP -t -iTCP:"$1" -sTCP:LISTEN 2>/dev/null || true; }
port_busy() { [[ -n "$(listeners "$1")" ]]; }
# Portu dinleyen süreç bizim PID dosyamızdaki süreç mi?
owned() { local p; p="$(pid_of "$1")"; [[ -n "$p" ]] && listeners "$2" | grep -qx "$p"; }

launch() { # ad port komut...
  local name=$1 port=$2; shift 2
  if alive "$name"; then echo "  $name zaten çalışıyor"; return; fi
  if port_busy "$port"; then echo "  UYARI: $port portu başka bir süreçte, $name başlatılmadı"; return; fi
  nohup "$@" >"$RUN/$name.log" 2>&1 &
  echo $! >"$RUN/$name.pid"
  echo "  $name → http://localhost:$port"
}

sessions() { # tmux oturumları (varsa yeniden kullanılır)
  tmux has-session -t "=$S1" 2>/dev/null || tmux new-session -d -s "$S1" -c "$ROOT" ${MENV[@]+"${MENV[@]}"} "$MANAGER_CMD"
  tmux has-session -t "=$S2" 2>/dev/null || tmux new-session -d -s "$S2" -c "$ROOT"
}

start() {
  need tmux tmux; need ttyd ttyd; need python3 python
  mkdir -p "$RUN"
  sessions
  echo "researchLAB ofisi başlıyor:"
  launch server "$PORT" python3 "$ROOT/office/server.py" --port "$PORT" --tmux-session "$S1"
  # Terminaller tmux'a `new-session -A` ile bağlanır: oturum yoksa (dışarıdan
  # öldürülmüşse) yeniden kurulur, varsa ona bağlanılır.
  # -W yazılabilir, -O farklı origin'den websocket'i reddeder, -i loopback
  launch ttyd1 "$T1" ttyd -p "$T1" -i "$LO" -W -O -w "$ROOT" -t titleFixed="Manager" \
    tmux new-session -A -s "$S1" -c "$ROOT" ${MENV[@]+"${MENV[@]}"} "$MANAGER_CMD"
  launch ttyd2 "$T2" ttyd -p "$T2" -i "$LO" -W -O -w "$ROOT" -t titleFixed="Kabuk" \
    tmux new-session -A -s "$S2" -c "$ROOT"
  sleep 0.5
  [[ "${NO_OPEN:-}" ]] || open "http://localhost:$PORT" 2>/dev/null || true
}

stop() {
  for n in server ttyd1 ttyd2; do
    if alive "$n"; then kill "$(pid_of "$n")" && echo "  $n durduruldu"; fi
    rm -f "$RUN/$n.pid"
  done
}

manager_start() {
  if ! has_session "$S1"; then
    tmux new-session -d -s "$S1" -c "$ROOT" ${MENV[@]+"${MENV[@]}"} "$MANAGER_CMD"
    echo created; return
  fi
  # Yalnızca pane'de kabuk açıkken yaz (ör. vim açıksa tuşlar oraya gitmesin)
  local cmd; cmd="$(tmux display-message -p -t "=$S1:" '#{pane_current_command}')"
  case "$cmd" in
    zsh|bash|sh|fish|-zsh|-bash) ;;
    *) echo "Terminal 1'de başka bir program açık ($cmd)"; exit 3 ;;
  esac
  tmux send-keys -t "=$S1:" C-u
  tmux send-keys -t "=$S1:" -l "cd $(printf '%q' "$ROOT") && ${OFFICE_MANAGER_BIN:+OFFICE_MANAGER_BIN=$(printf '%q' "$OFFICE_MANAGER_BIN") }$(printf '%q' "$ROOT/office/manager.sh")"
  tmux send-keys -t "=$S1:" Enter
  echo started
}

has_session() { tmux has-session -t "=$1" 2>/dev/null; }
tf() { "$@" && echo true || echo false; }

status_json() {
  local out="" n port
  for n in server ttyd1 ttyd2; do
    case $n in server) port=$PORT ;; ttyd1) port=$T1 ;; ttyd2) port=$T2 ;; esac
    out+="\"$n\":{\"port\":$port,\"pid\":\"$(pid_of "$n")\",\"alive\":$(tf alive "$n"),\"port_busy\":$(tf port_busy "$port"),\"owned\":$(tf owned "$n" "$port")},"
  done
  printf '{%s"tmux":{"%s":%s,"%s":%s},"run":"%s"}\n' "$out" "$S1" "$(tf has_session "$S1")" "$S2" "$(tf has_session "$S2")" "$RUN"
}

status() {
  [[ "${1:-}" == "--json" ]] && { status_json; return; }
  local n port
  for n in server ttyd1 ttyd2; do
    case $n in server) port=$PORT ;; ttyd1) port=$T1 ;; ttyd2) port=$T2 ;; esac
    if alive "$n"; then echo "  $n: çalışıyor (pid $(pid_of "$n"), port $port)"
    elif port_busy "$port"; then echo "  $n: kapalı, ama $port portu başka bir süreçte"
    else echo "  $n: kapalı"; fi
  done
  for s in "$S1" "$S2"; do
    has_session "$s" && echo "  tmux $s: açık" || echo "  tmux $s: yok"
  done
}

case "${1:-start}" in
  start) start ;;
  stop) stop ;;
  status) status "${2:-}" ;;
  manager-start) manager_start ;;
  kill) stop; tmux kill-session -t "=$S1" 2>/dev/null || true; tmux kill-session -t "=$S2" 2>/dev/null || true ;;
  *) echo "Kullanım: $0 [start|stop|status [--json]|kill|manager-start]"; exit 1 ;;
esac
