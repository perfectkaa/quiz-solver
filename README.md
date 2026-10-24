# 🎯 Universal Quiz Solver AI

> Userscript otomatis untuk menjawab soal kuis & formulir online menggunakan AI (Ollama Cloud) dengan dukungan **web search**, **vision**, dan **multi-platform adapter**.

[![Version](https://img.shields.io/badge/version-69.0-blue.svg)](https://github.com/PerfectKaa/universal-quiz-solver)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Tampermonkey](https://img.shields.io/badge/Tampermonkey-✓-orange.svg)](https://www.tampermonkey.net/)
[![Ollama](https://img.shields.io/badge/Ollama-Cloud-purple.svg)](https://ollama.com)

---

## ✨ Fitur

| Fitur | Status |
|-------|--------|
| 🤖 AI-powered solver (Ollama Cloud, OpenAI-compatible) | ✅ |
| 🔍 Web search (DDG API + Wikipedia + Mojeek) | ✅ |
| 🖼️ Vision support (jawab soal bergambar) | ✅ |
| 🎛️ Hyperparameter lengkap (temperature, top_p, top_k, dll) | ✅ |
| 🧩 Multi-platform adapter | ✅ |
| 📊 Live log viewer (transparan, tidak silent fail) | ✅ |
| 🎨 Drag-and-drop panel | ✅ |
| 🔒 100% client-side (API key disimpan di `localStorage` browser) | ✅ |

### Platform yang didukung

- ✅ **Google Forms** (`docs.google.com/forms/...`)
- ✅ **Quizizz** (`quizizz.com`)
- ✅ **Wayground** (`wayground.com`)
- ⚠️ Kahoot, Blooket, Quizlet, Quizalize — *belum dioptimalkan (fallback semantic)*

### Tipe soal yang didukung

- ✅ Pilihan ganda (single & multiple)
- ✅ Isian singkat / esai
- ✅ Dropdown
- ✅ Drag & drop (teks, gambar, kategori, urutan)
- ✅ Kategorisasi
- ✅ Persamaan matematika
- ✅ Checkbox multi-jawaban

---

## 📦 Instalasi

### 1. Install userscript manager

Pilih salah satu:

- [**Tampermonkey**](https://www.tampermonkey.net/) — Chrome, Edge, Firefox, Safari, Opera
- [**Violentmonkey**](https://violentmonkey.github.io/) — Chrome, Firefox, Edge
- [**Userscripts**](https://apps.apple.com/app/userscripts/id1463298887) — Safari (iOS/macOS)

> ⚠️ **Wajib menggunakan userscript manager** — script ini butuh `GM_xmlhttpRequest` untuk bypass CORS saat scraping web search.

### 2. Install script

**Opsi A — Via GitHub (recommended)**

Buka [raw file](https://github.com/PerfectKaa/universal-quiz-solver/raw/main/universal-quiz-solver.user.js) di Tampermonkey → klik **Install**.

**Opsi B — Manual**

1. Buka dashboard Tampermonkey → **`+`** (Create new script)
2. **Hapus semua** template default
3. **Copy-paste** seluruh isi `universal-quiz-solver.user.js`
4. **Ctrl+S** untuk simpan

---

## 🔑 Dapatkan API Key Ollama

Script ini menggunakan **Ollama Cloud** sebagai backend AI. Untuk mendapat API key:

1. Buka [https://ollama.com](https://ollama.com) → daftar/login
2. Masuk ke [https://ollama.com/settings/keys](https://ollama.com/settings/keys)
3. Klik **"Create API Key"**
4. Copy key (format: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)
5. Simpan — **hanya ditampilkan sekali**

> 💰 **Gratis**: Ollama Cloud memberikan free tier untuk model kecil. Untuk model besar (`qwen2.5:72b`), mungkin butuh subscription.

---

## 🚀 Cara Pakai

### Langkah 1 — Buka platform kuis

Contoh: buka Google Form, Quizizz, atau Wayground di browser.

### Langkah 2 — Panel otomatis muncul

Panel **Universal Solver v69** akan muncul di pojok kanan bawah:

```
┌────────────────────────────┐
│   Universal Solver v69     │
│      AI: Ollama Cloud      │
├────────────────────────────┤
│  ⚙ Pengaturan AI           │
│  ┌──────────────────────┐  │
│  │ (log viewer)         │  │
│  │                      │  │
│  └──────────────────────┘  │
│  Hapus log                 │
│  🔍 Test Search            │
│  ✨ Selesaikan              │
│      @PerfectKaa · v69     │
└────────────────────────────┘
```

Panel bisa **di-drag** ke posisi mana saja dengan cara tahan header.

### Langkah 3 — Konfigurasi AI

Klik **⚙ Pengaturan AI** dan isi:

| Field | Nilai |
|-------|-------|
| **Nama AI** | `Ollama Cloud` (atau bebas) |
| **Base URL** | `https://ollama.com` |
| **Endpoint** | `/api/chat` |
| **API Key** | *(paste key dari langkah sebelumnya)* |
| **Model** | `qwen2.5:72b` *(lihat tabel model di bawah)* |
| **Temperature** | `0.2` *(rendah = faktual, tinggi = kreatif)* |
| **Top P** | `0.9` |
| **Top K** | `40` |
| **Repeat Penalty** | `1.1` |
| **Num Ctx** | `8192` |
| **Num Predict** | `512` |
| ✅ **Model mendukung gambar** | *(centang jika model vision)* |
| ✅ **Aktifkan Web Search** | *(sangat direkomendasikan)* |
| **Search Engine** | `Auto` |
| **Max Results** | `4` |

Klik **Simpan konfigurasi**.

### Langkah 4 — Test web search (opsional)

Klik **🔍 Test Search** untuk verifikasi bahwa web search berfungsi sebelum mulai menjawab:

```
[Search] Query: "Layanan berbagi video milik Google dibeli pada tahun 2006"
[Search] Variants: "Layanan berbagi video Google dibeli tahun 2006 | ..."
[Search] ✓ wikipedia: 2 hasil
#1: YouTube
     YouTube adalah platform berbagi video Amerika Serikat yang didirikan...
```

Kalau muncul hasil ✅ → siap. Kalau `SEMUA GAGAL` → cek [troubleshooting](#-troubleshooting).

### Langkah 5 — Jalankan

Klik **✨ Selesaikan**. Script akan:

1. **Extract** soal dari halaman
2. **Search** web untuk konteks faktual (jika diaktifkan)
3. **Kirim** ke AI per-soal (bukan sekaligus, untuk akurasi)
4. **Isi** form otomatis
5. **Log** setiap langkah secara live

Contoh log sukses:

```
[19.05.15] Model: qwen2.5:72b | Temp: 0.2
[19.05.15] Web Search: ON (auto)
[19.05.15] Adapter: GoogleFormsAdapter
[19.05.15] ─── SOAL 5/5: Layanan berbagi video milik Google...
[19.05.15] [Search] Query: "Layanan berbagi video milik Google dibeli pada tahun 2006"
[19.05.16] [Search] ✓ wikipedia: 2 hasil
[19.05.16] [Search] #1: YouTube
[19.05.16] [Search]    YouTube adalah platform berbagi video...
[19.05.18] → YouTube
```

---

## 🤖 Rekomendasi Model

| Model | Speed | Akurasi | Vision | Best for |
|-------|-------|---------|--------|----------|
| `qwen2.5:72b` | 🟡 Sedang | ⭐⭐⭐⭐⭐ | ❌ | **Recommended** — patuh instruksi, faktual |
| `llama3.3:70b` | 🟡 Sedang | ⭐⭐⭐⭐ | ❌ | Alternatif bagus |
| `gemma3:27b` | 🟢 Cepat | ⭐⭐⭐⭐ | ✅ | Kalau butuh vision |
| `qwen2.5vl:72b` | 🔴 Lambat | ⭐⭐⭐⭐⭐ | ✅ | Vision terbaik |
| `gpt-oss:120b` | 🔴 Lambat | ⭐⭐⭐ | ❌ | Reasoning (kadang overthinking) |
| `gemma4:31b` | ❌ | ❌ | ❌ | **Jangan pakai** — tidak ada di Ollama |

> ⚠️ **Catatan penting**: Kalau web search **mati**, AI akan menjawab dari pengetahuan internalnya → rawan halusinasi untuk soal faktual. **Selalu aktifkan web search** untuk soal tipe "siapa", "kapan", "apa yang dikembangkan oleh X", dll.

---

## 🔧 Troubleshooting

### ❌ Panel tidak muncul

- **Penyebab**: Userscript manager tidak aktif atau URL tidak cocok
- **Solusi**: 
  1. Pastikan Tampermonkey aktif (icon berwarna, bukan hitam/abu-abu)
  2. Cek **Dashboard → Universal Quiz Solver AI → Settings → Includes** sudah berisi `*://docs.google.com/*` dll
  3. Refresh halaman (`Ctrl+F5`)

### ❌ Error: "API Key wajib diisi"

- Buka ⚙ Pengaturan AI → paste API key → Simpan

### ❌ Error: "Request timeout"

- **Penyebab**: Model terlalu besar atau koneksi lambat
- **Solusi**: 
  - Coba model lebih kecil (`gemma3:27b`)
  - Turunkan **Num Predict** ke `256`
  - Cek koneksi internet

### ❌ Log: "SEMUA ENGINE GAGAL — AI jawab tanpa konteks"

Web search gagal total. Coba:

1. **Ganti search engine** di ⚙ ke `bing` atau `mojeek` saja
2. **Matikan VPN** — IP datacenter sering diblok search engine
3. Cek log untuk error spesifik:
   - `HTTP 429` → rate limit, tunggu 5 menit
   - `CAPTCHA` → IP diblok, ganti jaringan
   - `0 hasil` → query terlalu spesifik, coba turunkan Max Results
4. **Fallback Wikipedia** biasanya masih jalan — kalau gagal semua, kemungkinan internet putus

### ❌ Log: "DOMParser TrustedHTML" error

Ini bug **v67 dan sebelumnya** yang sudah di-fix di **v68**. Update script.

### ❌ AI jawab salah padahal web search berhasil

- **Penyebab**: Model mengabaikan konteks
- **Solusi**:
  1. Turunkan **Temperature** ke `0.1`
  2. Ganti model ke `qwen2.5:72b` (paling patuh konteks)
  3. Cek log — kalau `#1: YouTube` muncul tapi jawaban `A`, itu masalah **model**, bukan search

### ❌ "Tidak ada pertanyaan Google Forms"

- **Penyebab**: Buka halaman **editor** bukan **preview** form
- **Solusi**: URL harus `/forms/d/e/.../viewform` atau `/forms/d/e/.../preview`, bukan `/forms/d/.../edit`

### ❌ Jawaban tidak terpilih otomatis

- **Penyebab**: Struktur HTML platform berubah (mereka update UI)
- **Solusi**: Buka **Issue** di GitHub dengan screenshot struktur HTML element yang bermasalah

---

## 🔒 Privasi & Keamanan

- **API key** disimpan di `localStorage` browser kamu — **tidak pernah** dikirim ke server manapun selain `ollama.com`
- **Soal & jawaban** dikirim ke Ollama Cloud untuk diproses (sama seperti pakai ChatGPT)
- **Web search** mengirim query ke DuckDuckGo/Wikipedia/Mojeek — query terlihat oleh mereka (sama seperti browsing biasa)
- **Tidak ada telemetry**, tidak ada analytics, tidak ada tracking
- Script **open source** — bisa diaudit sendiri

> ⚠️ **Gunakan dengan bijak**. Ini tool bantu belajar & otomasi, bukan untuk curang ujian formal. Risiko ditanggung pengguna.

---

## 🛠️ Development

### Struktur file

```
universal-quiz-solver.user.js
├── CONFIG          → konfigurasi default (timeout, storage key, dll)
├── LOG             → live logger
├── U               → utility functions (sleep, waitFor, GM request, dll)
├── AIConfig        → localStorage wrapper
├── AIManager       → AI solver + web search orchestrator
├── BaseAdapter     → abstract class untuk platform adapter
├── QuizizzAdapter  → handler untuk quizizz.com / wayground.com
├── GoogleFormsAdapter → handler untuk docs.google.com/forms
├── SemanticAdapter → fallback universal (scan input generik)
├── Solver          → orchestrator utama (solve flow)
└── UI              → panel kontrol
```

### Menambah adapter baru

```js
class MySiteAdapter extends BaseAdapter {
    matches(url) {
        return /mysite\.com/.test(url);
    }
    
    async extract() {
        // return payload { type, questionText, options, ... }
    }
    
    buildPrompt(payload) {
        // return { prompt: '...' }
    }
    
    async apply(answer, payload) {
        // isi form dengan answer
    }
}

// Tambahkan ke ADAPTERS array:
const ADAPTERS = [
    new QuizizzAdapter(),
    new GoogleFormsAdapter(),
    new MySiteAdapter(),   // ← tambahkan di sini
    new SemanticAdapter(), // fallback harus terakhir
];
```

### Build & test

Tidak ada build step — edit file langsung di Tampermonkey dashboard, `Ctrl+S` untuk save, refresh halaman untuk test.

---

## 📋 Changelog

### v69.0 — *Current*
- ✨ **DDG Instant Answer API** (resmi, bukan scraping)
- ✨ **Wikipedia API** full-text search (paling akurat untuk fakta)
- ✨ **Mojeek** sebagai fallback tambahan
- ✨ **Query variants** — coba 3 versi query per pencarian
- ✨ **Test Search button** — verifikasi search sebelum solve
- 🐛 Fix query tidak strip karakter `*`
- 🐛 Better CAPTCHA detection

### v68.0
- 🐛 **Fix critical bug**: `DOMParser` error pada Google Forms (Trusted Types CSP)
- 🔧 Rewrite HTML parser menggunakan regex (bukan DOMParser)

### v67.0
- ✨ Live log viewer
- ✨ Multi-engine scraper (DDG Lite, Bing, DDG HTML)
- 🔧 Default: temperature `0.2`, model `qwen2.5:72b`
- 🐛 Fix web search silent fail

### v66.0
- ✨ Google scraping
- ✨ Engine selector (auto/ddg/google)

### v65.0
- ✨ Hyperparameter lengkap (temperature, top_p, top_k, dll)
- ✨ Ollama web search API

### v64.0
- 🔧 Per-soal processing (1 soal = 1 request)
- 🔧 Default model `gpt-oss:120b`

### v63.0
- 🎉 Initial refactor dengan multi-adapter architecture

---

## 🤝 Kontribusi

Pull request welcome! Untuk perubahan besar:

1. **Fork** repo
2. **Buat branch** baru: `git checkout -b feature/fitur-baru`
3. **Commit**: `git commit -m 'feat: tambah fitur X'`
4. **Push**: `git push origin feature/fitur-baru`
5. **Buka Pull Request**

### Melaporkan bug

Buka [Issue](https://github.com/PerfectKaa/quiz-solver/issues) dengan:

- **Versi script** (lihat header panel)
- **Platform** (Google Forms / Quizizz / dll)
- **Screenshot log** dari panel (klik **Hapus log**, solve ulang, screenshot)
- **Browser & userscript manager** (contoh: Chrome 124 + Tampermonkey 5.0)
- **Expected vs actual behavior**

---

## 📄 Lisensi

[MIT License](LICENSE) — bebas pakai, modifikasi, dan distribusikan.

---

## 🙏 Kredit

- [Ollama](https://ollama.com) — AI backend
- [DuckDuckGo](https://duckduckgo.com) — Instant Answer API
- [Wikipedia](https://wikipedia.org) — Page summary API
- [Mojeek](https://mojeek.com) — Search fallback

---

## ⚠️ Disclaimer

Script ini disediakan **"as-is"** tanpa jaminan apapun. Penggunaan untuk:

- ✅ **Belajar** — pahami jawaban setelah di-solve
- ✅ **Otomasi** tugas berulang yang tidak melanggar ToS
- ⚠️ **Ujian formal** — risiko banned dari platform, tanggung sendiri

Developer **tidak bertanggung jawab** atas penyalahgunaan atau konsekuensi dari penggunaan script ini.

---

<div align="center">

**Made with 💜 by [PerfectKaa](https://github.com/PerfectKaa)**

⭐ Star repo ini kalau bermanfaat!

</div>
