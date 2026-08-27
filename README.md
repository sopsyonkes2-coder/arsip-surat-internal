This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
Menjalankan Project

Install dependency:

npm install

Jalankan development server:

npm run dev

Kemudian buka:

http://localhost:3000
Push Perbaikan ke GitHub

Setiap kali melakukan perubahan pada project di VS Code, gunakan langkah berikut.

1. Cek perubahan
git status
2. Tambahkan perubahan

Untuk semua file:

git add .

Atau hanya file tertentu:

git add nama-file
3. Buat commit

Contoh:

git commit -m "Perbaikan halaman arsip"

Contoh commit lainnya:

git commit -m "Perbaikan login pengguna"
git commit -m "Tambah fitur pencarian arsip"
git commit -m "Perbaikan tampilan responsive"
4. Push ke GitHub
git push

Karena repository sudah terhubung dengan origin dan branch main, cukup menggunakan:

git push
Alur Singkat Perbaikan

Setiap selesai melakukan perubahan:

git status
git add .
git commit -m "Deskripsi perubahan"
git push

Contoh:

git status
git add .
git commit -m "Perbaikan fitur arsip surat"
git push
Mengecek Repository

Repository GitHub:

https://github.com/sopsyonkes2-coder/arsip-surat-internal

Catatan Keamanan

Jangan melakukan commit terhadap file yang berisi informasi rahasia seperti:

API Key
Password
Token
Credential
Private Key
File .env
File .env.local

Pastikan file rahasia sudah tercantum dalam .gitignore.

Pengembangan

Project dikembangkan secara bertahap. Setiap perubahan sebaiknya dibuat dalam commit yang jelas agar riwayat perubahan project mudah ditelusuri.

Contoh format commit:

feat: menambahkan fitur baru
fix: memperbaiki bug
style: memperbaiki tampilan
refactor: merapikan kode
docs: memperbarui dokumentasi

Contoh:

git commit -m "feat: tambah pencarian arsip"
git commit -m "fix: perbaiki upload dokumen"
git commit -m "style: perbaiki tampilan dashboard"