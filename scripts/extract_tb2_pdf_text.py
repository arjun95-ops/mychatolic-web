#!/usr/bin/env python3
"""
Extract TB2 verses/pericopes from PDF into structured JSON.

This extractor is optimized for:
https://pusaka.kemenag.go.id/kitab/kitab_umat_katolik.pdf
"""

from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import fitz

HEADER_TOP_MAX = 40.0
BODY_TOP_MIN = 24.0
BODY_BOTTOM_MAX = 512.0

BOOK_HEADER_PATTERNS: List[Tuple[re.Pattern[str], str]] = [
    (re.compile(r"\bKEJADIAN\b"), "Kejadian"),
    (re.compile(r"\bKELUARAN\b"), "Keluaran"),
    (re.compile(r"\bIMAMAT\b"), "Imamat"),
    (re.compile(r"\bBILANGAN\b"), "Bilangan"),
    (re.compile(r"\bULANGAN\b"), "Ulangan"),
    (re.compile(r"\bYOSUA\b"), "Yosua"),
    (re.compile(r"\bHAKIM[\s-]*HAKIM\b"), "Hakim-hakim"),
    (re.compile(r"\bRUT\b"), "Rut"),
    (re.compile(r"\b1\s+SAMUEL\b"), "1 Samuel"),
    (re.compile(r"\b2\s+SAMUEL\b"), "2 Samuel"),
    (re.compile(r"\b1\s+RAJA[\s-]*RAJA\b"), "1 Raja-raja"),
    (re.compile(r"\b2\s+RAJA[\s-]*RAJA\b"), "2 Raja-raja"),
    (re.compile(r"\b1\s+TAWARIKH\b"), "1 Tawarikh"),
    (re.compile(r"\b2\s+TAWARIKH\b"), "2 Tawarikh"),
    (re.compile(r"\bEZRA\b"), "Ezra"),
    (re.compile(r"\bNEHEMIA\b"), "Nehemia"),
    (re.compile(r"\bESTER\b"), "Ester"),
    (re.compile(r"\bAYUB\b"), "Ayub"),
    (re.compile(r"\bMAZMUR\b"), "Mazmur"),
    (re.compile(r"\bAMSAL\b"), "Amsal"),
    (re.compile(r"\bPENGKHOTBAH\b"), "Pengkhotbah"),
    (re.compile(r"\bKIDUNG\b"), "Kidung Agung"),
    (re.compile(r"\bYESAYA\b"), "Yesaya"),
    (re.compile(r"\bYEREMIA\b"), "Yeremia"),
    (re.compile(r"\bRATAPAN\b"), "Ratapan"),
    (re.compile(r"\bYEHEZKIEL\b"), "Yehezkiel"),
    (re.compile(r"\bTAMB\.\s*DANIEL\b"), "Tambahan Daniel"),
    (re.compile(r"\bDANIEL\b"), "Daniel"),
    (re.compile(r"\bHOSEA\b"), "Hosea"),
    (re.compile(r"\bYOE?L\b"), "Yoel"),
    (re.compile(r"\bAMOS\b"), "Amos"),
    (re.compile(r"\bOBAJA\b"), "Obaja"),
    (re.compile(r"\bYUNUS\b"), "Yunus"),
    (re.compile(r"\bMIKHA\b"), "Mikha"),
    (re.compile(r"\bNAHUM\b"), "Nahum"),
    (re.compile(r"\bHABAKUK\b"), "Habakuk"),
    (re.compile(r"\bZEFANYA\b"), "Zefanya"),
    (re.compile(r"\bHAGAI\b"), "Hagai"),
    (re.compile(r"\bZAKHARIA\b"), "Zakharia"),
    (re.compile(r"\bMALEAKHI\b"), "Maleakhi"),
    (re.compile(r"\bTOBIT\b"), "Tobit"),
    (re.compile(r"\bYUDIT\b"), "Yudit"),
    (re.compile(r"\bKEB\.\s*SALOMO\b"), "Kebijaksanaan Salomo"),
    (re.compile(r"\bSIRAKH\b"), "Sirakh"),
    (re.compile(r"\bBARUKH\b"), "Barukh"),
    (re.compile(r"\b1\s+MAKABE\b"), "1 Makabe"),
    (re.compile(r"\b2\s+MAKABE\b"), "2 Makabe"),
    (re.compile(r"\bMATIUS\b"), "Matius"),
    (re.compile(r"\bMARKUS\b"), "Markus"),
    (re.compile(r"\bLUKAS\b"), "Lukas"),
    (re.compile(r"\b1\s*YOHANES\b"), "1 Yohanes"),
    (re.compile(r"\b2\s*YOHANES\b"), "2 Yohanes"),
    (re.compile(r"\b3\s*YOHANES\b"), "3 Yohanes"),
    (re.compile(r"\bYOHANES\b.*\bKETIGA\b"), "3 Yohanes"),
    (re.compile(r"\bYOHANES\b"), "Yohanes"),
    (re.compile(r"\bKISAH\b"), "Kisah Para Rasul"),
    (re.compile(r"\bROMA\b"), "Roma"),
    (re.compile(r"\b1\s+KORINTUS\b"), "1 Korintus"),
    (re.compile(r"\b2\s+KORINTUS\b"), "2 Korintus"),
    (re.compile(r"\bGALATIA\b"), "Galatia"),
    (re.compile(r"\bEFESUS\b"), "Efesus"),
    (re.compile(r"\bFILIPI\b"), "Filipi"),
    (re.compile(r"\bKOLOSE\b"), "Kolose"),
    (re.compile(r"\b1\s+TESALONIKA\b"), "1 Tesalonika"),
    (re.compile(r"\b2\s+TESALONIKA\b"), "2 Tesalonika"),
    (re.compile(r"\b1\s+TIMOTIUS\b"), "1 Timotius"),
    (re.compile(r"\b2\s+TIMOTIUS\b"), "2 Timotius"),
    (re.compile(r"\bTITUS\b"), "Titus"),
    (re.compile(r"\bFILEMON\b"), "Filemon"),
    (re.compile(r"\bIBRANI\b"), "Ibrani"),
    (re.compile(r"\bYAKOBUS\b"), "Yakobus"),
    (re.compile(r"\b1\s+PETRUS\b"), "1 Petrus"),
    (re.compile(r"\b2\s+PETRUS\b"), "2 Petrus"),
    (re.compile(r"\bYUDAS\b"), "Yudas"),
    (re.compile(r"\bWAHYU\b"), "Wahyu"),
]


@dataclass
class Span:
    text: str
    x0: float
    y0: float
    size: float
    font: str


@dataclass
class BookState:
    chapter: int = 1
    last_verse: int = 0
    started: bool = False
    last_was_chapter_marker: bool = False


def normalize_header(text: str) -> str:
    text = text.upper().replace("\u00a0", " ").replace(" ", " ").replace("Ë", "E")
    text = re.sub(r"\s+", " ", text).strip()
    return text


def detect_book(header_text: str) -> Optional[str]:
    normalized = normalize_header(header_text)
    if not normalized:
        return None
    for pattern, book in BOOK_HEADER_PATTERNS:
        if pattern.search(normalized):
            return book
    return None


def clean_token(text: str) -> str:
    text = text.replace("\u00a0", " ").replace(" ", " ")
    text = text.replace("”", '"').replace("“", '"').replace("’", "'").replace("‘", "'")
    text = text.replace("—", "-").replace("–", "-")
    text = re.sub(r"\s+", " ", text).strip()
    return text


def is_bold(span: Span) -> bool:
    return "bold" in span.font.lower()


def is_verse_marker(span: Span) -> bool:
    return span.text.isdigit() and is_bold(span) and span.size <= 6.2


def is_chapter_marker(span: Span) -> bool:
    return span.text.isdigit() and is_bold(span) and span.size >= 14.0


def is_heading_line(spans: List[Span]) -> bool:
    if not spans:
        return False
    if any(is_verse_marker(s) for s in spans):
        return False
    alpha = [s for s in spans if re.search(r"[A-Za-z]", s.text)]
    if len(alpha) < 2:
        return False
    bold_alpha = [s for s in alpha if is_bold(s) and 6.8 <= s.size <= 8.4]
    return len(bold_alpha) >= 2 and len(bold_alpha) / len(alpha) >= 0.75


def tokens_to_text(tokens: List[str]) -> str:
    out: List[str] = []
    join_next = False
    for raw in tokens:
        token = clean_token(raw)
        if not token:
            continue

        if token.endswith("-") and len(token) > 1:
            token = token[:-1]
            if token:
                if join_next and out:
                    out[-1] = out[-1] + token
                else:
                    out.append(token)
            join_next = True
            continue

        if join_next and out:
            out[-1] = out[-1] + token
            join_next = False
            continue

        out.append(token)

    text = " ".join(out)
    text = re.sub(r"\s+([,.;:!?])", r"\1", text)
    text = re.sub(r"\(\s+", "(", text)
    text = re.sub(r"\s+\)", ")", text)
    text = re.sub(r"\s{2,}", " ", text).strip()
    return text


def ensure_entry(store: dict, book: str, chapter: int, verse: int) -> dict:
    if book not in store:
        store[book] = {}
    c = str(chapter)
    v = str(verse)
    if c not in store[book]:
        store[book][c] = {}
    if v not in store[book][c]:
        store[book][c][v] = {"tokens": [], "pericope": None}
    return store[book][c][v]


def extract_page_spans(page: fitz.Page) -> List[Span]:
    data = page.get_text("dict")
    spans: List[Span] = []
    for block in data.get("blocks", []):
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            for s in line.get("spans", []):
                text = clean_token(str(s.get("text", "")))
                if not text:
                    continue
                x0, y0, _, _ = s.get("bbox", [0, 0, 0, 0])
                spans.append(
                    Span(
                        text=text,
                        x0=float(x0),
                        y0=float(y0),
                        size=float(s.get("size") or 0.0),
                        font=str(s.get("font") or ""),
                    )
                )
    return spans


def is_footer_reference(span: Span) -> bool:
    if span.y0 < 495.0:
        return False
    if span.size > 6.3:
        return False
    text = span.text
    if text.isdigit():
        return False
    if ":" in text:
        return True
    if re.search(r"[A-Za-z]", text):
        return True
    return False


def group_by_lines(spans: List[Span], tolerance: float = 1.5) -> List[List[Span]]:
    if not spans:
        return []
    spans = sorted(spans, key=lambda s: (s.y0, s.x0))
    lines: List[List[Span]] = []
    line_tops: List[float] = []
    for s in spans:
        found = -1
        for i, top in enumerate(line_tops):
            if abs(s.y0 - top) <= tolerance:
                found = i
                break
        if found == -1:
            lines.append([s])
            line_tops.append(s.y0)
        else:
            lines[found].append(s)
            line_tops[found] = (line_tops[found] + s.y0) / 2.0
    for line in lines:
        line.sort(key=lambda s: s.x0)
    return lines


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract TB2 verses/pericopes from PDF.")
    parser.add_argument("--pdf", required=True, help="Path to TB2 PDF.")
    parser.add_argument("--meta", required=True, help="Path to tb2 meta JSON.")
    parser.add_argument("--out", default="tmp/tb2_pdf_extract.json", help="Output JSON path.")
    parser.add_argument("--report", default="docs/import/tb2_pdf_extract_report.json", help="Report JSON path.")
    parser.add_argument("--only-book", default="", help="Parse only one book name (exact).")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    pdf_path = Path(args.pdf)
    meta_path = Path(args.meta)
    out_path = Path(args.out)
    report_path = Path(args.report)
    only_book = args.only_book.strip()

    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    expected: Dict[str, Dict[int, int]] = {}
    for book in meta:
        name = str(book.get("name", "")).strip()
        cmap: Dict[int, int] = {}
        for ch in book.get("chapters", []):
            cnum = int(ch.get("chapter_number", 0))
            vmax = int(ch.get("max_verse", 0))
            if cnum > 0:
                cmap[cnum] = vmax
        expected[name] = cmap

    states: Dict[str, BookState] = {book: BookState() for book in expected}
    store: dict = {}
    warnings: List[str] = []
    pages_by_book: Dict[str, set[int]] = defaultdict(set)

    current_book: Optional[str] = None
    pending_heading_by_book: Dict[str, List[str]] = defaultdict(list)

    doc = fitz.open(str(pdf_path))
    total_pages = len(doc)

    for page_index in range(total_pages):
        page = doc[page_index]
        spans = extract_page_spans(page)
        if not spans:
            continue

        top_spans = [s for s in spans if s.y0 < HEADER_TOP_MAX]
        top_spans.sort(key=lambda s: (s.y0, s.x0))
        header_text = " ".join(s.text for s in top_spans[:16])
        body_spans = [s for s in spans if BODY_TOP_MIN <= s.y0 <= BODY_BOTTOM_MAX and not is_footer_reference(s)]
        if not body_spans:
            continue

        header_book = detect_book(header_text)
        if not header_book and "SURAT" in normalize_header(header_text):
            near_top = sorted([s for s in spans if s.y0 < 140.0], key=lambda s: (s.y0, s.x0))
            near_top_text = " ".join(s.text for s in near_top[:80])
            header_book = detect_book(near_top_text)
        if header_book not in expected:
            header_book = None

        transition_book: Optional[str] = None
        transition_y: Optional[float] = None

        if current_book is None and header_book:
            current_book = header_book
        elif current_book and header_book and header_book != current_book:
            chapter1_markers = [
                s.y0 for s in body_spans if is_chapter_marker(s) and s.text == "1"
            ]
            if chapter1_markers:
                transition_book = header_book
                transition_y = min(chapter1_markers)
            else:
                verse1_markers = [
                    s.y0 for s in body_spans if is_verse_marker(s) and s.text == "1"
                ]
                if verse1_markers:
                    transition_book = header_book
                    transition_y = min(verse1_markers)
                else:
                    current_book = header_book

        if not current_book:
            continue

        mid = page.rect.width / 2.0
        split_x = mid - 4.0
        cols = [
            [s for s in body_spans if s.x0 < split_x],
            [s for s in body_spans if s.x0 >= split_x],
        ]

        for col in cols:
            for line in group_by_lines(col):
                if not line:
                    continue

                line_y = min(s.y0 for s in line)
                line_book = current_book
                if transition_book and transition_y is not None and line_y >= transition_y:
                    line_book = transition_book
                if only_book and line_book != only_book:
                    continue
                pages_by_book[line_book].add(page_index + 1)

                if is_heading_line(line):
                    h = tokens_to_text([s.text for s in line])
                    if h:
                        pending_heading_by_book[line_book].append(h)
                    continue

                state = states[line_book]
                for span in line:
                    if is_chapter_marker(span):
                        chapter_num = int(span.text)
                        chapter_map = expected.get(line_book, {})
                        if chapter_num in chapter_map:
                            state.chapter = chapter_num
                            state.started = True
                            state.last_verse = 0
                            state.last_was_chapter_marker = True
                        continue

                    if is_verse_marker(span):
                        verse_num = int(span.text)
                        chapter_map = expected.get(line_book, {})

                        if (
                            verse_num == 1
                            and state.started
                            and state.last_verse > 0
                            and not state.last_was_chapter_marker
                        ):
                            state.chapter += 1
                            state.last_verse = 0

                        state.started = True
                        state.last_verse = verse_num
                        state.last_was_chapter_marker = False

                        if state.chapter not in chapter_map:
                            warnings.append(
                                f"{line_book}: chapter overflow page={page_index + 1} marker={verse_num}"
                            )
                            continue
                        if verse_num < 1:
                            continue
                        if verse_num > chapter_map[state.chapter]:
                            warnings.append(
                                f"{line_book} {state.chapter}:{verse_num} > max {chapter_map[state.chapter]} page={page_index + 1}"
                            )
                            continue

                        entry = ensure_entry(store, line_book, state.chapter, verse_num)
                        if pending_heading_by_book[line_book]:
                            heading = re.sub(r"\s{2,}", " ", " ".join(pending_heading_by_book[line_book])).strip()
                            if heading:
                                entry["pericope"] = heading
                            pending_heading_by_book[line_book] = []
                        continue

                    if not state.started:
                        continue
                    chapter_map = expected.get(line_book, {})
                    if state.chapter not in chapter_map:
                        continue

                    if state.last_verse == 0:
                        state.last_verse = 1
                        state.last_was_chapter_marker = False
                        entry = ensure_entry(store, line_book, state.chapter, state.last_verse)
                        if pending_heading_by_book[line_book]:
                            heading = re.sub(r"\s{2,}", " ", " ".join(pending_heading_by_book[line_book])).strip()
                            if heading:
                                entry["pericope"] = heading
                            pending_heading_by_book[line_book] = []
                        entry["tokens"].append(span.text)
                        continue

                    if state.last_verse > chapter_map[state.chapter]:
                        continue

                    entry = ensure_entry(store, line_book, state.chapter, state.last_verse)
                    entry["tokens"].append(span.text)

        if transition_book:
            current_book = transition_book

        if (page_index + 1) % 100 == 0:
            print(f"Processed pages: {page_index + 1}/{total_pages}")

    doc.close()

    # finalize
    books_out: dict = {}
    total_verses_extracted = 0
    total_pericopes_extracted = 0

    for book_name, chapters in store.items():
        books_out[book_name] = {}
        for chapter_key, verses in chapters.items():
            books_out[book_name][chapter_key] = {}
            for verse_key, payload in verses.items():
                text = tokens_to_text(payload.get("tokens", []))
                pericope = payload.get("pericope")
                books_out[book_name][chapter_key][verse_key] = {
                    "text": text,
                    "pericope": pericope,
                }
                if text:
                    total_verses_extracted += 1
                if pericope:
                    total_pericopes_extracted += 1

    expected_verses_total = 0
    expected_per_book: Dict[str, int] = {}
    extracted_per_book: Dict[str, int] = {}
    missing_samples: List[dict] = []

    for book_name, chapter_map in expected.items():
        if only_book and book_name != only_book:
            continue
        total = sum(max(0, int(v)) for v in chapter_map.values())
        expected_verses_total += total
        expected_per_book[book_name] = total

        extracted = 0
        for chapter_num, max_verse in chapter_map.items():
            for verse_num in range(1, max_verse + 1):
                text = (
                    books_out.get(book_name, {})
                    .get(str(chapter_num), {})
                    .get(str(verse_num), {})
                    .get("text", "")
                )
                if text:
                    extracted += 1
                elif len(missing_samples) < 300:
                    missing_samples.append({"book": book_name, "chapter": chapter_num, "verse": verse_num})
        extracted_per_book[book_name] = extracted

    out_payload = {"books": books_out}
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(out_payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    order_lookup = {str(row.get("name")): int(row.get("order_index", 9999)) for row in meta}

    report = {
        "pdf": str(pdf_path),
        "only_book": only_book or None,
        "summary": {
            "books_detected": len(books_out),
            "expected_verses_total": expected_verses_total,
            "extracted_verses_with_text": total_verses_extracted,
            "missing_verses_estimate": max(0, expected_verses_total - total_verses_extracted),
            "extracted_pericopes": total_pericopes_extracted,
        },
        "per_book": {
            book: {
                "expected_verses": expected_per_book.get(book, 0),
                "extracted_verses": extracted_per_book.get(book, 0),
                "pages_seen": sorted(pages_by_book.get(book, set())),
            }
            for book in sorted(expected_per_book.keys(), key=lambda b: order_lookup.get(b, 9999))
        },
        "warnings_sample": warnings[:800],
        "missing_samples": missing_samples,
    }

    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print("Extraction done.")
    print(json.dumps(report["summary"], ensure_ascii=False, indent=2))
    print(f"Output: {out_path}")
    print(f"Report: {report_path}")


if __name__ == "__main__":
    main()
