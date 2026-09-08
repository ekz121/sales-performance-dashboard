# Deployment Gratis: Netlify + Aiven MySQL

Panduan ini menggunakan:

- **Netlify Free** untuk aplikasi Next.js. Paket Free bernilai $0 dengan 300 credit per bulan dan hard limit; aplikasi berhenti sementara jika limit habis, bukan menagih otomatis. Netlify mendukung App Router, SSR, route handlers, dan revalidation Next.js.
- **Aiven for MySQL Free** untuk database. Paket ini tidak memerlukan kartu kredit, tidak memiliki masa kedaluwarsa, dan menyediakan 1 CPU, RAM 1 GB, serta storage 1 GB.

Kombinasi ini cocok untuk dashboard toko dengan trafik kecil. Free tier tidak memiliki SLA dan kebijakannya dapat berubah. Aiven dapat mematikan service gratis yang lama tidak aktif, tetapi service dapat dinyalakan kembali dari console.

## A. Siapkan repository GitHub

Jangan upload `.env`; file tersebut sudah masuk `.gitignore`.

1. Buat repository baru di GitHub. Pilih **Private** jika source code tidak ingin dibuka untuk publik.
2. Dari terminal folder proyek, jalankan:

   ```bash
   git init
   git add .
   git commit -m "Initial Erafone sales dashboard"
   git branch -M main
   git remote add origin https://github.com/USERNAME/NAMA-REPOSITORY.git
   git push -u origin main
   ```

Jika Git meminta login, gunakan browser login GitHub atau Personal Access Token, bukan password akun biasa.

## B. Buat MySQL gratis di Aiven

1. Buka [Aiven Console](https://console.aiven.io/) dan buat akun.
2. Buat Project, pilih **Create service**, lalu pilih **MySQL**.
3. Pilih plan **Free** dan buat service. Pada paket Free, region/provider dapat ditentukan otomatis oleh Aiven.
4. Tunggu status service menjadi **Running**.
5. Buka **Overview â†’ Connection information** dan salin **Service URI**. Database awal biasanya `defaultdb`.
6. Bentuk `DATABASE_URL` Prisma seperti berikut:

   ```env
   DATABASE_URL="mysql://avnadmin:PASSWORD@HOST:PORT/defaultdb?ssl-mode=REQUIRED&connection_limit=1"
   ```

Gunakan user, password, host, port, dan database persis dari Aiven. Karakter khusus pada password harus URL-encoded. Jangan menggunakan URL MySQL lokal `localhost` karena server Netlify tidak dapat mengakses XAMPP di komputer Anda.

Jika koneksi strict meminta certificate, unduh CA certificate dari Aiven, simpan sebagai `prisma/ca.pem`, lalu gunakan:

```env
DATABASE_URL="mysql://avnadmin:PASSWORD@HOST:PORT/defaultdb?sslcert=ca.pem&sslaccept=strict&connection_limit=1"
```

## C. Buat tabel dan data awal di Aiven

Jalankan ini dari PowerShell di komputer lokal. Nilai environment hanya berlaku pada jendela terminal tersebut:

```powershell
$env:DATABASE_URL="mysql://avnadmin:PASSWORD_BARU@HOST_AIVEN:PORT/defaultdb?ssl-mode=REQUIRED"
npx prisma generate
npx prisma migrate deploy
npm run prisma:seed
```

Hasil yang benar harus menampilkan migration berhasil dan `Seed M221 Agustus 2026 berhasil`.

### Jika ingin membawa data XAMPP saat ini

`prisma:seed` hanya memasukkan data seed. Sales atau perubahan lain yang dibuat setelah seed tidak ikut terbawa. Pilih cara ini sebagai pengganti seed jika ingin membawa data operasional lokal. Jalankan migration pada Aiven, tetapi jangan jalankan seed sebelum import data.

1. Buat backup dari XAMPP:

   ```powershell
   & "C:\xampp\mysql\bin\mysqldump.exe" -u root --single-transaction --no-create-info --result-file="erafone-data.sql" erafone Store Sales Target DailyEntry ImportBatch SalesTransaction ReportDataset
   ```

2. Di Aiven, jalankan `npx prisma migrate deploy` seperti bagian C, tetapi lewati `npm run prisma:seed`.
3. Import data menggunakan MySQL client. Opsi `-p` meminta password sehingga password tidak tersimpan di command history:

   ```powershell
   & "C:\xampp\mysql\bin\mysql.exe" --host=HOST_AIVEN --port=PORT_AIVEN --user=avnadmin -p --ssl-mode=REQUIRED defaultdb -e "source erafone-data.sql"
   ```

Simpan backup di tempat aman dan jangan commit file SQL yang berisi data toko ke GitHub.

## D. Deploy aplikasi di Netlify Free

1. Buka [Netlify](https://app.netlify.com/) dan masuk menggunakan GitHub.
2. Pilih **Add new project â†’ Import an existing project**.
3. Pilih GitHub dan repository dashboard.
4. Netlify akan mendeteksi Next.js. Gunakan:

   ```text
   Build command: npm run build
   Publish directory: .next
   ```

5. Sebelum deploy, buka **Site configuration â†’ Environment variables** dan tambahkan:

   ```env
   DATABASE_URL=mysql://avnadmin:PASSWORD_BARU@HOST_AIVEN:PORT/defaultdb?ssl-mode=REQUIRED&connection_limit=1
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD=GANTI_DENGAN_PASSWORD_KUAT
   AUTH_SECRET=GANTI_DENGAN_SECRET_ACAK
   ```

6. Buat `AUTH_SECRET` dengan perintah berikut, lalu salin hasilnya:

   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```

7. Terapkan variables untuk **Production** dan **Deploy previews**, lalu tekan **Deploy**.
8. Setelah selesai, Netlify memberikan domain gratis seperti `nama-dashboard.netlify.app`.

Perubahan environment variable hanya berlaku pada deployment baru. Setelah mengubah variable, lakukan **Deploys â†’ Trigger deploy**.

### Jika halaman Netlify menampilkan 404

Repository sudah menyediakan `netlify.toml`, sehingga pengaturan yang benar akan terbaca otomatis:

```text
Build command: npm run build
Publish directory: .next
Node.js: 20
```

Setelah versi terbaru masuk ke GitHub:

1. Buka project di Netlify.
2. Pastikan **Project configuration â†’ Build & deploy â†’ Continuous deployment â†’ Repository** menunjuk ke `EKAZEIN495/sales-performance-dashboard-3.0` dan branch `main`.
3. Buka **Deploys**.
4. Pilih **Trigger deploy â†’ Clear cache and deploy site**.
5. Tunggu sampai status deploy menjadi **Published**.
6. Buka domain utama atau tambahkan `/dashboard` di belakang domain.

Jangan membuat redirect `/* /index.html 200`; aplikasi ini memakai Next.js server routes, bukan static SPA biasa. Jika masih 404, buka deploy terbaru dan periksa bagian **Deploy log**. Pastikan log berisi proses `next build` dan deteksi Next.js oleh Netlify.

## E. Pemeriksaan setelah online

1. Buka `https://nama-dashboard.netlify.app/dashboard`.
2. Pilih Agustus 2026 dan pastikan data tampil.
3. Buka `/admin`, login dengan environment admin.
4. Edit satu Daily Entry dengan perubahan kecil.
5. Pastikan dashboard berubah langsung pada browser yang sama atau maksimal 5 detik melalui polling cadangan.
6. Buka `/admin/import`, unduh template, lalu pastikan halaman Transaksi dan Target Report dapat dibuka.

Jika dashboard kosong, periksa:

- `DATABASE_URL` Netlify memakai host Aiven, bukan `localhost`.
- Migration dan seed sudah dijalankan pada URL Aiven.
- Semua environment variable diterapkan ke Production.
- Aiven service berstatus Running.
- Password dengan karakter `@`, `:`, `/`, `#`, atau `%` sudah URL-encoded.
- Log error berada di Netlify **Logs â†’ Functions**.

## F. Batas hosting gratis

- Netlify Free memiliki 300 credit per bulan dengan hard limit. Saat habis, project dapat berhenti sampai siklus berikutnya tanpa biaya otomatis.
- Aiven Free menyediakan 1 GB storage dan maksimal 76 koneksi. `connection_limit=1` adalah titik awal yang direkomendasikan Prisma untuk function serverless dan membantu menjaga batas koneksi Aiven.
- Aiven Free dapat dimatikan ketika lama tidak aktif dan tidak memiliki SLA produksi.
- Lakukan backup database berkala karena ini menyimpan data operasional toko.

## Alternatif Vercel

Vercel Hobby juga gratis secara teknis dan sangat cocok dengan Next.js, tetapi dokumentasi resminya membatasi Hobby untuk proyek personal/nonkomersial. Gunakan hanya untuk demo pribadi. Untuk dashboard operasional toko, jalur Netlify Free di atas lebih sesuai. Database tetap dapat memakai Aiven Free.

## Referensi resmi

- [Netlify Free pricing](https://www.netlify.com/pricing/)
- [Next.js on Netlify](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/)
- [Aiven MySQL Free Tier](https://aiven.io/docs/products/mysql/concepts/mysql-free-tier)
- [Aiven MySQL setup](https://aiven.io/docs/products/mysql/get-started)
- [Prisma MySQL connection URL](https://www.prisma.io/docs/orm/v6/overview/databases/mysql)
- [Vercel Hobby restrictions](https://vercel.com/docs/plans/hobby)
