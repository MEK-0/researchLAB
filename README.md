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
├── events/                    # events.jsonl (olay günlüğü)
└── office/                    # (gelecek) 3B pixel ofis arayüzü
```

## Olay günlüğü

`.claude/hooks/log_event.py` her hook olayında `events/events.jsonl` dosyasına bir satır ekler. Yalnızca Python standart kütüphanesini kullanır ve hiçbir koşulda Claude Code'u durdurmaz (her zaman exit 0).
