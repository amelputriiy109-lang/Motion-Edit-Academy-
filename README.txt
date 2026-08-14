MOTION EDIT ACADEMY — GEMINI PROXY
====================================

PROJECT INI SUDAH SIAP DEPLOY.

Isi:
- worker.js       = kode Cloudflare Worker
- wrangler.json   = konfigurasi deployment
- package.json    = perintah Wrangler
- README.txt      = panduan singkat

CARA 1 — CLOUDFLARE DASHBOARD
1. Cloudflare > Workers & Pages.
2. Create Worker.
3. Buka Edit code / Quick Edit.
4. Hapus kode bawaan.
5. Salin seluruh isi worker.js ke editor.
6. Deploy.
7. Salin URL Worker, contoh:
   https://mea-gemini-proxy.<subdomain>.workers.dev

CARA 2 — WRANGLER
Di folder project:
  npm install
  npx wrangler login
  npx wrangler deploy

Setelah deploy, masukkan URL Worker ke Motion Edit Academy > Pengaturan > Proxy Gemini.

API KEY MEMBER
- Setiap member tetap memakai API Key Gemini miliknya sendiri.
- API key dikirim per request melalui x-goog-api-key.
- Worker ini tidak menyimpan API key.
- Jangan menaruh API key di worker.js, GitHub, atau wrangler.json.

ENDPOINT YANG DITERUSKAN
- GET  /models
- POST /models/{model}:generateContent

Ini mencakup daftar model, chat, foto/frame, dan request rating video yang dipakai aplikasi.
