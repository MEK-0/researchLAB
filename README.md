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
├── events/                    # events.jsonl (olay günlüğü), .token_offsets.json, .manager_session
├── office/                    # canlı pixel ofis arayüzü (bkz. office/README.md)
├── desktop/                   # macOS masaüstü uygulaması (Electron)
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

## Masaüstü uygulaması

`desktop/` ofisi ve iki terminali tek pencerede açan bir Electron uygulamasıdır (şimdilik paketlenmez). Gereken: Node.js, `tmux`, `ttyd`, `python3`, `claude`.

```bash
./desktop/run.sh          # ilk seferde npm install yapar, sonra uygulamayı açar
./desktop/make-app.sh     # isteğe bağlı: ~/Applications/researchLAB.app (Dock'a sabitlenebilir)
```

- **Açılış:** Uygulama süreçleri kendisi başlatmaz, `office/office.sh start`'ı çağırır (tek kaynak). Portlar hazır olunca ofisi açar. Sistem zaten çalışıyorsa yeniden başlatmaz, bağlanır.
  - 20 sn içinde açılmazsa hangi parçanın (sunucu, Terminal 1/2, tmux) başlamadığını log satırlarıyla gösterir.
  - Port başka bir programdaysa bunu hemen söyler.
- **İlk açılış:** Repo klasörü sorulur (varsayılan `~/Desktop/researchLAB`) ve saklanır. Daha sonra *researchLAB → Repo klasörünü değiştir…* ile değiştirilir.
- **PATH:** Finder/Dock'tan açılışta login shell PATH'i ile `/opt/homebrew/bin`, `/usr/local/bin` ve `~/.local/bin` eklenir. `claude`, `tmux`, `ttyd` ya da `python3` yoksa eksik olanı ve kurulum komutunu gösterir.
- **Manager:** Terminal 1 her zaman repo dizininde `office/manager.sh` ile başlar.
  - Önceki Manager konuşması varsa `claude --resume <id>` ile ona devam eder, yoksa düz `claude` açılır. `--continue` kullanılmaz, çünkü klasördeki en son konuşma başka bir oturuma ait olabilir.
  - Manager'dan çıkılırsa Terminal 1 başlığında **Manager kapalı** uyarısı ve **Manager'ı başlat** düğmesi çıkar.
  - tmux oturumu dışarıdan öldürülse de Terminal 1 yeniden bağlanınca oturum kendiliğinden kurulur.
- **Kapanış:** Pencereyi kapatmak, Cmd+Q ve menü çubuğundaki *Tamamen kapat* aynı yoldan geçer.
  - Hiçbir agent çalışmıyorsa sunucu, terminaller ve tmux oturumları kapanır.
  - Bir agent çalışıyorsa şu seçenekler sorulur: **Durdurup kapat** / **Arka planda çalışsın** / **İptal**. Arka planda seçilirse pencere kapanır, iş tmux'ta sürer. Menü çubuğu ikonundan (*Aç / Durum / Tamamen kapat*) ya da uygulamayı yeniden açarak aynı oturuma dönülür.
- **Uyku:** Bir görev çalışırken Mac boşta uykuya geçmez (`powerSaveBlocker`); menü çubuğunda "çalışıyor" yazar. Kapak kapatılınca Mac yine uyur.
- **Dock kısayolu:** `make-app.sh` uygulaması ilk açılışta macOS'tan *Masaüstü klasörüne erişim* izni ister; bir kez onaylanır.
  - Paketleme olmadığı için çalışan pencere Dock'ta ayrıca "Electron" olarak görünür (Faz 5b'de düzelir).
  - Dock'tan açılışın çıktısı: `~/Library/Logs/researchLAB.log`.

## Geliştirme

Altyapı (ofis, sunucu, hook'lar) üzerinde çalışırken [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) kurallarına uyulur. Testler:

```bash
python3 -m unittest discover -s tests && node --test tests/*.test.mjs && tests/visual/check.sh
```

