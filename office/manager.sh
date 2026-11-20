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
BIN="${OFFICE_MANAGER_BIN:-claude}"
command -v "$BIN" >/dev/null || { echo "researchLAB: '$BIN' bulunamadı (kurulum: curl -fsSL https://claude.ai/install.sh | bash)"; exit 127; }
export RESEARCHLAB_MANAGER=1

sid="$(cat "$ROOT/events/.manager_session" 2>/dev/null || true)"
if [[ "$sid" =~ ^[0-9a-fA-F-]{36}$ ]] && ls "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"/projects/*/"$sid.jsonl" >/dev/null 2>&1; then
  echo "researchLAB: Manager konuşmasına devam ediliyor ($sid)"
  exec "$BIN" --resume "$sid"
fi
exec "$BIN"
