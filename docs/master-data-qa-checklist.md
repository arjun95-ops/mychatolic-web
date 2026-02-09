# Master Data QA Checklist

Tanggal eksekusi: **February 9, 2026**

## Scope
- Modul `Master Data Management`:
  - Negara
  - Keuskupan
  - Paroki
  - Jadwal Misa
- Fokus regresi:
  - CRUD inti
  - Relasi saat delete
  - Konsistensi schema aktual (`mass_schedules.day_number/start_time/title`)
  - Proteksi write melalui endpoint admin

## Automated Regression (Executed)
Command:

```bash
node scripts/qa-master-data-regression.mjs
```

Ringkasan hasil:
- PASS: schema check `countries/dioceses/churches/mass_schedules`
- PASS: anon read smoke untuk `countries/dioceses/churches/mass_schedules` (simulasi Flutter client)
- PASS: schedule insert/update/delete (service role)
- PASS: church insert/update/delete (service role)
- PASS: sinkronisasi write->read (`service_role` tulis, `anon` bisa baca data baru)
- INFO: ada dependency data existing pada `profiles/mass_schedules/mass_checkins/posts/radars`
- PASS: direct anon write terblokir untuk `countries/dioceses/churches/mass_schedules`

## Manual UI Regression Matrix

### A. Negara
1. Tambah negara baru
- Step: Master Data > Negara > Tambah Negara > Simpan
- Expected: toast sukses, baris muncul di tabel

2. Edit negara
- Step: klik ikon edit > ubah nama/ISO > Simpan
- Expected: data ter-update, tidak ada error SQL/RLS

3. Hapus negara dengan relasi
- Step: hapus negara yang masih dipakai keuskupan
- Expected: HTTP 409, toast menampilkan detail referensi (contoh: `Keuskupan (N)`)

### B. Keuskupan
1. Tambah keuskupan
- Step: Master Data > Keuskupan > Tambah Keuskupan > isi negara > Simpan
- Expected: sukses, muncul di list

2. Edit keuskupan
- Step: ubah alamat/maps/uskup/foto > Simpan
- Expected: sukses, data ter-update

3. Hapus keuskupan dengan relasi paroki
- Step: hapus keuskupan yang masih dipakai paroki
- Expected: HTTP 409, toast detail referensi (`Paroki (N)`)

### C. Paroki
1. Tambah paroki
- Step: Master Data > Paroki > Tambah Paroki > Simpan
- Expected: sukses, data muncul

2. Edit paroki
- Step: ubah nama/alamat/maps > Simpan
- Expected: sukses

3. Hapus paroki dengan relasi
- Step: hapus paroki yang punya data schedule/checkin/post/profile/radar
- Expected: API cleanup berjalan; jika masih terblokir, toast detail relasi tampil

### D. Jadwal Misa
1. Tambah jadwal
- Step: pilih negara > keuskupan > paroki > Tambah Jadwal > Simpan
- Expected: sukses, jadwal tampil dengan grouping benar

2. Edit jadwal
- Step: klik edit jadwal > ubah hari/jam/kategori > Simpan
- Expected: sukses, data update

3. Hapus jadwal
- Step: klik delete jadwal
- Expected: sukses; jika ada FK, tampil detail tabel referensi

### E. Export
1. Export master data
- Step: klik `Export Data (.xlsx)`
- Expected: file terunduh, kolom `Jadwal Misa` terisi dari `day_number/start_time/title/language`

## Security Hardening (Required Action)
- File SQL sudah ditambahkan hardening di `admin_rbac_backup_schema_v1.sql` untuk:
  - grant service_role pada tabel relasi yang dipakai cleanup
  - revoke direct write `countries/dioceses` dari `anon/authenticated`
- Jalankan ulang SQL tersebut di Supabase SQL Editor agar warning `anon write allowed` hilang.

## Acceptance Criteria
- Semua skenario manual A–E lulus.
- Endpoint admin baru mengembalikan status/response sesuai (200/400/409/500) dengan pesan jelas.
- Tidak ada operasi write master data yang bergantung pada client direct write tanpa proteksi endpoint admin.
