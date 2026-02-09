#!/usr/bin/env python3
"""
Post-clean Bible import CSV extracted from PDF text layers.

Input/Output schema:
  book_name, grouping, order_index, chapter, verse, text, pericope

Modes:
- safe: punctuation/spacing/hyphenation cleanup only.
- aggressive: also tries to merge over-split syllables using word frequency.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

try:
    from wordfreq import zipf_frequency  # type: ignore
except Exception:
    zipf_frequency = None


LETTER_CLASS = r"A-Za-zÀ-ÖØ-öø-ÿ"
WORD_RUN_RE = re.compile(rf"[{LETTER_CLASS}]+(?:\s+[{LETTER_CLASS}]+)+")
HYPHEN_BREAK_RE = re.compile(rf"([{LETTER_CLASS}])-\s+([{LETTER_CLASS}])")
MULTISPACE_RE = re.compile(r"\s+")

DO_NOT_JOIN_TWO = {
    "di",
    "ke",
    "se",
    "dari",
    "dan",
    "yang",
    "untuk",
    "pada",
    "dalam",
    "dengan",
    "oleh",
    "antara",
    "atau",
    "tetapi",
    "agar",
    "kepada",
    "para",
    "saat",
    "jika",
}

PREFIX_TOKENS = {
    "di",
    "ke",
    "se",
    "ber",
    "ter",
    "per",
    "pe",
    "me",
    "mem",
    "men",
    "meng",
    "pem",
    "pen",
    "peng",
}

SUFFIX_TOKENS = {
    "an",
    "kan",
    "nya",
    "lah",
    "kah",
    "ku",
    "mu",
    "pun",
    "i",
}

BIBLICAL_WORDS = {
    "tobit",
    "tobia",
    "raguel",
    "naftali",
    "yerusalem",
    "yudea",
    "samaria",
    "niniwe",
    "asyur",
    "israel",
    "israeli",
    "allah",
    "yudit",
    "sirakh",
    "barukh",
    "makabe",
    "makab",
    "deuterokanonika",
    "deuterokanonik",
    "salomo",
    "yerobeam",
    "yehuda",
}


@dataclass
class CleanStats:
    total_rows: int = 0
    changed_rows: int = 0
    changed_text_rows: int = 0
    changed_pericope_rows: int = 0
    hyphen_repairs: int = 0
    aggressive_merges: int = 0
    aggressive_mode: bool = False
    wordfreq_available: bool = False


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Clean Bible import CSV text.")
    parser.add_argument("input_csv", type=Path, help="Path to source CSV.")
    parser.add_argument("output_csv", type=Path, help="Path to cleaned CSV.")
    parser.add_argument(
        "--summary-json",
        type=Path,
        default=None,
        help="Optional path to write cleaning summary JSON.",
    )
    parser.add_argument(
        "--mode",
        choices=("safe", "aggressive"),
        default="safe",
        help="safe=spacing cleanup, aggressive=also syllable-merge.",
    )
    return parser.parse_args()


def normalize_spacing(text: str) -> str:
    cleaned = (
        text.replace("\r", "")
        .replace("\u00a0", " ")
        .replace("\u202f", " ")
        .replace("\u2009", " ")
        .replace("\u00ad", "")
        .replace("ﬁ", "fi")
        .replace("ﬂ", "fl")
    )
    cleaned = MULTISPACE_RE.sub(" ", cleaned).strip()
    return cleaned


def basic_clean(text: str) -> Tuple[str, int]:
    cleaned = normalize_spacing(text)

    hyphen_count = len(HYPHEN_BREAK_RE.findall(cleaned))
    cleaned = HYPHEN_BREAK_RE.sub(r"\1\2", cleaned)

    # Punctuation spacing normalization
    cleaned = re.sub(r"\s+([,.;:!?])", r"\1", cleaned)
    cleaned = re.sub(r"([(\[{])\s+", r"\1", cleaned)
    cleaned = re.sub(r"\s+([)\]}])", r"\1", cleaned)
    cleaned = re.sub(r"\s+(['\"])", r"\1", cleaned)
    cleaned = re.sub(r"(['\"])\s+", r"\1 ", cleaned)
    cleaned = MULTISPACE_RE.sub(" ", cleaned).strip()

    return cleaned, hyphen_count


def token_freq(token: str) -> float:
    t = token.lower()
    if not t:
        return 0.0
    if zipf_frequency is None:
        base = 6.0 if t in BIBLICAL_WORDS else 0.0
    else:
        base = max(zipf_frequency(t, "id"), zipf_frequency(t, "en"))

    # Very short chunks in syllabified PDFs often look frequent in English
    # ("ki", "an", "is"). Downweight them to favor reconstructed full words.
    if len(t) <= 2:
        base *= 0.25
    elif len(t) == 3:
        base *= 0.55
    return base


def merged_word_freq(word: str) -> float:
    w = word.lower()
    if not w:
        return 0.0
    freq = token_freq(w)
    if w in BIBLICAL_WORDS:
        freq = max(freq, 6.0)
    return freq


def should_allow_group(tokens: Sequence[str]) -> bool:
    if len(tokens) <= 1:
        return True
    merged = "".join(tokens)
    if len(merged) <= 2:
        return False

    first = tokens[0].lower()
    if len(tokens) == 2 and first in DO_NOT_JOIN_TWO:
        return False
    return True


def group_score(tokens: Sequence[str]) -> float:
    if len(tokens) == 1:
        return token_freq(tokens[0])

    if not should_allow_group(tokens):
        return -10_000.0

    merged = "".join(tokens)
    merged_freq = merged_word_freq(merged)
    part_sum = sum(token_freq(t) for t in tokens)

    short_count = sum(1 for t in tokens if len(t) <= 3)
    bonus = 0.5 * (len(tokens) - 1) + 0.35 * short_count

    first = tokens[0].lower()
    last = tokens[-1].lower()
    if first in PREFIX_TOKENS:
        bonus += 0.85
    if last in SUFFIX_TOKENS:
        bonus += 1.0
    if tokens[0][:1].isupper():
        bonus += 0.45

    # Merge only when it is clearly better than keeping split tokens.
    if merged_freq + bonus < part_sum - 0.1:
        return -10_000.0

    # Minimum confidence floor for unknown words.
    if merged_freq < 1.6 and merged.lower() not in BIBLICAL_WORDS:
        return -10_000.0

    return merged_freq + bonus


def merge_token_group(tokens: Sequence[str]) -> str:
    if len(tokens) == 1:
        return tokens[0]
    return "".join(tokens)


def merge_run(tokens: List[str], max_group: int = 4) -> Tuple[str, int]:
    n = len(tokens)
    if n <= 1:
        return (" ".join(tokens), 0)

    best_score = [-10_000.0] * (n + 1)
    best_len = [1] * n
    best_score[n] = 0.0

    for i in range(n - 1, -1, -1):
        upper = min(max_group, n - i)
        for k in range(1, upper + 1):
            part = tokens[i : i + k]
            score = group_score(part)
            if score <= -9999.0:
                continue
            total = score + best_score[i + k]
            if total > best_score[i]:
                best_score[i] = total
                best_len[i] = k

    out_words: List[str] = []
    merges = 0
    i = 0
    while i < n:
        k = best_len[i]
        part = tokens[i : i + k]
        if k > 1:
            merges += 1
        out_words.append(merge_token_group(part))
        i += k

    return (" ".join(out_words), merges)


def aggressive_clean(text: str) -> Tuple[str, int]:
    total_merges = 0

    def replace_run(match: re.Match[str]) -> str:
        nonlocal total_merges
        run = match.group(0)
        words = run.split()
        merged_run, merges = merge_run(words)
        total_merges += merges
        return merged_run

    cleaned = WORD_RUN_RE.sub(replace_run, text)
    cleaned = MULTISPACE_RE.sub(" ", cleaned).strip()
    return cleaned, total_merges


def clean_text(text: str, mode: str) -> Tuple[str, int, int]:
    base, hyphen_repairs = basic_clean(text)
    if mode != "aggressive":
        return base, hyphen_repairs, 0

    merged, merge_count = aggressive_clean(base)
    return merged, hyphen_repairs, merge_count


def load_rows(path: Path) -> List[Dict[str, str]]:
    with path.open("r", newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        return [dict(row) for row in reader]


def write_rows(path: Path, rows: List[Dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = ["book_name", "grouping", "order_index", "chapter", "verse", "text", "pericope"]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: row.get(key, "") for key in fieldnames})


def summarize_preview(before_rows: List[Dict[str, str]], after_rows: List[Dict[str, str]]) -> List[Dict[str, str]]:
    examples: List[Dict[str, str]] = []
    for before, after in zip(before_rows, after_rows):
        b = (before.get("text") or "").strip()
        a = (after.get("text") or "").strip()
        if b and a and b != a:
            examples.append(
                {
                    "book": before.get("book_name", ""),
                    "chapter": before.get("chapter", ""),
                    "verse": before.get("verse", ""),
                    "before": b[:240],
                    "after": a[:240],
                }
            )
        if len(examples) >= 20:
            break
    return examples


def main() -> None:
    args = parse_args()
    source_rows = load_rows(args.input_csv)
    output_rows: List[Dict[str, str]] = []

    stats = CleanStats(aggressive_mode=args.mode == "aggressive", wordfreq_available=zipf_frequency is not None)

    for row in source_rows:
        stats.total_rows += 1
        out = dict(row)

        old_text = (row.get("text") or "").strip()
        old_pericope = (row.get("pericope") or "").strip()

        new_text, hyphens_text, merges_text = clean_text(old_text, args.mode)
        new_pericope, hyphens_peri, merges_peri = clean_text(old_pericope, args.mode)

        stats.hyphen_repairs += hyphens_text + hyphens_peri
        stats.aggressive_merges += merges_text + merges_peri

        out["text"] = new_text
        out["pericope"] = new_pericope
        output_rows.append(out)

        text_changed = old_text != new_text
        pericope_changed = old_pericope != new_pericope
        if text_changed:
            stats.changed_text_rows += 1
        if pericope_changed:
            stats.changed_pericope_rows += 1
        if text_changed or pericope_changed:
            stats.changed_rows += 1

    write_rows(args.output_csv, output_rows)

    summary = {
        "mode": args.mode,
        "wordfreq_available": stats.wordfreq_available,
        "rows": {
            "total": stats.total_rows,
            "changed": stats.changed_rows,
            "text_changed": stats.changed_text_rows,
            "pericope_changed": stats.changed_pericope_rows,
        },
        "fixes": {
            "hyphen_repairs": stats.hyphen_repairs,
            "aggressive_merges": stats.aggressive_merges,
        },
        "examples": summarize_preview(source_rows, output_rows),
        "output_csv": str(args.output_csv),
    }

    if args.summary_json is not None:
        args.summary_json.parent.mkdir(parents=True, exist_ok=True)
        args.summary_json.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
