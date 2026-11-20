#!/usr/bin/env bash
# Manager'ı (claude) repo dizininde başlatır. Tek kaynak: tmux oturumu da
# ofisteki "Manager'ı başlat" düğmesi de bunu çağırır.
#   - Önceki Manager konuşması varsa ona devam eder: claude --resume <id>
#     (id, hook'un RESEARCHLAB_MANAGER=1 ile yazdığı events/.manager_session).
#     `--continue` kullanılmaz: bu klasördeki en son konuşma başka bir
#     oturuma (ör. geliştirme oturumu) ait olabilir.
#   - Yoksa düz `claude`.
# OFFICE_MANAGER_BIN testlerde claude yerine sahte bir komut vermek içindir.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1

# PATH: tmux oturumu, tmux sunucusunun başladığı andaki ortamı devralır. Sunucu
# Finder'dan ya da eski bir PATH'le açılmışsa sonradan kurulan araçlar (ör. brew ile
# tectonic) Manager'a ve alt agent'larına görünmez. Bu yüzden her başlatmada
# login shell PATH'i + bilinen dizinler yeniden kurulur. Login shell çıktısı pipe
# yerine geçici dosyaya yazılır ve en fazla 3 sn beklenir.
login_path() {
  local sh="${SHELL:-/bin/zsh}" tmp pid
  tmp="$(mktemp)" || return 0
  "$sh" -ilc 'printf "%s" "$PATH" > "$1"' _ "$tmp" </dev/null >/dev/null 2>&1 &
  pid=$!
  for _ in $(seq 1 30); do kill -0 "$pid" 2>/dev/null || break; sleep 0.1; done
  kill "$pid" 2>/dev/null || true
  cat "$tmp" 2>/dev/null; rm -f "$tmp"
}
merge_path() { # sırayı koruyarak birleştir, tekrarları at
  local out="" d IFS=:
  for d in $*; do [[ -n "$d" && ":$out:" != *":$d:"* ]] && out="${out:+$out:}$d"; done
  printf '%s' "$out"
}
PATH="$(merge_path "$(login_path)" "/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:$HOME/.local/bin:$HOME/.cargo/bin" "$PATH")"
export PATH

BIN="${OFFICE_MANAGER_BIN:-claude}"
command -v "$BIN" >/dev/null || { echo "researchLAB: '$BIN' bulunamadı (kurulum: curl -fsSL https://claude.ai/install.sh | bash)"; exit 127; }
export RESEARCHLAB_MANAGER=1

sid="$(cat "$ROOT/events/.manager_session" 2>/dev/null || true)"
if [[ "$sid" =~ ^[0-9a-fA-F-]{36}$ ]] && ls "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"/projects/*/"$sid.jsonl" >/dev/null 2>&1; then
  echo "researchLAB: Manager konuşmasına devam ediliyor ($sid)"
  exec "$BIN" --resume "$sid"
fi
exec "$BIN"
