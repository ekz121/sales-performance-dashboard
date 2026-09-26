# Erafone & More Sales Performance Dashboard
Dashboard untuk melihat target, MTD, proyeksi akhir bulan, achievement, gap, kontribusi kategori, dan growth sales. Dashboard berada di `/dashboard`, sedangkan input dan edit data berada di `/admin`.

## Paket lokal satu-klik untuk klien Windows

Folder distribusi dapat diletakkan di mana saja, termasuk `C:\xampp\htdocs\sales-performance-dashboard`. Apache tidak menjalankan Next.js; launcher menjalankan web pada port khusus 3210 dan XAMPP menyediakan MariaDB/MySQL.

1. Sertakan tiga workbook pada folder `data-awal`.
2. Klien memasang XAMPP di `C:\xampp` dan Node.js LTS 20+.
3. Klien menjalankan `INSTALL_DASHBOARD.bat` satu kali. Installer otomatis membuat database `erafone_dashboard`, akun MySQL unik untuk folder instalasi, seluruh tabel, mengimpor Excel, membuat build produksi, dan membuat shortcut Desktop.
4. Pemakaian berikutnya cukup klik **Buka Sales Dashboard**. Alamatnya `http://localhost:3210/dashboard`.
5. Gunakan **Tutup Sales Dashboard** untuk menghentikan web; MySQL tidak dihentikan karena mungkin dipakai aplikasi XAMPP lain.

Petunjuk singkat untuk klien ada di `MULAI-DI-SINI.txt`. Penjelasan nonteknis yang siap disalin ke Word ada di `DESKRIPSI-UNTUK-KLIEN.txt`. File `.env`, `node_modules`, `.next`, log, PID, dan workbook operasional tidak di-commit.

Aplikasi ini adalah aplikasi Next.js, jadi **tidak perlu dipindahkan ke `htdocs`**. XAMPP hanya diperlukan untuk menjalankan MySQL/MariaDB (dan Apache bila ingin memakai phpMyAdmin).

> Baru pertama kali memakai aplikasi? Ikuti [PANDUAN-LOCALHOST.md](./PANDUAN-LOCALHOST.md) dari langkah pertama tanpa dilewati.

> Ingin memasangnya secara online gratis? Ikuti [DEPLOY-GRATIS.md](./DEPLOY-GRATIS.md).

## Perintah cepat untuk pengguna yang sudah siap

Pastikan Node.js 20.9+, MySQL aktif, database sudah dibuat, dan `.env` sudah benar. Untuk instalasi klien gunakan installer satu-klik; perintah manual berikut hanya untuk pengembangan.

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
- Pengaturan program Racing bulanan: `http://localhost:3000/admin/racing`
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

## Impor Excel/CSV fleksibel

Halaman `/admin/import` menerima `.xlsx` dan `.csv` maksimal 15 MB melalui wizard dua tahap. Sistem mencari baris header pada 100 baris awal, mengenali alias nama kolom Indonesia/Inggris, dan menyimpan profil pemetaan untuk format yang sama. Jika format baru belum dikenali, pengguna memilih kolom sumber dari dropdown tanpa mengubah workbook.

Sembilan nilai minimum yang harus dapat dipetakan adalah kode toko, nama toko, nama sales, tanggal order, brand, deskripsi artikel, quantity, omzet nett sebelum pajak, dan kategori. Tanggal dapat berupa tanggal Excel, `DD/MM/YYYY`, atau `YYYY-MM-DD`. Nilai tanggal, quantity, dan omzet tetap harus valid.

Preview menampilkan jumlah baris, duplikat, toko, rentang tanggal, total quantity, omzet, dan jeda tanggal sebelum ada perubahan database. Tersedia dua mode:

- **Tambahkan data baru** untuk data lanjutan; fingerprint identik dilewati.
- **Ganti data pada rentang file** untuk revisi; data lama pada toko/rentang tanggal terkait dicadangkan lalu diganti.

Seluruh validasi dan penyimpanan memakai transaksi database sehingga tidak ada impor setengah jadi. Rollback menghapus batch baru dan, pada mode ganti rentang, mengembalikan data lama beserta konfigurasi report sebelumnya.

Workbook report dengan sheet `TARGET` tetap mengisi target kategori, brand, operator, dan Racing. File master tanpa `TARGET` tetap sah untuk actual. Karena program Racing berubah setiap bulan, definisi program dapat dikelola tanpa kode melalui `/admin/racing` dan disalin dari bulan sebelumnya.

Dashboard hanya menghitung transaksi sampai tanggal snapshot. Bila file baru memiliki data tanggal 15–30, tanggal 1–14 menampilkan actual nol/kosong sementara target tetap terlihat; data tanggal 15 tidak pernah ditarik mundur ke tanggal 14.

Database dibackup otomatis sekali sehari oleh launcher ke folder `backups` dengan retensi 30 hari. Detail instalasi, penggunaan, pemetaan kolom, Racing, rollback, dan troubleshooting ada di [PANDUAN-LOCALHOST.md](./PANDUAN-LOCALHOST.md).
