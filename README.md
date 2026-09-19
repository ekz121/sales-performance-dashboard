# Erafone & More Sales Performance Dashboard
Dashboard untuk melihat target, MTD, proyeksi akhir bulan, achievement, gap, kontribusi kategori, dan growth sales. Dashboard berada di `/dashboard`, sedangkan input dan edit data berada di `/admin`.

Aplikasi ini adalah aplikasi Next.js, jadi **tidak perlu dipindahkan ke `htdocs`**. XAMPP hanya diperlukan untuk menjalankan MySQL/MariaDB (dan Apache bila ingin memakai phpMyAdmin).

> Baru pertama kali memakai aplikasi? Ikuti [PANDUAN-LOCALHOST.md](./PANDUAN-LOCALHOST.md) dari langkah pertama tanpa dilewati.

> Ingin memasangnya secara online gratis? Ikuti [DEPLOY-GRATIS.md](./DEPLOY-GRATIS.md).

## Perintah cepat untuk pengguna yang sudah siap

Pastikan Node.js 20.9+, MySQL aktif, database `erafone` sudah dibuat, dan `.env` sudah benar.

```bash
npm install
npx prisma generate
npx prisma migrate deploy
npm run prisma:seed
npm run dev
```

Alamat utama:

- Dashboard analytics: `http://localhost:3000/dashboard`
- Login admin: `http://localhost:3000/admin`
- Import Excel/CSV dan rollback batch: `http://localhost:3000/admin/import`
- Admin terpadu lima menu + Master Store: `http://localhost:3000/admin`
- CRUD transaksi tabel lengkap: `http://localhost:3000/admin/transactions`
- CRUD target tabel lengkap: `http://localhost:3000/admin/report-targets`

File Excel/CSV hanya menjadi sumber impor. Setelah impor selesai, seluruh transaksi, target report, riwayat batch, filter, dan perhitungan dashboard dibaca dari MySQL.

Jangan pernah mengunggah file `.env` karena berisi akses database dan akun admin.

## Deploy

Rekomendasi gratis untuk aplikasi ini adalah Netlify Free untuk aplikasi dan Aiven Free untuk MySQL. Tambahkan seluruh environment variable ke Netlify, lalu jalankan `npx prisma migrate deploy` dan `npm run prisma:seed` terhadap database Aiven satu kali. Seed bersifat idempotent untuk store, target, dan entry referensi. Langkah lengkap, migrasi data lokal, troubleshooting, dan batas free tier ada di `DEPLOY-GRATIS.md`.

## Audit rumus

Semua rumus murni berada di `lib/calculations.ts`:

- `calculateExpect`: MTD × total hari / hari berjalan.
- `calculateAchievement`: Expect / Target × 100.
- `calculateGap`: Target − MTD.
- `calculateTargetByDay`: Gap / sisa hari.
- `calculateContribution`: MTD kategori / total MTD × 100.
- `calculateGrowth`: (Expect bulan ini − actual final bulan lalu) / actual final bulan lalu × 100.

`app/api/dashboard/route.ts` mengambil entry terbaru per sales/kategori untuk bulan terpilih, menentukan hari snapshot dari tanggal entry terbaru, lalu memanggil fungsi-fungsi tersebut. Bila bulan lalu tidak punya entry, growth dikirim sebagai `null` dan UI menampilkan `-`. Unit test ada di `lib/calculations.test.ts` dan dijalankan dengan `npm test`.

## Sinkronisasi dan debugging data

- `app/api/dashboard/route.ts` memakai `dynamic = "force-dynamic"`, `revalidate = 0`, `fetchCache = "force-no-store"`, query Prisma baru pada setiap request, dan header HTTP `no-store`.
- Seluruh route mutasi di `app/api/admin/**` memanggil `revalidateDashboard()` setelah create/update/delete.
- `components/admin-client.tsx` memanggil SWR `mutate()` setelah mutasi berhasil.
- `components/dashboard-client.tsx` memakai interval refetch 10 detik dan revalidate saat tab kembali fokus. Ini menjamin tab/perangkat lain menyusul maksimal sekitar 10 detik tanpa WebSocket.

Jika perubahan tidak muncul, periksa berurutan: response mutasi admin, isi tabel MySQL, response `/api/dashboard?month=8&year=2026` (pastikan header `Cache-Control: no-store`), lalu request berkala di Network tab browser.

## Catatan konsistensi data referensi

Target kategori yang diberikan per sales berjumlah Rp477.932.019, bukan Rp479.780.455 seperti baris TOTAL ALL. Total seluruh target kategori adalah Rp1.911.728.076 berdasarkan empat nilai seed identik, bukan Rp1.919.121.822. Aplikasi sengaja menghitung total dari record kategori di database supaya edit admin selalu konsisten dan tidak ditimpa angka hardcode. MTD seed dan actual final Juli disimpan persis; nilai Juli dibagi proporsional per kategori dengan metode largest remainder sehingga total setiap sales tetap persis.

## Pemeriksaan

```bash
npm test
npx tsc --noEmit
npm run build
```

## Format impor Excel/CSV

Halaman `/admin/import` menerima `.xlsx` dan `.csv` maksimal 4 MB. Untuk Excel, gunakan sheet `MASTER` dan letakkan header pada baris pertama. Sembilan kolom wajibnya adalah `site_code`, `site_desc`, `sales_name`, `order_date`, `brand_name`, `article_description`, `quantity`, `total_nett_amount_exc_tax`, dan `CAT`. Template yang dapat diunduh dari halaman import sudah memuat seluruh 24 kolom yang didukung beserta contoh dan petunjuk.

Tanggal dapat berupa tanggal Excel, `DD/MM/YYYY`, atau `YYYY-MM-DD`. Kolom nominal harus berupa angka tanpa teks `Rp`. Kategori utama yang ditampilkan pada ringkasan performa adalah `DEVICE`, `ACC & IOT`, `REPAIR CONTRACT`, `CARRIER`, `CE`, dan `LAPTOP`; kategori lain tetap disimpan dan terlihat pada daftar transaksi.

Workbook report seperti `REPORT M221 AGUSTUS 2026 UPDATE.xlsx` juga dapat diimpor selama sheet `MASTER` dan `TARGET` dengan layout report asli tetap dipertahankan. Sheet `MASTER` mengisi seluruh actual; sheet `TARGET` mengisi target kategori, brand, operator, dan racing. File master tanpa `TARGET` tetap sah, tetapi hanya memperbarui actual. Target juga dapat dikelola melalui `/admin/report-targets`.

Seluruh file divalidasi sebelum disimpan. Jika ada baris wajib yang tidak valid, pesan error menyebut nomor baris dan seluruh impor dibatalkan. Penyimpanan memakai transaksi database sehingga tidak ada kondisi sebagian baris masuk. Baris identik dideduplikasi menggunakan fingerprint; mengunggah file yang sama kembali tidak menggandakan omzet atau membuat riwayat kosong.

Urutan pemakaian:

1. Hidupkan MySQL di XAMPP.
2. Jalankan `npm run dev` dari folder proyek.
3. Login di `/admin`, lalu buka **Import Excel / CSV**.
4. Unggah file dan tunggu ringkasan hasil impor.
5. Buka `/dashboard`, pilih toko, bulan, tahun, dan tanggal snapshot yang sesuai.
6. Kelola actual dan target kelima menu langsung melalui `/admin`; tampilan tabel lengkap tetap tersedia di `/admin/transactions` dan `/admin/report-targets`.
7. Hapus seluruh batch yang salah melalui riwayat import. Master Store/Sales otomatis tersinkron dari baris yang diimpor.
