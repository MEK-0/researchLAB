# researchLAB altyapı geliştirme kuralları

Bu dosya **altyapıyı geliştiren Claude Code** içindir (ofis arayüzü, sunucu, hook'lar, masaüstü uygulaması, araçlar).
Araştırma agent'ları (`software-researcher`, `professor-*`, `referee`) bu kurallarla değil `CLAUDE.md` ile çalışır.

## Güvenlik
- Sunucu (`office/server.py`) ve terminaller (ttyd) **yalnızca 127.0.0.1**'e bağlanır. `0.0.0.0` ya da dış arayüz kullanılmaz.
- **Yazma yapan her API** (POST/PUT/DELETE ya da yan etkili herhangi bir uç):
  - `Origin` başlığını kontrol eder; yalnızca `http://localhost:<port>` / `http://127.0.0.1:<port>` kabul edilir.
  - Yerel bir token ister (sunucu başlarken üretilir, yalnızca kullanıcının okuyabildiği bir dosyada tutulur, sayfaya aynı origin üzerinden verilir).
- Okuma API'leri repo dışına çıkamaz (path traversal kontrolü, boyut sınırı).
- ttyd her zaman `-O` (origin kontrolü) ile çalışır.

## Gizli bilgi ve veri
- Gizli bilgi (token, anahtar, `.env`, kişisel veri) commit'lenmez.
- `events/`, `workspace/` (şablon hariç), `data/*.db` `.gitignore`'da kalır.
- Hook'lar olay günlüğüne büyük içerik (dosya içeriği, tam prompt) yazmaz; beyaz listeli ve kısaltılmış alanlar yazar.

## Test
Her değişiklikten sonra mevcut özellikler test edilir:
1. **Canlı ofis:** `./office/office.sh` → `http://localhost:8765` açılıyor, sahne çiziliyor, konsolda hata yok.
2. **SSE:** `curl -N 'localhost:8765/events?replay=5'` olay gönderiyor; yeni olaylar canlı geliyor.
3. **Terminaller:** 7681 ve 7682 portlarında ttyd yanıt veriyor, tmux oturumlarına bağlı.
4. Otomatik testler: `python3 -m unittest discover -s tests` ve `node --test tests/`.

## Bağımlılıklar
- Yeni bir bağımlılık (pip, npm, brew paketi) eklemeden önce **kullanıcıya sorulur**.
- Python tarafı mümkün olduğunca standart kütüphane ile yazılır.

## Frontend
- Build adımı yok: saf ES modülleri (`office/static/`), `<script type="module">`.
- Harici kütüphane gerekiyorsa önce sorulur; CDN yerine dosya olarak eklenir.

## Commit
- Commit mesajları Türkçe ve `Faz N: ...` ile başlar.
- Her alt adım ayrı commit. Push, faz sonunda testler geçtikten sonra yapılır.
