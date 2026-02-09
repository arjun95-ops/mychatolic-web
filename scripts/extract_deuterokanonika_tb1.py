#!/usr/bin/env python3
"""
Extract Deuterocanonical content from:
  Alkitab_Deuterokanonika_TB1_Katolik.pdf

Output format is compatible with admin Bible import:
  book_name, grouping, order_index, chapter, verse, text, pericope

Notes:
- This parser uses text-layer extraction (not OCR).
- Some words may look split because of source PDF typography.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

from pypdf import PdfReader


@dataclass(frozen=True)
class Segment:
    book_name: str
    grouping: str
    order_index: int
    start_page: int
    end_page: int


SEGMENTS: List[Segment] = [
    Segment("Tobit", "deutero", 17, 985, 997),
    Segment("Yudit", "deutero", 18, 998, 1013),
    Segment("Kebijaksanaan Salomo", "deutero", 27, 1019, 1040),
    Segment("Sirakh", "deutero", 28, 1042, 1098),
    Segment("Barukh", "deutero", 32, 1100, 1108),
    Segment("Tambahan Daniel", "deutero", 34, 1108, 1114),
    Segment("1 Makabe", "deutero", 20, 1115, 1149),
    Segment("2 Makabe", "deutero", 21, 1150, 1174),
]


VERSE_MARKER_RE = re.compile(r"(?<![:\d])(\d{1,3})\s*[\u2009\u00A0\u202F ]")
FOOTNOTE_REF_RE = re.compile(r"\b\d{1,3}:\d{1,3}\b")
CHAPTER_ONLY_RE = re.compile(r"^(\d{1,3})$")
CHAPTER_RANGE_RE = re.compile(r"^(\d{1,3})\s*:\s*(\d{1,3})\s*[-–]\s*(\d{1,3})$")


def clean_line(raw: str) -> str:
    line = (
        raw.replace("\r", "")
        .replace("\u00a0", " ")
        .replace("\u2009", " ")
        .replace("\u202f", " ")
        .replace("ﬁ", "fi")
        .replace("ﬂ", "fl")
        .strip()
    )
    return re.sub(r"\s+", " ", line)


def should_skip_line(line: str) -> bool:
    if not line:
        return True
    if "Halaman" in line and ".indd" in line:
        return True
    if line in {"DEUTEROKANONIKA", "PERJANJIAN BARU"}:
        return True
    if len(FOOTNOTE_REF_RE.findall(line)) >= 2:
        return True
    return False


def looks_like_heading(line: str, has_buffer: bool) -> bool:
    if re.search(r"\d", line):
        return False
    if len(line) <= 70 and line == line.title() and line.count(" ") <= 8:
        return not has_buffer
    return False


def extract_rows(reader: PdfReader, segment: Segment) -> List[Dict[str, object]]:
    rows: List[Dict[str, object]] = []
    chapter: Optional[int] = None
    verse: Optional[int] = None
    buffer = ""
    started = segment.book_name != "Tambahan Daniel"
    stop_segment = False

    def commit(page_no: int) -> None:
        nonlocal buffer
        text = buffer.strip(" -")
        if chapter is None or verse is None or not text:
            buffer = ""
            return
        rows.append(
            {
                "book_name": segment.book_name,
                "grouping": segment.grouping,
                "order_index": segment.order_index,
                "chapter": chapter,
                "verse": verse,
                "text": text,
                "pericope": "",
                "_page": page_no,
            }
        )
        buffer = ""

    for page_no in range(segment.start_page, segment.end_page + 1):
        if stop_segment:
            break

        text = reader.pages[page_no - 1].extract_text() or ""
        lines = [clean_line(line) for line in text.split("\n")]
        lines = [line for line in lines if line]

        for line in lines:
            if should_skip_line(line):
                continue

            if segment.book_name == "Barukh" and line.startswith("DOA AZARYA"):
                stop_segment = True
                break

            if segment.book_name == "Tambahan Daniel" and not started:
                if line.startswith("DOA AZARYA") or CHAPTER_RANGE_RE.match(line):
                    started = True
                else:
                    continue

            chapter_range_match = CHAPTER_RANGE_RE.match(line)
            if chapter_range_match and segment.book_name == "Tambahan Daniel":
                commit(page_no)
                chapter = int(chapter_range_match.group(1))
                verse = int(chapter_range_match.group(2))
                buffer = ""
                continue

            chapter_only_match = CHAPTER_ONLY_RE.match(line)
            if chapter_only_match:
                ch = int(chapter_only_match.group(1))
                if 1 <= ch <= 200:
                    should_start_new_chapter = (
                        chapter is None
                        or ch == chapter + 1
                        or ch == 1
                        or (segment.book_name == "Tambahan Daniel" and ch in (13, 14))
                    )
                    if should_start_new_chapter:
                        commit(page_no)
                        chapter = ch
                        verse = 1
                        buffer = ""
                        continue

            if looks_like_heading(line, bool(buffer)):
                continue

            if chapter is None:
                continue
            if verse is None:
                verse = 1

            matches = list(VERSE_MARKER_RE.finditer(line))
            if not matches:
                buffer = f"{buffer} {line}".strip() if buffer else line
                continue

            prefix = line[: matches[0].start()].strip()
            if prefix:
                buffer = f"{buffer} {prefix}".strip() if buffer else prefix
            commit(page_no)

            for idx, marker in enumerate(matches):
                current_verse = int(marker.group(1))
                next_start = matches[idx + 1].start() if idx + 1 < len(matches) else len(line)
                segment_text = line[marker.end() : next_start].strip()
                verse = current_verse
                buffer = segment_text
                if idx + 1 < len(matches):
                    commit(page_no)

    commit(segment.end_page)
    return rows


def filter_rows(rows: Iterable[Dict[str, object]]) -> List[Dict[str, object]]:
    filtered: List[Dict[str, object]] = []

    for row in rows:
        book_name = str(row["book_name"])
        chapter = int(row["chapter"])
        verse = int(row["verse"])
        page = int(row["_page"])

        if book_name == "Tambahan Daniel":
            if chapter == 3:
                # Chapter 3 spans page breaks; keep true range only.
                keep = (page <= 1110 and verse >= 24) or (page == 1111 and verse >= 87)
                if not keep:
                    continue
            elif chapter == 13:
                if page < 1111 or page > 1113:
                    continue
            elif chapter == 14:
                if page < 1113:
                    continue
            else:
                continue

        if book_name == "Barukh":
            if chapter < 1 or chapter > 6:
                continue
            if chapter == 6 and (verse < 1 or verse > 72):
                continue

        filtered.append(row)

    return filtered


def dedupe_keep_longest(rows: Iterable[Dict[str, object]]) -> List[Dict[str, object]]:
    best: Dict[Tuple[str, int, int], Dict[str, object]] = {}
    for row in rows:
        key = (str(row["book_name"]), int(row["chapter"]), int(row["verse"]))
        previous = best.get(key)
        if previous is None or len(str(row["text"])) > len(str(previous["text"])):
            best[key] = row

    segment_order = {segment.book_name: index for index, segment in enumerate(SEGMENTS)}
    result = sorted(
        best.values(),
        key=lambda row: (
            segment_order[str(row["book_name"])],
            int(row["chapter"]),
            int(row["verse"]),
        ),
    )
    return result


def summarize(rows: Iterable[Dict[str, object]]) -> Dict[str, object]:
    per_book: Dict[str, Dict[str, object]] = defaultdict(
        lambda: {
            "rows": 0,
            "chapters": set(),
            "verse_min_by_chapter": {},
            "verse_max_by_chapter": {},
        }
    )

    for row in rows:
        book = str(row["book_name"])
        chapter = int(row["chapter"])
        verse = int(row["verse"])
        entry = per_book[book]
        entry["rows"] = int(entry["rows"]) + 1
        chapter_set = entry["chapters"]
        assert isinstance(chapter_set, set)
        chapter_set.add(chapter)

        min_map = entry["verse_min_by_chapter"]
        max_map = entry["verse_max_by_chapter"]
        assert isinstance(min_map, dict) and isinstance(max_map, dict)
        min_map[chapter] = min(verse, int(min_map.get(chapter, verse)))
        max_map[chapter] = max(verse, int(max_map.get(chapter, verse)))

    ordered_books = [segment.book_name for segment in SEGMENTS]
    books_summary: Dict[str, object] = {}
    for book_name in ordered_books:
        if book_name not in per_book:
            books_summary[book_name] = {
                "rows": 0,
                "chapter_count": 0,
                "chapter_min": None,
                "chapter_max": None,
                "verse_ranges": {},
            }
            continue

        entry = per_book[book_name]
        chapter_set = sorted(int(value) for value in entry["chapters"])  # type: ignore[index]
        min_map = entry["verse_min_by_chapter"]  # type: ignore[index]
        max_map = entry["verse_max_by_chapter"]  # type: ignore[index]

        verse_ranges = {
            str(chapter): {"min": int(min_map[chapter]), "max": int(max_map[chapter])}
            for chapter in chapter_set
        }
        books_summary[book_name] = {
            "rows": int(entry["rows"]),
            "chapter_count": len(chapter_set),
            "chapter_min": chapter_set[0] if chapter_set else None,
            "chapter_max": chapter_set[-1] if chapter_set else None,
            "verse_ranges": verse_ranges,
        }

    total_rows = sum(int(per_book[book]["rows"]) for book in per_book)
    return {"total_rows": total_rows, "books": books_summary}


def write_csv(rows: List[Dict[str, object]], output_csv: Path) -> None:
    output_csv.parent.mkdir(parents=True, exist_ok=True)
    field_names = ["book_name", "grouping", "order_index", "chapter", "verse", "text", "pericope"]
    with output_csv.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=field_names)
        writer.writeheader()
        for row in rows:
            writer.writerow({field: row[field] for field in field_names})


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract Deuterocanonical verses from TB1 PDF.")
    parser.add_argument("input_pdf", type=Path, help="Path to source PDF.")
    parser.add_argument("output_csv", type=Path, help="Path to output CSV.")
    parser.add_argument(
        "--summary-json",
        type=Path,
        default=None,
        help="Optional path to write extraction summary JSON.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    reader = PdfReader(str(args.input_pdf))

    raw_rows: List[Dict[str, object]] = []
    for segment in SEGMENTS:
        raw_rows.extend(extract_rows(reader, segment))

    filtered_rows = filter_rows(raw_rows)
    final_rows = dedupe_keep_longest(filtered_rows)

    write_csv(final_rows, args.output_csv)
    summary = summarize(final_rows)

    if args.summary_json is not None:
        args.summary_json.parent.mkdir(parents=True, exist_ok=True)
        args.summary_json.write_text(
            json.dumps(summary, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    print(json.dumps(summary, ensure_ascii=False, indent=2))
    print(f"CSV written: {args.output_csv}")
    if args.summary_json is not None:
        print(f"Summary written: {args.summary_json}")


if __name__ == "__main__":
    main()
