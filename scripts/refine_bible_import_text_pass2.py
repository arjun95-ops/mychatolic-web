#!/usr/bin/env python3
"""
Pass-2 refinement for Bible import CSV that has already gone through base cleaning.

This pass is intentionally conservative:
- merge only high-confidence split n-grams from a whitelist,
- remove noisy inline page headers (book titles),
- normalize repeated glued forms like "orangorang" -> "orang-orang".
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from collections import Counter
from pathlib import Path
from typing import Dict, List, Tuple

from wordfreq import zipf_frequency


WORD_RE = re.compile(r"[A-Za-zÀ-ÖØ-öø-ÿ]+")
TOKEN_RE = re.compile(r"[A-Za-zÀ-ÖØ-öø-ÿ]+|[^A-Za-zÀ-ÖØ-öø-ÿ]+")
SHORT_RUN_RE = re.compile(r"(?:\b[\wÀ-ÿ]{1,3}\b\s+){2,}\b[\wÀ-ÿ]{1,3}\b")

HEADER_WORDS = {
  "TOBIT",
  "YUDIT",
  "SIRAKH",
  "BARUKH",
  "MAKABE",
  "DANIEL",
  "DEUTEROKANONIKA",
}

STATIC_WORD_FIXES = {
  "orangorang": "orang-orang",
  "anakanak": "anak-anak",
  "tengahtengah": "tengah-tengah",
  "segalagalanya": "segala-galanya",
  "selamalamanya": "selama-lamanya",
  "harihari": "hari-hari",
}

STATIC_PHRASE_FIXES = [
  (re.compile(r"\bke\s+pada\s+ku\b", re.IGNORECASE), "kepadaku"),
  (re.compile(r"\bke\s+pada\s+mu\b", re.IGNORECASE), "kepadamu"),
  (re.compile(r"\bke\s+pada\s+nya\b", re.IGNORECASE), "kepadanya"),
  (re.compile(r"\bkepada\s+ku\b", re.IGNORECASE), "kepadaku"),
  (re.compile(r"\bkepada\s+mu\b", re.IGNORECASE), "kepadamu"),
  (re.compile(r"\bkepada\s+nya\b", re.IGNORECASE), "kepadanya"),
  (re.compile(r"\bber\s+kata\s+lah\b", re.IGNORECASE), "berkatalah"),
  (re.compile(r"\bdi\s+saji\s+kan\b", re.IGNORECASE), "disajikan"),
  (re.compile(r"\bdi\s+serah\s+kan\b", re.IGNORECASE), "diserahkan"),
  (re.compile(r"\bdi\s+beri\s+kan\b", re.IGNORECASE), "diberikan"),
  (re.compile(r"\bdi\s+ucap\s+kan\b", re.IGNORECASE), "diucapkan"),
  (re.compile(r"\bpe\s+me\s+rin\s+tah\s+an\b", re.IGNORECASE), "pemerintahan"),
  (re.compile(r"\bse\s+sudah\s+nya\b", re.IGNORECASE), "sesudahnya"),
  (re.compile(r"\bme\s+laku\s+kan\b", re.IGNORECASE), "melakukan"),
  (re.compile(r"\bkemba\s+like\b", re.IGNORECASE), "kembali ke"),
  (re.compile(r"\bdi\s+rike\b", re.IGNORECASE), "diri ke"),
  (re.compile(r"\bse\s+mua\b", re.IGNORECASE), "semua"),
  (re.compile(r"\bse\s+bab\b", re.IGNORECASE), "sebab"),
  (re.compile(r"\bsen\s+diri\b", re.IGNORECASE), "sendiri"),
  (re.compile(r"\bdemi\s+kian\b", re.IGNORECASE), "demikian"),
  (re.compile(r"\bten\s+tara\b", re.IGNORECASE), "tentara"),
  (re.compile(r"\bber\s+sama\b", re.IGNORECASE), "bersama"),
  (re.compile(r"\boleh\s+nya\b", re.IGNORECASE), "olehnya"),
  (re.compile(r"\bkem\s+bali\b", re.IGNORECASE), "kembali"),
  (re.compile(r"\bdi\s+ri\b", re.IGNORECASE), "diri"),
  (re.compile(r"\bber\s+kata\b", re.IGNORECASE), "berkata"),
  (re.compile(r"\bmem\s+beri\b", re.IGNORECASE), "memberi"),
  (re.compile(r"\bter\s+jadi\b", re.IGNORECASE), "terjadi"),
  (re.compile(r"\bberi\s+kan\b", re.IGNORECASE), "berikan"),
  (re.compile(r"\bke\s+dua\b", re.IGNORECASE), "kedua"),
  (re.compile(r"\bben\s+teng\b", re.IGNORECASE), "benteng"),
  (re.compile(r"\bmo\s+yang\b", re.IGNORECASE), "moyang"),
  (re.compile(r"\bpang\s+lima\b", re.IGNORECASE), "panglima"),
  (re.compile(r"\btuan\s+ku\b", re.IGNORECASE), "tuanku"),
  (re.compile(r"\bbaik\s+lah\b", re.IGNORECASE), "baiklah"),
  (re.compile(r"\banak\s+nya\b", re.IGNORECASE), "anaknya"),
  (re.compile(r"\bber\s+kuda\b", re.IGNORECASE), "berkuda"),
  (re.compile(r"\bkata\s+nya\b", re.IGNORECASE), "katanya"),
  (re.compile(r"\blaku\s+kan\b", re.IGNORECASE), "lakukan"),
  (re.compile(r"\bberi\s+tahu\b", re.IGNORECASE), "beritahu"),
  (re.compile(r"\bdi\s+beri\b", re.IGNORECASE), "diberi"),
  (re.compile(r"\bper\s+buat\b", re.IGNORECASE), "perbuat"),
  (re.compile(r"\blama\s+nya\b", re.IGNORECASE), "lamanya"),
  (re.compile(r"\bkira\s+nya\b", re.IGNORECASE), "kiranya"),
  (re.compile(r"\bbina\s+tang\b", re.IGNORECASE), "binatang"),
  (re.compile(r"\banak\s+ku\b", re.IGNORECASE), "anakku"),
  (re.compile(r"\bber\s+ikut\b", re.IGNORECASE), "berikut"),
  (re.compile(r"\bkata\s+kan\b", re.IGNORECASE), "katakan"),
  (re.compile(r"\bmem\s+bawa\b", re.IGNORECASE), "membawa"),
  (re.compile(r"\bse\s+orang\b", re.IGNORECASE), "seorang"),
  (re.compile(r"\bbi\s+cara\b", re.IGNORECASE), "bicara"),
  (re.compile(r"\bper\s+kara\b", re.IGNORECASE), "perkara"),
  (re.compile(r"\bmem\s+buat\b", re.IGNORECASE), "membuat"),
  (re.compile(r"\bber\s+dosa\b", re.IGNORECASE), "berdosa"),
  (re.compile(r"\bapa\s+bila\b", re.IGNORECASE), "apabila"),
  (re.compile(r"\bbiar\s+kan\b", re.IGNORECASE), "biarkan"),
  (re.compile(r"\bsuka\s+cita\b", re.IGNORECASE), "sukacita"),
  (re.compile(r"\bbang\s+kit\b", re.IGNORECASE), "bangkit"),
  (re.compile(r"\bbi\s+nasa\b", re.IGNORECASE), "binasa"),
  (re.compile(r"\bhati\s+nya\b", re.IGNORECASE), "hatinya"),
  (re.compile(r"\bmel?\s+lari\s+kan\b", re.IGNORECASE), "melarikan"),
  (re.compile(r"\bke\s+raja\s+an\b", re.IGNORECASE), "kerajaan"),
  (re.compile(r"\bmem\s+beri\s+kan\b", re.IGNORECASE), "memberikan"),
  (re.compile(r"\bme\s+lain\s+kan\b", re.IGNORECASE), "melainkan"),
  (re.compile(r"\bper\s+kata\s+an\b", re.IGNORECASE), "perkataan"),
  (re.compile(r"\bper\s+jan\s+jian\b", re.IGNORECASE), "perjanjian"),
  (re.compile(r"\bdi\s+laku\s+kan\b", re.IGNORECASE), "dilakukan"),
  (re.compile(r"\bmeme\s+rin\s+tah\b", re.IGNORECASE), "memerintah"),
  (re.compile(r"\bke\s+luar\s+lah\b", re.IGNORECASE), "keluarlah"),
  (re.compile(r"\bter\s+jadi\s+lah\b", re.IGNORECASE), "terjadilah"),
  (re.compile(r"\bke\s+jadi\s+an\b", re.IGNORECASE), "kejadian"),
  (re.compile(r"\bdi\s+kata\s+kan\b", re.IGNORECASE), "dikatakan"),
  (re.compile(r"\bper\s+buat\s+an\b", re.IGNORECASE), "perbuatan"),
  (re.compile(r"\bdi\s+pang\s+gil\b", re.IGNORECASE), "dipanggil"),
  (re.compile(r"\bber\s+bi\s+cara\b", re.IGNORECASE), "berbicara"),
  (re.compile(r"\bpepe\s+rang\s+an\b", re.IGNORECASE), "peperangan"),
  (re.compile(r"\bmem\s+biar\s+kan\b", re.IGNORECASE), "membiarkan"),
  (re.compile(r"\bmala\s+peta\s+ka\b", re.IGNORECASE), "malapetaka"),
  (re.compile(r"\bmeme\s+li\s+hara\b", re.IGNORECASE), "memelihara"),
  (re.compile(r"\bkem\s+bali\s+lah\b", re.IGNORECASE), "kembalilah"),
  (re.compile(r"\bme\s+raya\s+kan\b", re.IGNORECASE), "merayakan"),
  (re.compile(r"\bse\s+tiba\s+nya\b", re.IGNORECASE), "setibanya"),
  (re.compile(r"\bke\s+luar\s+ga\b", re.IGNORECASE), "keluarga"),
  (re.compile(r"\bke\s+tahu\s+an\b", re.IGNORECASE), "ketahuan"),
  (re.compile(r"\bku\s+beri\s+kan\b", re.IGNORECASE), "kuberikan"),
  (re.compile(r"\bdi\s+raya\s+kan\b", re.IGNORECASE), "dirayakan"),
  (re.compile(r"\bmeng\s+hor\s+mati\b", re.IGNORECASE), "menghormati"),
  (re.compile(r"\bme\s+man\s+dang\b", re.IGNORECASE), "memandang"),
]

# Curated safe merges in this corpus (high confidence only).
ALLOW_JOINED_WORDS = {
  "kepada",
  "tetapi",
  "menjadi",
  "pasukan",
  "yahudi",
  "negeri",
  "saudara",
  "berkata",
  "israel",
  "padanya",
  "seluruh",
  "setelah",
  "supaya",
  "ketika",
  "keluar",
  "bersama",
  "tentara",
  "hadapan",
  "sekali",
  "penduduk",
  "berikan",
  "mendengar",
  "melihat",
  "berapa",
  "isteri",
  "sekarang",
  "memberi",
  "terhadap",
  "terjadi",
  "lakukan",
  "seperti",
  "berangkat",
  "sebuah",
  "sahabat",
  "mengambil",
  "segenap",
  "dahulu",
  "sehingga",
  "baginda",
  "mendapat",
  "semuanya",
  "wilayah",
  "panglima",
  "berbuat",
  "kepala",
  "senjata",
  "sedangkan",
  "segera",
  "baiklah",
  "sesuatu",
  "selamat",
  "keliling",
  "perintah",
  "lainnya",
  "pakaian",
  "binatang",
  "percaya",
  "pemimpin",
  "serahkan",
  "disitu",
  "meninggal",
  "penguasa",
  "bicara",
  "perkara",
  "sedikit",
  "berhasil",
  "berani",
  "menuju",
  "malaikat",
  "manusia",
  "membuat",
  "menyerah",
  "berdiri",
  "biarkan",
  "membawa",
  "berdosa",
  "secara",
  "sesudah",
  "tinggalkan",
  "dengarkan",
  "kirimkan",
  "berbagai",
  "putera",
  "mempunyai",
  "menyerang",
  "sembunyi",
  "sesuai",
  "rayakan",
  "memuji",
  "menaruh",
  "disebut",
  "sebelum",
  "begitu",
  "menimpa",
  "firman",
  "kemudian",
  "demikian",
  "yerusalem",
  "kepadanya",
  "bagaimana",
  "berkatalah",
  "beberapa",
  "kerajaan",
  "perempuan",
  "daripada",
  "beritahu",
  "memberikan",
  "sekalian",
  "perkataan",
  "pertempuran",
  "perkemahan",
  "melainkan",
  "pegunungan",
  "sebaliknya",
  "keturunan",
  "diserahkan",
  "saudaranya",
  "menyerahkan",
  "sesuatunya",
  "ditempatkan",
  "diberikan",
  "sementara",
  "melakukan",
  "perjanjian",
  "meninggalkan",
  "dilakukan",
  "kepadaku",
  "ketakutan",
  "sukacita",
  "kekuasaan",
  "diantara",
  "keputusan",
  "lagipula",
  "mengirimkan",
  "dikirimkan",
  "kembalilah",
  "terjadilah",
  "perintahkan",
  "memerintah",
  "berangkatlah",
  "pasukannya",
  "kekuatan",
  "ditinggalkan",
  "sejahtera",
  "selanjutnya",
  "perbuatan",
  "kepalanya",
  "kejadian",
  "kejahatan",
  "berhadapan",
  "pekerjaan",
  "berbicara",
  "dikatakan",
  "perdamaian",
  "mendengarkan",
  "peperangan",
  "diterima",
  "sekeliling",
  "keluarga",
  "matahari",
  "menerima",
  "memuliakan",
  "kemenangan",
  "pemerintah",
  "peristiwa",
  "kemuliaan",
  "perjalanan",
  "merayakan",
  "kepentingan",
  "kebenaran",
  "dipercaya",
  "mengumpulkan",
  "kelihatan",
  "menjatuhkan",
  "persediaan",
  "penasehat",
  "bahwasanya",
  "karenanya",
  "tobit",
  "tobia",
  "naftali",
  "yerobeam",
  "salmaneser",
  "sanherib",
  "esarhadon",
  "gabael",
  "niniwe",
  "raguel",
  "rafael",
  "yehuda",
  "yudit",
  "sirakh",
  "barukh",
  "makabe",
  "demetrius",
  "timotius",
  "antiokhus",
  "epifanes",
}


def zipf(text: str) -> float:
  return max(zipf_frequency(text, "id"), zipf_frequency(text, "en"))


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(description="Pass-2 refine for cleaned Bible import CSV.")
  parser.add_argument("source_csv", type=Path, help="CSV used to learn split patterns (usually *_safe.csv).")
  parser.add_argument("input_csv", type=Path, help="CSV to refine (usually *_clean.csv).")
  parser.add_argument("output_csv", type=Path, help="Refined output CSV path.")
  parser.add_argument("--summary-json", type=Path, default=None, help="Optional summary JSON output path.")
  return parser.parse_args()


def read_rows(path: Path) -> List[Dict[str, str]]:
  with path.open("r", encoding="utf-8", newline="") as handle:
    return [dict(row) for row in csv.DictReader(handle)]


def write_rows(path: Path, rows: List[Dict[str, str]]) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)
  fields = ["book_name", "grouping", "order_index", "chapter", "verse", "text", "pericope"]
  with path.open("w", encoding="utf-8", newline="") as handle:
    writer = csv.DictWriter(handle, fieldnames=fields)
    writer.writeheader()
    for row in rows:
      writer.writerow({field: row.get(field, "") for field in fields})


def build_ngram_replacements(source_rows: List[Dict[str, str]]) -> Dict[Tuple[str, ...], str]:
  counters = {2: Counter(), 3: Counter(), 4: Counter()}
  for row in source_rows:
    words = [word.lower() for word in WORD_RE.findall(row.get("text", ""))]
    n = len(words)
    for size in (2, 3, 4):
      for i in range(n - size + 1):
        chunk = tuple(words[i : i + size])
        if all(len(token) <= 4 for token in chunk):
          counters[size][chunk] += 1

  replacements: Dict[Tuple[str, ...], str] = {}
  for size in (4, 3, 2):
    for chunk, count in counters[size].items():
      if count < 6:
        continue
      joined = "".join(chunk)
      if joined in ALLOW_JOINED_WORDS and zipf(joined) >= 2.2:
        replacements[chunk] = joined
  return replacements


def apply_phrase_replacements(text: str, replacements: Dict[Tuple[str, ...], str]) -> Tuple[str, int]:
  tokens = TOKEN_RE.findall(text)
  out: List[str] = []
  i = 0
  merges = 0

  while i < len(tokens):
    applied = False
    for size in (4, 3, 2):
      cursor = i
      words: List[str] = []
      ok = True
      for index in range(size):
        if cursor >= len(tokens) or not tokens[cursor].isalpha():
          ok = False
          break
        words.append(tokens[cursor].lower())
        cursor += 1
        if index < size - 1:
          if cursor >= len(tokens) or tokens[cursor] != " ":
            ok = False
            break
          cursor += 1
      if not ok:
        continue

      key = tuple(words)
      joined = replacements.get(key)
      if not joined:
        continue

      if tokens[i][:1].isupper():
        joined = joined[:1].upper() + joined[1:]
      out.append(joined)
      i = cursor
      merges += 1
      applied = True
      break

    if applied:
      continue

    out.append(tokens[i])
    i += 1

  return "".join(out), merges


def post_fix_text(text: str) -> Tuple[str, int]:
  fixed = text
  local_changes = 0

  for header in HEADER_WORDS:
    pattern = re.compile(rf"\b{header}\b")
    if pattern.search(fixed):
      fixed = pattern.sub("", fixed)
      local_changes += 1

  for source, target in STATIC_WORD_FIXES.items():
    pattern = re.compile(rf"\b{source}\b", re.IGNORECASE)
    if pattern.search(fixed):
      fixed = pattern.sub(target, fixed)
      local_changes += 1

  for pattern, target in STATIC_PHRASE_FIXES:
    if pattern.search(fixed):
      fixed = pattern.sub(target, fixed)
      local_changes += 1

  fixed = re.sub(r"\s+", " ", fixed).strip()
  return fixed, local_changes


def main() -> None:
  args = parse_args()

  source_rows = read_rows(args.source_csv)
  input_rows = read_rows(args.input_csv)
  replacements = build_ngram_replacements(source_rows)

  output_rows: List[Dict[str, str]] = []
  changed_rows = 0
  merge_count = 0
  post_fix_count = 0
  examples: List[Dict[str, str]] = []

  for row in input_rows:
    out = dict(row)
    original_text = (row.get("text") or "").strip()

    merged_text, merges = apply_phrase_replacements(original_text, replacements)
    fixed_text, fixes = post_fix_text(merged_text)

    if fixed_text != original_text:
      changed_rows += 1
      if len(examples) < 20:
        examples.append(
          {
            "book": row.get("book_name", ""),
            "chapter": row.get("chapter", ""),
            "verse": row.get("verse", ""),
            "before": original_text[:240],
            "after": fixed_text[:240],
          }
        )

    merge_count += merges
    post_fix_count += fixes
    out["text"] = fixed_text
    output_rows.append(out)

  write_rows(args.output_csv, output_rows)

  text_all = "\n".join((row.get("text") or "") for row in output_rows)
  summary = {
    "rows_total": len(output_rows),
    "rows_changed": changed_rows,
    "replacement_patterns": len(replacements),
    "phrase_merges_applied": merge_count,
    "post_fix_changes": post_fix_count,
    "short_run_count_after": len(SHORT_RUN_RE.findall(text_all)),
    "examples": examples,
    "output_csv": str(args.output_csv),
  }

  if args.summary_json is not None:
    args.summary_json.parent.mkdir(parents=True, exist_ok=True)
    args.summary_json.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

  print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
  main()
