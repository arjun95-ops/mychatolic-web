# TB1 Placeholder Patch Flow

Tujuan: mengganti ayat placeholder `[MISSING_VERSE][AUTO]` di workspace `id/TB1` dengan teks final.

## 1) Generate template terbaru

```bash
npm run bible:tb1:placeholder-template
```

Output:

- `docs/import/tb1_placeholder_patch_template.csv`

## 2) Isi template

Isi kolom:

- `text` (wajib)
- `pericope` (opsional)

Jangan ubah `book_name/chapter/verse` kecuali memang ingin patch ayat lain.

## 3) Cek simulasi (tanpa menulis ke DB)

```bash
node scripts/patch_tb1_placeholders.mjs \
  --input docs/import/tb1_placeholder_patch_template.csv \
  --dry-run \
  --report docs/import/tb1_placeholder_patch_dry_run_report.json
```

## 4) Apply ke DB

```bash
npm run bible:tb1:placeholder-patch -- \
  --input docs/import/tb1_placeholder_patch_template.csv \
  --report docs/import/tb1_placeholder_patch_apply_report.json
```

Default safety:

- hanya update ayat yang masih placeholder.
- ayat non-placeholder akan di-skip.

Jika ingin izinkan overwrite ayat non-placeholder:

```bash
npm run bible:tb1:placeholder-patch -- \
  --input docs/import/tb1_placeholder_patch_template.csv \
  --allow-non-placeholder
```

## 5) File audit yang tersedia

- `docs/import/tb1_placeholder_patch_dry_run_report.json`
- `docs/import/tb1_placeholder_patch_apply_report.json`
- `docs/import/tb1_placeholder_manual_context.json`
- `docs/import/tb1_gap_remaining_report.json`
- `docs/import/tb1_gap_strict_missing_flat.csv`
