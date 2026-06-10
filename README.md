# Kupa 26 ⚽

2026 FIFA Dünya Kupası takip uygulaması. Canlı skor, fikstür, grup puan durumları, eleme ağacı, gol krallığı, maç detayları (kadrolar, olaylar, istatistikler) ve gol bildirimleri.

- **Tamamen ücretsiz**: API anahtarı, kayıt, abonelik yok. Veri ESPN'in halka açık (resmi olmayan) API'sinden gelir.
- **Taşınabilir**: Klasörü kopyala, her bilgisayarda aynı şekilde çalışır. Build, npm, kurulum yok.
- **PWA**: Telefona uygulama gibi kurulur (iOS + Android), çevrimdışı kabuk önbelleği var.
- **Kişisel**: Favori takımlar (varsayılan: Türkiye), bildirim kapsamı ve tema uygulama içinden ayarlanır. Ayarlar cihazda saklanır.

## Çalıştırma

### Bilgisayarda (en kolay)
```powershell
powershell -ExecutionPolicy Bypass -File serve.ps1
```
Tarayıcı otomatik açılır: http://localhost:8026

Alternatifler: `python -m http.server 8026` veya `npx serve`.

> Dosyaya çift tıklayıp `file://` ile açmak çalışır ama service worker ve bildirimler devre dışı kalır. Yerel sunucu kullan.

### Telefonda
Telefonun uygulamaya bir URL üzerinden erişmesi gerekir. En kolay iki yol:

1. **GitHub Pages (önerilen, kalıcı ve ücretsiz)**: Bu klasörü bir GitHub reposuna yükle, repo ayarlarından Pages'i aç. Çıkan `https://kullanici.github.io/repo` adresini telefonda aç.
2. **Netlify Drop**: https://app.netlify.com/drop adresine klasörü sürükle-bırak, çıkan adresi telefonda aç.

Sonra:
- **iPhone**: Safari'de aç → Paylaş → **Ana Ekrana Ekle**. Bildirimler için uygulamayı ana ekrandan açıp Ayarlar'dan bildirimi aç (iOS 16.4+ gerekir).
- **Android**: Chrome'da aç → menü → **Ana ekrana ekle** (veya çıkan "Yükle" önerisi).

## Bildirimler hakkında

Bildirimler uygulama **açıkken** çalışır (sunucu olmadığı için arka plan push yok): gol, maç başlangıcı ve maç sonucu bildirimi gelir. Maç izlerken ikinci ekranda açık tutmak için idealdir. Kapsam ayarlardan seçilir: sadece favori takımlar veya tüm maçlar.

## Dosyalar

| Dosya | Görev |
|---|---|
| `index.html` | Uygulama iskeleti |
| `app.js` | Tüm mantık: veri çekme, görünümler, bildirimler |
| `styles.css` | Tema ve tasarım |
| `sw.js` | Service worker: çevrimdışı kabuk + bildirim tıklama |
| `manifest.webmanifest` | PWA tanımı |
| `serve.ps1` | Sıfır bağımlılıklı yerel sunucu (Windows) |
| `icons/` | Uygulama ikonları |

## Notlar

- Saatler otomatik olarak cihazın saat dilimine göre gösterilir (Türkiye'de TSİ).
- Canlı maç varken veri ~35 saniyede bir, yoksa 5 dakikada bir yenilenir.
- ESPN API'si resmi olmayan, halka açık bir uçtur; ESPN değiştirirse uygulamanın güncellenmesi gerekebilir. Kişisel kullanım içindir.
