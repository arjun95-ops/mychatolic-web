# Liturgy Admin Workflow

## Tujuan
- Semua data kalender liturgi harian diisi dari dashboard admin.
- Tidak ada data dummy/contoh yang ikut tersimpan ke database produksi.
- Siklus tahun liturgi wajib menggunakan nilai `A`, `B`, atau `C`.

## Prasyarat Schema
- Jalankan patch database dari app repo:
  `supabase_patches/25_schedule_liturgy_content_fields.sql`
- Jika patch belum dijalankan, halaman liturgi admin akan menolak simpan/import.

## Kolom Wajib Harian
- `date`
- `feast_name`
- `liturgical_day_name`
- `celebration_rank`
- `color`
- `liturgical_cycle` (`A/B/C`)
- `bacaan1`, `bacaan1_teks`
- `mazmur`, `mazmur_teks`
- `bait_pengantar_injil`, `bait_pengantar_injil_teks`
- `injil`, `injil_teks`

## Kolom Opsional
- `memorial_name`
- `saint_name`
- `bacaan2`, `bacaan2_teks` (harus berpasangan; tidak boleh salah satu saja)

## Import CSV/XLSX
- Gunakan template resmi di:
  - `public/templates/liturgi_import_template.csv`
  - `public/templates/liturgi_import_template.xlsx`
- Import bersifat **all-or-nothing**:
  - jika ada satu baris invalid, seluruh import dibatalkan.
  - sistem menampilkan contoh baris error agar bisa diperbaiki.
