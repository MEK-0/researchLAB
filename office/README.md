# office/ — researchLAB ofis arayüzü

Hook olaylarından beslenen izometrik pixel ofis: agent'lar masalarında çalışır, Manager iş dağıtır, teslimler Manager masasının önünde yapılır. Sağda iki gerçek terminal (ttyd + tmux) vardır.
Geliştirme kuralları için bkz. [`docs/DEVELOPMENT.md`](../docs/DEVELOPMENT.md).

## Çalıştırma
```bash
brew install tmux ttyd        # bir kez
./office/office.sh            # başlatır ve http://localhost:8765 açar
./office/office.sh status     # durum
./office/office.sh stop       # sunucuları durdurur (tmux oturumları korunur)
./office/office.sh kill       # + tmux oturumlarını kapatır
```

| Adres | Ne |
|---|---|
| `http://localhost:8765` | Canlı ofis (her zaman canlı mod) |
| `http://localhost:8765/#demo` | Demo: iris-baseline örnek olayları; DEMO etiketi, oynatma kontrolleri ve `events.jsonl` yükleme yalnızca burada |
| `http://localhost:7681` / `:7682` | Terminal 1 (tmux `researchlab-manager`, `claude`) / Terminal 2 (tmux `researchlab-shell`) |

Sayfa ES modülleri kullandığı için `file://` ile açılmaz; her zaman sunucu üzerinden aç. Her şey yalnızca 127.0.0.1'e bağlanır; ttyd `-O` ile başka origin'den websocket kabul etmez.

## Kod yapısı (build adımı yok)
```
office/
├── index.html            iskelet + CSS; <script type="module" src="static/main.js">
├── layout.json           oda, duvar öğeleri, eşyalar, masa atamaları, teslim noktası
├── agents.json           agent görünüşleri
├── server.py             HTTP + SSE sunucusu (yalnızca standart kütüphane)
├── office.sh             sunucu + ttyd + tmux yönetimi
└── static/
    ├── main.js           giriş: layout/agents yükleme, mod seçimi, çizim döngüsü
    ├── state.js          agent durumları, görevler, olay işleme (ingest)
    ├── api.js            /api ve /events istemcisi
    ├── demo.js           demo verisi ve oynatıcı
    ├── scene/iso.js      izometrik çizim yardımcıları (P, poly, box…)
    ├── scene/furniture.js eşya tipleri: çizim + footprint + oturma noktası + çizim sırası
    ├── scene/room.js     duvarlar, pencere/tablo/saat/beyaz tahta, zemin, halılar
    ├── scene/sprites.js  karakter çizimi (gömlek, saç, aksesuar)
    ├── scene/pathfind.js A* yol bulma (çeyrek kare ızgara)
    ├── ui/panels.js      Ekip, Görev panosu, Olay akışı
    └── ui/terminals.js   ttyd iframe'leri
```

## Veri
### `layout.json`
- `room`: `gx`, `gy` (kare), `wall_height`.
- `wall_items`: `{id, type: window|painting|clock|whiteboard, wall: back|left, from, to, z1, z2, props}`.
- `items`: `{id, type, x, y, rot, props}`. Tipler: `desk`, `chair`, `plant`, `cabinet`, `sofa`, `printer`, `meeting_table`, `server_rack`, `bookshelf`, `kitchen`, `water_cooler`, `glass_wall`, `door`, `carpet`. `x, y` her tipin çapa noktasıdır (`furniture.js` başındaki açıklama). `rot`: 0 → agent +y'ye bakar, 90 → +x'e.
  - Masa: `props.w`, `props.d`, `props.seat_dist` (varsayılan 0.7), `props.deco` (monitör, lamba, kutu; `h_on` agent çalışırken yükseklik).
  - Çizim sırası: kapladığı alanın merkezinin `x+y`'si (sandalyede −0.2); gerekirse `props.depth` ile elle.
- `desks`: `{masaId: agentAdı}`. Oturma noktası masadan türetilir.
- `handoff`: `{desk, dist}`: teslim alma noktası bu masanın önü.

### `agents.json`
`{name, display_name, label?, shirt, hair, accessory}`. `name`, alt agent adıyla aynıdır (`software-researcher` …); Manager için `manager`. Aksesuarlar: `tie`, `phones`, `bun`, `beret`, `glasses`.

### Agent eşleşmesi
Olaydaki `agent_type` tam adla eşleşir; `agent_type` yoksa olay ana oturumundur (Manager). Bilinmeyen bir agent olay akışında gri görünür, ofiste çizilmez, konsola uyarı yazılır.

## Sunucu uçları
| Uç | Açıklama |
|---|---|
| `GET /` | `index.html` |
| `GET /static/*` | ES modülleri (dizin dışına çıkış engelli) |
| `GET /api/layout` | `layout.json` |
| `GET /api/agents` | `agents.json` + `.claude/agents/*.md` frontmatter (`description`, `model`) + masa ataması; görünüşü ya da masası olmayan agent `unassigned: true` |
| `GET /events?replay=N` | SSE. Varsayılan `message` event'i, her olay `data: <tek satırlık JSON>\n\n`. Önce **son oturumun** (sıkıştırma hariç en son `SessionStart` ve aynı `session_id`) en fazla son N olayı, sonra canlı olaylar. 15 sn'de bir `: ping`. |

Sayfa yenilenince `replay=300` ile son oturum animasyonsuz (sessiz) geri yüklenir; 20 sn'den yeni olaylar normal oynar.

## Olay alanları (`.claude/hooks/log_event.py`)
| Alan | Açıklama |
|---|---|
| `timestamp`, `hook_event_name`, `session_id`, `tool_name`, `tool_use_id`, `summary` | — |
| `source` | `SessionStart`'ta: `startup`, `resume`, `clear`, `compact` |
| `agent_type` | Alt agent içinden gelen olaylarda agent adı (ayrıca `agent` sözlüğü) |
| `tool_input` | Beyaz listedeki alanlar, 300 karaktere kısaltılmış; dosya içeriği alınmaz |
| `prompt`, `last_assistant_message` | 500 karaktere kısaltılmış |
| `tokens`, `tokens_cache_read` | `SubagentStop`: alt agent transcript'inin toplamı. `Stop`: ana transcript'te son `Stop`'tan sonra eklenen kısım (`events/.token_offsets.json`). `tokens` = input + output + cache_creation; aynı mesajın tekrarlı satırları bir kez sayılır. |

Canlı modda token yalnızca bu alanlardan gelir (tahmin yok); demo modunda örnek değerler kullanılır.

## Testler
```bash
python3 -m unittest discover -s tests   # sunucu, replay, API, hook token sayımı
node --test tests/*.test.mjs            # state, A*, demo simülasyonu
tests/visual/check.sh                   # sahne piksel karşılaştırması (headless Chrome)
```
Test için: `#freeze` / `#freeze=work` sahneyi sabit tek kare çizer; `?terms=0` terminal iframe'lerini kapatır (testler gerçek tmux oturumlarına bağlanmasın diye).
