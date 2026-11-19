# office/ — researchLAB ofis arayüzü

`index.html`, hook olaylarını izometrik pixel ofiste canlandırır; sağda iki gerçek terminal (ttyd + tmux) gösterir.

## Çalıştırma
```bash
brew install tmux ttyd        # bir kez
./office/office.sh            # başlatır ve http://localhost:8765 açar
./office/office.sh status     # durum
./office/office.sh stop       # sunucuları durdurur (tmux oturumları korunur)
./office/office.sh kill       # + tmux oturumlarını kapatır
```

| Bileşen | Adres | Not |
|---|---|---|
| `server.py` | `http://localhost:8765` (`OFFICE_PORT`) | `/` → `index.html`, `/events` → SSE |
| Terminal 1 | `http://localhost:7681` | tmux `researchlab-manager`, içinde `claude` |
| Terminal 2 | `http://localhost:7682` | tmux `researchlab-shell`, serbest kabuk |

Hepsi yalnızca loopback'e bağlanır; ttyd `-O` ile başka origin'den websocket kabul etmez. PID/log: `office/.run/`.
Sayfayı `file://` ya da başka bir host üzerinden açarsan demo verisi ve örnek terminal görünür.

## SSE (`/events`)
Varsayılan `message` event'i; her olay `data: <tek satırlık JSON>\n\n`. Bağlantı anından sonra `events/events.jsonl`'e eklenen satırlar gönderilir; `?replay=N` son N olayı da baştan yollar. 15 sn'de bir `: ping` yorumu gider.

Sunucu eski kayıtları da sayfanın beklediği alanlara düzleştirir (`agent.agent_type → agent_type`, `summary → prompt / last_assistant_message`, `subagent → tool_input`).

## Olay alanları (`.claude/hooks/log_event.py`)
| Alan | Açıklama |
|---|---|
| `timestamp` | UTC ISO-8601 |
| `hook_event_name` | SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, SubagentStart, SubagentStop, Stop, Notification |
| `session_id`, `tool_name`, `tool_use_id` | — |
| `agent_type` | Alt agent içinden gelen olaylarda agent türü (ayrıca `agent` sözlüğü) |
| `tool_input` | Yalnızca beyaz listedeki alanlar, 300 karaktere kısaltılmış (`command`, `file_path`, `query`, `url`, `pattern`, `path`, `description`, `subagent_type`); dosya içeriği alınmaz |
| `prompt`, `last_assistant_message` | 500 karaktere kısaltılmış |
| `summary` | Kısa açıklama |
| `subagent` | `Agent`/`Task` çağrılarında `subagent_type`, `description` |

Token: olaylarda henüz `tokens`/`usage` yok; sayfa olay boyutundan kaba tahmin yapar.
