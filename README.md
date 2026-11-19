# researchLAB

Claude Code üzerinde çalışan çok-agent'lı bir araştırma laboratuvarı. Kullanıcı yalnızca **Manager** ile konuşur; Manager işi böler, uzman alt agent'lara dağıtır, çıktıları kontrol eder ve gün sonunda rapor verir.

## Başlatma

```bash
cd researchLAB
claude
```

Ardından Manager'a görevi yazın, örneğin:

> "CIFAR-10 üzerinde küçük bir CNN için data augmentation ablasyonu yap ve sonuçları kısa bir makaleye dök."

Gün sonunda **"rapor"** yazarak `reports/YYYY-MM-DD.md` raporunu alın. Tanımlı agent'ları görmek için oturumda `/agents` komutunu kullanın.

## Agent'lar

| Agent | Model | Görev | Yazdığı yer |
|---|---|---|---|
| **Manager** (ana oturum, `CLAUDE.md`) | — | Planlama, delegasyon, kalite kontrol, rapor | `STATUS.md`, `reviews/`, `reports/` |
| `software-researcher` | opus | Kurulum, kod, deney, model eğitimi | `code/`, `results/` |
| `professor-lit` | sonnet | Literatür taraması, kaynakça | `literature/` |
| `professor-writer` | opus | Akademik makale (Markdown + LaTeX) | `paper/` |
| `referee` | opus | Hakem değerlendirmesi (salt okunur) | — (Manager kaydeder) |

## İş akışı

```
Manager → software-researcher ┐
        → professor-lit       ┘ (paralel)
        → professor-writer → referee
        → (revizyon? en fazla 3 tur ilgili agent'a geri) → Manager raporu
```

## Klasör yapısı

```
researchLAB/
├── CLAUDE.md                  # Manager'ın anayasası
├── README.md
├── .claude/
│   ├── settings.json          # hook bağlantıları
│   ├── agents/                # 4 alt agent tanımı
│   └── hooks/log_event.py     # olayları events/events.jsonl'e yazar
├── workspace/
│   └── _template/             # her yeni proje buradan kopyalanır
│       ├── STATUS.md
│       ├── code/  results/  literature/  paper/  reviews/
├── reports/                   # günlük raporlar + şablon
├── events/                    # events.jsonl (olay günlüğü), .token_offsets.json
├── office/                    # canlı pixel ofis arayüzü (bkz. office/README.md)
├── tests/                     # altyapı testleri (Python, Node, görsel)
└── docs/DEVELOPMENT.md        # altyapı geliştirme kuralları
```

## Olay günlüğü

`.claude/hooks/log_event.py` her hook olayında `events/events.jsonl` dosyasına bir satır ekler. Yalnızca Python standart kütüphanesini kullanır ve hiçbir koşulda Claude Code'u durdurmaz (her zaman exit 0).

Her olayda agent kimliği (`agent_type`), kısaltılmış araç girdisi ve alt agent bitişinde / tur sonunda gerçek token sayısı (`tokens`) bulunur. Alan listesi: [`office/README.md`](office/README.md#olay-alanları-claudehookslog_eventpy).

## Ofis arayüzü

```bash
./office/office.sh        # http://localhost:8765 — canlı ofis + iki terminal
```

Agent'ları masalarında çalışırken, Manager'ın iş dağıtmasını ve teslimleri canlı izlersiniz. Demo için `http://localhost:8765/#demo`. Ayrıntılar: [`office/README.md`](office/README.md).

## Geliştirme

Altyapı (ofis, sunucu, hook'lar) üzerinde çalışırken [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) kurallarına uyulur. Testler:

```bash
python3 -m unittest discover -s tests && node --test tests/*.test.mjs && tests/visual/check.sh
```

