# Panduan Menjalankan Aplikasi di Localhost dari Nol

Panduan ini ditulis untuk pengguna yang belum pernah menjalankan aplikasi web. Ikuti urutannya dari atas sampai bawah dan jangan melompati langkah.

Aplikasi **tidak perlu diletakkan di `htdocs`**. Kode dijalankan oleh Node.js/Next.js dari folder proyek. XAMPP dipakai untuk MySQL; Apache hanya diperlukan jika Anda ingin membuka phpMyAdmin.

## 1. Yang perlu diinstal

Siapkan komputer Windows dan koneksi internet, lalu instal:

1. **Node.js versi LTS** dari `https://nodejs.org/`. Gunakan versi 20.9 atau lebih baru.
2. **XAMPP** dari `https://www.apachefriends.org/`. Kita memakai MySQL/MariaDB yang tersedia di dalamnya.
3. **Git** dari `https://git-scm.com/download/win`.
4. Editor kode seperti **Visual Studio Code** jika ingin melihat atau mengubah kode.

Setelah instalasi selesai, tutup lalu buka kembali Command Prompt.

Periksa Node.js dan Git dengan perintah berikut:

```bat
node --version
npm --version
git --version
```

Jika masing-masing menampilkan nomor versi, lanjutkan.

## 2. Mengambil proyek dari GitHub

Buka **Command Prompt**. Untuk menaruh proyek di folder Downloads, jalankan:

```bat
cd %USERPROFILE%\Downloads
git clone https://github.com/ekz121/sales-performance-dashboard.git
cd sales-performance-dashboard
```

Penting: semua perintah berikutnya harus dijalankan dari folder `sales-performance-dashboard`. Jika muncul pesan bahwa `package.json` tidak ditemukan, berarti posisi folder Anda belum benar.

## 3. Menghidupkan MySQL

1. Buka **XAMPP Control Panel**.
2. Cari baris **MySQL**.
3. Klik tombol **Start**.
4. Pastikan tulisan MySQL berwarna hijau.

Apache tidak wajib untuk aplikasi ini. Anda boleh menyalakannya jika ingin membuka phpMyAdmin melalui XAMPP.

## 4. Membuat database kosong

Cara paling mudah:

1. Hidupkan **Apache** dan **MySQL** di XAMPP.
2. Buka browser.
3. Masuk ke `http://localhost/phpmyadmin`.
4. Klik menu **New** atau **Baru** di sebelah kiri.
5. Pada nama database, tulis `erafone`.
6. Klik **Create** atau **Buat**.

Tidak perlu membuat tabel secara manual. Prisma akan membuat seluruh tabel pada langkah berikutnya.

## 5. Membuat file konfigurasi `.env`

Di folder proyek terdapat file `.env.example`. Buat salinannya dengan nama `.env`:

```bat
copy .env.example .env
```

Buka file `.env` menggunakan Notepad atau VS Code. Untuk XAMPP standar dengan user `root` dan **tanpa password**, isinya dapat seperti ini:

```env
DATABASE_URL="mysql://root:@localhost:3306/erafone"
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="admin123"
AUTH_SECRET="ganti-ini-dengan-kalimat-acak-panjang-minimal-32-karakter"
```

Perhatikan bagian `root:@`: tanda titik dua langsung diikuti `@` berarti password MySQL kosong.

Jika MySQL Anda memakai password, contoh password-nya `rahasia`, ubah menjadi:

```env
DATABASE_URL="mysql://root:rahasia@localhost:3306/erafone"
```

Simpan file tersebut. Jangan pernah mengirim atau mengunggah `.env` ke GitHub.

## 6. Memasang kebutuhan aplikasi

Pastikan Command Prompt masih berada di folder proyek, lalu jalankan satu per satu. Tunggu satu perintah selesai sebelum menjalankan perintah berikutnya:

```bat
npm install
npx prisma generate
npx prisma migrate deploy
npm run prisma:seed
```

Arti sederhananya:

- `npm install`: mengunduh bahan yang dibutuhkan aplikasi.
- `prisma generate`: menyiapkan penghubung aplikasi dengan MySQL.
- `prisma migrate deploy`: membuat tabel-tabel di database `erafone`.
- `prisma:seed`: memasukkan data awal Agustus 2026 agar dashboard langsung terisi.

Jika semuanya berhasil, database sudah siap.

## 7. Menjalankan aplikasi

Jalankan:

```bat
npm run dev
```

Jangan tutup jendela Command Prompt tersebut selama aplikasi dipakai. Buka browser dan kunjungi:

- Dashboard: `http://localhost:3000/dashboard`
- Admin: `http://localhost:3000/admin`
- Import Excel/CSV dan rollback: `http://localhost:3000/admin/import`
- CRUD transaksi: `http://localhost:3000/admin/transactions`
- CRUD target report: `http://localhost:3000/admin/report-targets`

Gunakan alamat `localhost` di atas. Dashboard analytics akan memilih periode data transaksi terbaru dari MySQL. Jika target suatu periode belum pernah diimpor, nilai actual tetap tampil dan dashboard memberi penanda bahwa target periode itu belum tersedia.

Login admin mengikuti isi `.env`. Dengan contoh di atas:

- Username: `admin`
- Password: `admin123`

Ganti password tersebut sebelum aplikasi dipakai sungguhan.

## 8. Cara mengisi data

Untuk data master dalam jumlah besar, gunakan alur berikut:

1. Login ke halaman Admin.
2. Buka **Import Excel / CSV**.
3. Pilih file `.xlsx` atau `.csv` dengan format master sales.
4. Klik **Import ke MySQL** dan tunggu ringkasan jumlah baris.
5. Buka Dashboard, lalu pilih toko dan periode yang diimpor.

File tidak dipakai langsung oleh dashboard. File hanya dibaca saat proses import; sesudah itu transaksi dan konfigurasi report tersimpan di MySQL. Mengimpor file yang sama kembali aman karena transaksi yang sama dideteksi sebagai duplikat.

Halaman `/admin` adalah admin analytics terpadu. Lima menunya sama dengan dashboard: Perform Dashboard, Sales by Brand, Operator, Racing, dan Produk Fokus. Input actual manual, edit/hapus transaksi, serta target yang relevan semuanya menulis ke tabel MySQL yang dibaca dashboard. Master Store dan Sales otomatis bertambah saat file diimpor.

## 9. Memakai dashboard analytics

1. Buka Dashboard.
2. Pilih toko, bulan, dan tahun.
3. Pilih menu **Perform Dashboard**, **Sales by Brand**, **Operator**, **Racing**, atau **Produk Fokus** di sidebar kiri.
4. Klik tombol panah di atas sidebar untuk mengecilkan sidebar menjadi ikon saja; area konten akan menyesuaikan otomatis.
5. Gunakan **Sampai Tanggal** untuk mereproduksi snapshot tertentu (contoh: gambar brief memakai 20 Agustus 2026).
6. Perubahan dari Admin dikirim lintas-tab segera; polling MySQL setiap 5 detik menjadi cadangan.

Singkatan angka: `M` berarti miliar, `jt` berarti juta, dan `rb` berarti ribu. Arahkan pointer ke angka/grafik untuk melihat nilai Rupiah lengkap bila tersedia.

## 10. Cara menghentikan dan menjalankan kembali

Untuk menghentikan aplikasi, kembali ke Command Prompt lalu tekan `Ctrl + C`.

Untuk menjalankannya lagi di lain waktu:

1. Hidupkan MySQL dari XAMPP.
2. Buka Command Prompt.
3. Masuk ke folder proyek.
4. Jalankan `npm run dev`.

Contoh:

```bat
cd %USERPROFILE%\Downloads\sales-performance-dashboard
npm run dev
```

Tidak perlu menjalankan migration dan seed setiap kali aplikasi dibuka.

## 11. Solusi error yang paling sering terjadi

### `npm` atau `node` tidak dikenali

Node.js belum terinstal atau Command Prompt belum dibuka ulang. Instal Node.js LTS, tutup semua terminal, lalu coba lagi.

### PowerShell mengatakan script tidak boleh dijalankan

Gunakan **Command Prompt (cmd)** untuk menjalankan perintah. Ini paling mudah untuk pemula.

### Prisma `P1001` atau tidak bisa menjangkau database

MySQL belum hidup atau port-nya berbeda. Nyalakan MySQL di XAMPP dan pastikan port pada `.env` sesuai. Port standar adalah `3306`.

### Prisma `P1003` atau database tidak ditemukan

Database `erafone` belum dibuat. Kembali ke phpMyAdmin dan buat database tersebut.

### Prisma `P1000` atau authentication failed

Username/password MySQL pada `DATABASE_URL` salah. Untuk XAMPP standar tanpa password gunakan tepat:

```env
DATABASE_URL="mysql://root:@localhost:3306/erafone"
```

### Port 3000 sudah dipakai

Next.js biasanya menawarkan port lain seperti 3001. Buka alamat yang tertulis di terminal, atau tutup aplikasi lama yang masih memakai port 3000.

### Dashboard kosong

Pastikan MySQL berwarna hijau di XAMPP. Setelah itu buka `/admin/import`, periksa bahwa riwayat import ada, lalu pilih toko dan periode yang sama pada dashboard. Data contoh M221 tersedia pada Agustus 2026; master Kalimantan tersedia pada September 2026.

### Perubahan admin belum muncul

Tunggu maksimal 10 detik atau klik **Segarkan**. Pastikan input menggunakan periode yang sama dengan filter dashboard.

### `Unexpected end of JSON input`

Error ini biasanya muncul ketika API gagal karena MySQL mati atau konfigurasi database salah, lalu browser menerima respons kosong. Versi aplikasi ini sudah menampilkan pesan API yang aman, tetapi sumber masalah tetap harus diperbaiki: hidupkan MySQL dan pastikan `DATABASE_URL` pada `.env` benar.

Setelah MySQL menyala, hentikan aplikasi dengan `Ctrl + C`, jalankan kembali `npm run dev`, kemudian muat ulang `http://localhost:3000/dashboard`.

### Ingin mengulang data seed

Jalankan:

```bat
npm run prisma:seed
```

Seed memperbarui data referensi. Data tambahan yang dibuat sendiri tidak otomatis dihapus.

## 12. Pemeriksaan opsional

Untuk memastikan kode sehat, jalankan:

```bat
npm test
npm run build
```

Jika keduanya selesai tanpa error, aplikasi siap digunakan.
