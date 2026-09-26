# Panduan Localhost untuk Klien Windows

Aplikasi ini berjalan dengan **Next.js + MySQL/MariaDB**. Proyek tidak perlu dan tidak disarankan ditaruh di `htdocs`. XAMPP hanya dipakai untuk menyalakan MySQL; Apache opsional untuk membuka phpMyAdmin.

## Instalasi pertama kali (cara yang direkomendasikan)

Yang perlu terpasang:

1. Windows 10/11.
2. Node.js LTS versi 20.9 atau lebih baru.
3. XAMPP di `C:\xampp`.

Langkah pemasangan:

1. Ekstrak `Sales-Dashboard-Localhost-Klien.zip` ke folder biasa, misalnya `C:\Sales-Dashboard-Localhost-Klien`.
2. Buka XAMPP Control Panel dan nyalakan **MySQL**. Apache tidak wajib.
3. Klik dua kali `INSTALL_DASHBOARD.bat` satu kali saja.
4. Tunggu sampai tertulis `SETUP SELESAI` dan browser terbuka.

Installer otomatis membuat database `erafone_dashboard`, akun aplikasi lokal yang unik untuk folder instalasi, semua tabel, data awal dari folder `data-awal`, build produksi, dan shortcut Desktop. Klien tidak perlu membuka kode, membuat tabel, atau mengatur `.env` sendiri.

## Pemakaian sehari-hari

1. Nyalakan **MySQL** di XAMPP.
2. Klik shortcut Desktop **Buka Sales Dashboard**.
3. Browser dibuka otomatis. Port utama adalah 3210; jika sedang dipakai aplikasi lain, launcher memilih port berikutnya dan tetap membuka alamat yang benar.
4. Untuk menutup web, klik shortcut **Tutup Sales Dashboard**.

Jika ada lebih dari satu folder dashboard, setiap instalasi memakai port kosongnya sendiri. Launcher tidak akan membuka akun atau database milik folder lain.

Alamat utama saat memakai port 3210:

- Dashboard: `http://localhost:3210/dashboard`
- Login admin: `http://localhost:3210/admin/login`
- Import Excel/CSV: `http://localhost:3210/admin/import`
- Atur program Racing: `http://localhost:3210/admin/racing`
- CRUD transaksi: `http://localhost:3210/admin/transactions`
- CRUD target report: `http://localhost:3210/admin/report-targets`

Username awal adalah `admin`. Password ditentukan saat instalasi dan tersimpan hanya di komputer klien.

## Cara upload Excel/CSV

Halaman Import memakai alur dua tahap agar file dengan format yang berubah tidak langsung merusak data:

1. Pilih file `.xlsx` atau `.csv` maksimal 15 MB, lalu klik **Analisis File**.
2. Sistem mencari header pada 100 baris awal, mengenali berbagai nama kolom Indonesia/Inggris, dan memakai profil format yang pernah disimpan.
3. Jika ada kolom yang belum dikenali, pilih kolom sumber pada dropdown pemetaan. Klien tidak perlu mengubah file asal.
4. Periksa preview: jumlah baris, duplikat, toko, rentang tanggal, quantity, omzet, dan jeda tanggal.
5. Pilih mode:
   - **Tambahkan data baru**: aman untuk file lanjutan; baris identik dilewati.
   - **Ganti data pada rentang file**: cocok untuk revisi periode; data lama dalam toko dan rentang tanggal yang sama diganti secara transaksional.
6. Klik **Konfirmasi ke MySQL**.

Impor menggunakan transaksi database: bila validasi gagal, tidak ada setengah data yang masuk. Riwayat impor dapat di-rollback. Pada mode ganti rentang, rollback juga mengembalikan data lama yang diganti.

Syarat minimum agar suatu baris penjualan dapat masuk adalah adanya nilai untuk:

- kode toko;
- nama toko;
- nama sales;
- tanggal order;
- brand;
- deskripsi artikel;
- quantity;
- omzet nett sebelum pajak;
- kategori.

Nama header tidak harus persis sama karena dapat dipetakan di layar. Namun nilai di dalam baris tetap harus masuk akal: tanggal valid, quantity berupa angka, dan omzet berupa angka. File Excel yang diproteksi password harus dibuka proteksinya terlebih dahulu.

## Perilaku tanggal yang normal

Dashboard tidak menganggap tanggal tanpa transaksi sebagai transaksi nol yang sudah dilaporkan, dan tidak memundurkan data masa depan.

Contoh: data file baru berisi tanggal 15–30 September.

- Saat memilih **14 September**, actual/MTD tampil nol atau kosong karena belum ada transaksi sampai tanggal itu. Target tetap tampil sebagai acuan.
- Saat memilih **15 September**, actual hanya menghitung transaksi sampai tanggal 15.
- Saat memilih **30 September**, actual menghitung seluruh transaksi tanggal 15–30.
- Rentang tanggal data aktual ditampilkan pada dashboard supaya pengguna mengetahui cakupan file.

Proyeksi memakai hari data yang benar-benar tersedia sampai tanggal pilihan, bukan tanggal komputer dan bukan tanggal transaksi di masa depan.

## Racing yang berubah setiap bulan

Program Racing dikelola per toko, bulan, dan tahun melalui `/admin/racing`.

- Tambah, ubah, atau hapus aturan tanpa mengubah kode.
- Aturan dapat memakai brand, artikel, kategori, minimum nilai, unit quantity atau omzet, dan nilai nett/gross.
- Tombol **Salin bulan sebelumnya** membuat titik awal untuk bulan baru, kemudian admin cukup menyesuaikan program yang berubah.
- Target program tetap dapat diatur dari Admin dan actual dihitung dari transaksi MySQL pada periode terpilih.

Dengan cara ini perubahan Racing tidak bergantung pada bentuk sheet Excel tertentu.

## Data, CRUD, backup, dan keamanan

Semua halaman membaca dan menulis database MySQL yang sama. Tambah/edit/hapus transaksi, target, dan program Racing akan terbaca dashboard setelah refresh tanpa ekspor ulang.

Launcher membuat backup database otomatis sekali sehari ke folder `backups`. Backup lama disimpan selama 30 hari. Folder backup, `.env`, log, dan password tidak dimasukkan ke GitHub atau paket distribusi.

Jangan menghapus folder aplikasi setelah dipasang karena `.env` dan launcher ada di sana. Memindahkan folder setelah instalasi sebaiknya diikuti dengan menjalankan installer lagi agar akun lokal dan shortcut diperbarui.

Untuk menghapus folder, klik **Tutup Sales Dashboard** terlebih dahulu dan tunggu pesannya. Menutup tab browser tidak menghentikan server Node.js yang berjalan tersembunyi. Setelah server dihentikan, tutup terminal atau VS Code yang sedang berada di folder tersebut, lalu hapus folder melalui File Explorer.

## Solusi masalah umum

### Dashboard gagal menyala

1. Pastikan MySQL XAMPP berwarna hijau.
2. Jalankan `INSTALL_DASHBOARD.bat` lagi. Installer aman dijalankan ulang dan tidak menggandakan transaksi identik.
3. Buka `logs\dashboard-error.log` bila pesan tetap muncul.

### Browser terus memuat

Tutup launcher lama dengan **Tutup Sales Dashboard**, pastikan MySQL hidup, lalu jalankan **Buka Sales Dashboard**. Launcher menunggu health check aplikasi dan memilih port kosong secara otomatis.

### Database tidak dapat dihubungi

Pastikan MySQL memakai port yang terdeteksi installer dan belum dihentikan. Jangan menyalin `.env` dari instalasi lain karena setiap folder memiliki akun database lokalnya sendiri.

### File tidak dapat diimpor

Gunakan **Analisis File**, lalu isi pemetaan kolom yang ditandai belum cocok. Pesan validasi menyebut sheet, header, atau baris yang bermasalah. Jangan menekan konfirmasi sebelum ringkasan preview sesuai file.

### Data salah setelah impor

Buka Riwayat Import pada halaman import dan pilih rollback untuk batch tersebut. Untuk file revisi berikutnya gunakan mode **Ganti data pada rentang file**.

## Pemeriksaan teknis opsional

Pengembang dapat menjalankan pemeriksaan berikut dari folder proyek:

```bat
npm install
npx prisma migrate deploy
npm test
npx tsc --noEmit
npm run build
```

Untuk pengembangan gunakan `npm run dev`. Untuk klien selalu gunakan installer dan launcher produksi yang disediakan.
