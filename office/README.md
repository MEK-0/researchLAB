# office/ — 3B Ofis Arayüzü (plan)

3B pixel ofis arayüzü buraya gelecek. `events/events.jsonl` dosyasını dinleyerek agent'ları görselleştirecek.

> Henüz kod yok; bu yalnızca bir plan notudur.

## Veri kaynağı
`events/events.jsonl` — her satır bir JSON olay (bkz. `.claude/hooks/log_event.py`):

| Alan | Açıklama |
|---|---|
| `timestamp` | UTC ISO-8601 |
| `hook_event_name` | SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, SubagentStart, SubagentStop, Stop, Notification |
| `session_id` | Oturum kimliği |
| `tool_name` | Varsa araç adı |
| `summary` | Kısa açıklama |
| `agent` | Varsa hook girdisindeki agent kimliği alanları (`agent_id`, `agent_type`, …) |
| `subagent` | `Agent`/`Task` çağrılarında `subagent_type`, `description` |
