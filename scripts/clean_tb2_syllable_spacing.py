#!/usr/bin/env python3
"""
Clean TB2 syllable-spaced verse text using TB1 alignment as spacing reference.

Input/Output schema:
  book_name, grouping, order_index, chapter, verse, text, pericope

Strategy:
1) Project word boundaries from TB1 (same verse, or nearby verse if numbering shifted).
2) Fallback to conservative local merges when alignment confidence is low.
3) Normalize punctuation spacing and restore common hyphenated forms from TB1 corpus.
"""

from __future__ import annotations

import argparse
import csv
import difflib
import json
import math
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

try:
    from wordfreq import zipf_frequency  # type: ignore
except Exception:
    zipf_frequency = None


LETTER_CLASS = r"A-Za-zÀ-ÖØ-öø-ÿ"
WORD_TOKEN_RE = re.compile(rf"[{LETTER_CLASS}-]+")
VALID_HYPHEN_WORD_RE = re.compile(rf"[{LETTER_CLASS}]+(?:-[{LETTER_CLASS}]+)+")
TOKEN_RE = re.compile(rf"[{LETTER_CLASS}-]+|[^{LETTER_CLASS}-]+")
WORD_RUN_RE = re.compile(rf"[{LETTER_CLASS}-]+(?:\s+[{LETTER_CLASS}-]+)+")
SHORT_RUN_RE = re.compile(r"(?:\b[\wÀ-ÿ]{1,3}\b\s+){2,}\b[\wÀ-ÿ]{1,3}\b")
MULTISPACE_RE = re.compile(r"\s+")
REFERENCE_TOKEN_RE = re.compile(
    rf"""\s+|"""
    rf"""\d{{1,3}}:\d{{1,3}}(?:-\d{{1,3}}(?::\d{{1,3}})?)?|"""
    rf"""\d{{1,3}}-\d{{1,3}}|"""
    rf"""(?:[1-3]?)[{LETTER_CLASS}]+\.?|"""
    rf"""\d+|"""
    rf"""[;,.:!?()\[\]"'/-]|."""
)
CITATION_REF_RE = re.compile(r"^\d{1,3}:\d{1,3}(?:-\d{1,3}(?::\d{1,3})?)?$")
CITATION_CONT_RE = re.compile(r"^\d{1,3}(?:-\d{1,3})?$")
CITATION_BOOK_TOKEN_RE = re.compile(rf"^(?:[1-3]?)[{LETTER_CLASS}]+\.?$")
REFERENCE_PARENS_RE = re.compile(
    rf"""
    \(
      \s*
      (?:[1-3]?[{LETTER_CLASS}]+\.?\s+)?
      \d{{1,3}}:\d{{1,3}}(?:-\d{{1,3}}(?::\d{{1,3}})?)?
      (?:\s*[,;]\s*(?:[1-3]?[{LETTER_CLASS}]+\.?\s+)?\d{{1,3}}:\d{{1,3}}(?:-\d{{1,3}}(?::\d{{1,3}})?)?)*
      \s*
    \)
    """,
    re.VERBOSE,
)
MALFORMED_HEAD_REF_RE = re.compile(rf"\b\d{{1,3}}:\d{{1,3}}:\s*[1-3]?[{LETTER_CLASS}]{{2,24}}\.?")

REFERENCE_BOOK_ABBRS = {
    "Kej",
    "Kel",
    "Im",
    "Bil",
    "Ul",
    "Yos",
    "Hak",
    "Rut",
    "1Sam",
    "2Sam",
    "1Raj",
    "2Raj",
    "1Taw",
    "2Taw",
    "Ezr",
    "Neh",
    "Est",
    "Ayb",
    "Mzm",
    "Ams",
    "Pkh",
    "Kid",
    "Yes",
    "Yer",
    "Rat",
    "Yeh",
    "Dan",
    "Hos",
    "Yl",
    "Am",
    "Ob",
    "Yun",
    "Mi",
    "Nah",
    "Hab",
    "Zef",
    "Hag",
    "Za",
    "Mal",
    "Mat",
    "Mrk",
    "Luk",
    "Yoh",
    "Kis",
    "Rm",
    "1Kor",
    "2Kor",
    "Gal",
    "Ef",
    "Flp",
    "Kol",
    "1Tes",
    "2Tes",
    "1Tim",
    "2Tim",
    "Tit",
    "Flm",
    "Ibr",
    "Yak",
    "1Ptr",
    "2Ptr",
    "1Yoh",
    "2Yoh",
    "3Yoh",
    "Yud",
    "Why",
    "Tob",
    "Ydt",
    "Keb",
    "Sir",
    "Bar",
    "1Mak",
    "2Mak",
}

COMMON_STANDALONE_SHORT = {
    "di",
    "ke",
    "ku",
    "mu",
    "ya",
    "ia",
    "aku",
    "kau",
    "dan",
    "yang",
    "itu",
    "ini",
    "pun",
}

DO_NOT_JOIN_TWO = {
    "di",
    "ke",
    "dari",
    "dan",
    "yang",
    "untuk",
    "pada",
    "dalam",
    "dengan",
    "oleh",
    "agar",
    "atau",
    "tetapi",
    "karena",
    "sebab",
}

SUFFIX_TOKENS = {"lah", "kah", "pun", "nya", "ku", "mu"}

# Curated high-confidence fixes for split tokens still found after alignment.
STATIC_SAFE_PHRASE_FIXES: List[Tuple[re.Pattern[str], str]] = [
    (re.compile(r"\bkemu\s+di\s+an\b", re.IGNORECASE), "kemudian"),
    (re.compile(r"\bya\s+hu\s+di\b", re.IGNORECASE), "yahudi"),
    (re.compile(r"\bber\s+di\s+ri\b", re.IGNORECASE), "berdiri"),
    (re.compile(r"\bmemberi\s+tahu\s+kan\b", re.IGNORECASE), "memberitahukan"),
    (re.compile(r"\bper\s+buat\s+an\b", re.IGNORECASE), "perbuatan"),
    (re.compile(r"\bpeng\s+lihat\s+an\b", re.IGNORECASE), "penglihatan"),
    (re.compile(r"\bke\s+raja\s+an\b", re.IGNORECASE), "kerajaan"),
    (re.compile(r"\bke\s+tetap\s+an\b", re.IGNORECASE), "ketetapan"),
    (re.compile(r"\bme\s+laku\s+kan\b", re.IGNORECASE), "melakukan"),
    (re.compile(r"\bke\s+kuasa\s+an\b", re.IGNORECASE), "kekuasaan"),
    (re.compile(r"\bper\s+kata\s+an\b", re.IGNORECASE), "perkataan"),
    (re.compile(r"\bke\s+mulia\s+an\b", re.IGNORECASE), "kemuliaan"),
    (re.compile(r"\bke\s+kuat\s+an\b", re.IGNORECASE), "kekuatan"),
    (re.compile(r"\bper\s+api\s+an\b", re.IGNORECASE), "perapian"),
    (re.compile(r"\bke\s+turun\s+an\b", re.IGNORECASE), "keturunan"),
    (re.compile(r"\bdi\s+beri\s+kan\b", re.IGNORECASE), "diberikan"),
    (re.compile(r"\bdi\s+laku\s+kan\b", re.IGNORECASE), "dilakukan"),
    (re.compile(r"\bke\s+ada\s+an\b", re.IGNORECASE), "keadaan"),
    (re.compile(r"\bke\s+gelap\s+an\b", re.IGNORECASE), "kegelapan"),
    (re.compile(r"\bme\s+si\s+as\b", re.IGNORECASE), "mesias"),
    (re.compile(r"\bke\s+benar\s+an\b", re.IGNORECASE), "kebenaran"),
    (re.compile(r"\bme\s+lepas\s+kan\b", re.IGNORECASE), "melepaskan"),
    (re.compile(r"\bme\s+me\s+gang\b", re.IGNORECASE), "memegang"),
    (re.compile(r"\bse\s+per\s+tiga\b", re.IGNORECASE), "sepertiga"),
    (re.compile(r"\bke\s+raja\s+annya\b", re.IGNORECASE), "kerajaannya"),
    (re.compile(r"\bke\s+pada\s+nya\b", re.IGNORECASE), "kepadanya"),
    (re.compile(r"\bke\s+pada\b", re.IGNORECASE), "kepada"),
    (re.compile(r"\bdi\s+ri\b", re.IGNORECASE), "diri"),
    (re.compile(r"\bme\s+lihat\b", re.IGNORECASE), "melihat"),
    (re.compile(r"\bke\s+dua\b", re.IGNORECASE), "kedua"),
    (re.compile(r"\bbah\s+kan\b", re.IGNORECASE), "bahkan"),
    (re.compile(r"\bper\s+buat\b", re.IGNORECASE), "perbuat"),
    (re.compile(r"\blaku\s+kan\b", re.IGNORECASE), "lakukan"),
    (re.compile(r"\bdemi\s+kian\b", re.IGNORECASE), "demikian"),
    (re.compile(r"\bdemi\s+kianlah\b", re.IGNORECASE), "demikianlah"),
    (re.compile(r"\bke\s+padaku\b", re.IGNORECASE), "kepadaku"),
    (re.compile(r"\bke\s+padamu\b", re.IGNORECASE), "kepadamu"),
    (re.compile(r"\bke\s+padanya\b", re.IGNORECASE), "kepadanya"),
    (re.compile(r"\bsi\s+apa\b", re.IGNORECASE), "siapa"),
    (re.compile(r"\bke\s+empat\b", re.IGNORECASE), "keempat"),
    (re.compile(r"\bdi\s+beri\b", re.IGNORECASE), "diberi"),
    (re.compile(r"\bper\s+nah\b", re.IGNORECASE), "pernah"),
    (re.compile(r"\bme\s+lawan\b", re.IGNORECASE), "melawan"),
    (re.compile(r"\bke\s+tiga\b", re.IGNORECASE), "ketiga"),
    (re.compile(r"\bberi\s+kan\b", re.IGNORECASE), "berikan"),
    (re.compile(r"\bmendengar\s+kan\b", re.IGNORECASE), "mendengarkan"),
    (re.compile(r"\bpa\s+da\b", re.IGNORECASE), "pada"),
    (re.compile(r"\bha\s+ri\b", re.IGNORECASE), "hari"),
    (re.compile(r"\bja\s+di\b", re.IGNORECASE), "jadi"),
    (re.compile(r"\bpada\s+nya\b", re.IGNORECASE), "padanya"),
    (re.compile(r"\bpengajar\s+an\b", re.IGNORECASE), "pengajaran"),
    (re.compile(r"\bapi\s+an\b", re.IGNORECASE), "apian"),
    (re.compile(r"\bdi\s+rinya\b", re.IGNORECASE), "dirinya"),
    (re.compile(r"\bter\s+tulis\b", re.IGNORECASE), "tertulis"),
    (re.compile(r"\bdi\s+bawa\b", re.IGNORECASE), "dibawa"),
    (re.compile(r"\bkata\s+kan\b", re.IGNORECASE), "katakan"),
    (re.compile(r"\bnyata\s+kan\b", re.IGNORECASE), "nyatakan"),
    (re.compile(r"\bbuat\s+an\b", re.IGNORECASE), "buatan"),
    (re.compile(r"\bter\s+jadi\b", re.IGNORECASE), "terjadi"),
    (re.compile(r"\bpemerintah\s+an\b", re.IGNORECASE), "pemerintahan"),
    (re.compile(r"\bsem\s+bah\b", re.IGNORECASE), "sembah"),
    (re.compile(r"\bsem\s+bah\s+an\b", re.IGNORECASE), "sembahan"),
    (re.compile(r"\bper\s+sem\s+bah\s+kan\b", re.IGNORECASE), "persembahkan"),
    (re.compile(r"\bper\s+sem\s+bah\s+an\b", re.IGNORECASE), "persembahan"),
    (re.compile(r"\bmen\s+diri\s+kan\b", re.IGNORECASE), "mendirikan"),
    (re.compile(r"\bka\s+re\s+na\b", re.IGNORECASE), "karena"),
    (re.compile(r"\bsau\s+da\s+ra\b", re.IGNORECASE), "saudara"),
    (re.compile(r"\bdi\s+taruh\b", re.IGNORECASE), "ditaruh"),
    (re.compile(r"\bme\s+lahir\s+kan\b", re.IGNORECASE), "melahirkan"),
    (re.compile(r"\bke\s+dengar\s+an\b", re.IGNORECASE), "kedengaran"),
    (re.compile(r"\bke\s+pedih\s+an\b", re.IGNORECASE), "kepedihan"),
    (re.compile(r"\bme\s+minta\b", re.IGNORECASE), "meminta"),
    (re.compile(r"\bdi\s+tumpas\b", re.IGNORECASE), "ditumpas"),
]


@dataclass
class RowRef:
    verse: int
    text: str
    normalized: str


@dataclass
class Stats:
    rows_total: int = 0
    rows_changed: int = 0
    rows_alignment_same_verse: int = 0
    rows_alignment_neighbor: int = 0
    rows_fallback: int = 0
    low_confidence_rows: int = 0
    short_runs_before: int = 0
    short_runs_after: int = 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Clean TB2 syllable spacing using TB1 alignment.")
    parser.add_argument(
        "--tb2-csv",
        type=Path,
        default=Path("docs/import/tb2_text_raw.csv"),
        help="Input TB2 CSV.",
    )
    parser.add_argument(
        "--tb1-csv",
        type=Path,
        default=Path("docs/import/tb1_text_raw.csv"),
        help="Reference TB1 CSV.",
    )
    parser.add_argument(
        "--out-csv",
        type=Path,
        default=Path("docs/import/tb2_text_clean_aligned.csv"),
        help="Output cleaned TB2 CSV.",
    )
    parser.add_argument(
        "--summary-json",
        type=Path,
        default=Path("docs/import/tb2_text_clean_aligned_summary.json"),
        help="Summary report JSON path.",
    )
    parser.add_argument(
        "--min-direct-ratio",
        type=float,
        default=0.82,
        help="Minimum similarity ratio to trust same-verse alignment.",
    )
    parser.add_argument(
        "--min-neighbor-ratio",
        type=float,
        default=0.82,
        help="Minimum similarity ratio to trust nearby-verse alignment.",
    )
    parser.add_argument(
        "--neighbor-window",
        type=int,
        default=6,
        help="Search nearby TB1 verses within +/-N for numbering shifts.",
    )
    parser.add_argument(
        "--preview-limit",
        type=int,
        default=30,
        help="Max changed examples in summary.",
    )
    return parser.parse_args()


def normalize_letters(text: str) -> str:
    return re.sub(rf"[^{LETTER_CLASS}]+", "", text).lower()


def normalize_spacing(text: str) -> str:
    text = (
        text.replace("\r", "")
        .replace("\u00a0", " ")
        .replace("\u202f", " ")
        .replace("\u2009", " ")
        .replace("”", '"')
        .replace("“", '"')
        .replace("’", "'")
        .replace("‘", "'")
        .replace("—", "-")
        .replace("–", "-")
        .replace("\u00ad", "")
        .replace("ﬁ", "fi")
        .replace("ﬂ", "fl")
    )
    text = MULTISPACE_RE.sub(" ", text).strip()
    return text


def normalize_punctuation_spacing(text: str) -> str:
    text = normalize_spacing(text)
    text = re.sub(r"\s+([,.;:!?])", r"\1", text)
    text = re.sub(r"([(\[{])\s+", r"\1", text)
    text = re.sub(r"\s+([)\]}])", r"\1", text)
    text = re.sub(r"\s+(['\"])", r"\1", text)
    text = re.sub(r":([\"'])", r": \1", text)
    text = re.sub(r"(['\"])\s+", r"\1 ", text)
    text = MULTISPACE_RE.sub(" ", text).strip()
    return text


def split_tokens(text: str) -> List[str]:
    return TOKEN_RE.findall(text)


def is_word_token(token: str) -> bool:
    return bool(WORD_TOKEN_RE.fullmatch(token))


def word_norm(word: str) -> str:
    return re.sub(rf"[^{LETTER_CLASS}]", "", word).lower()


def build_stream(text: str) -> Tuple[List[str], List[int], List[str], List[int], str, set[int]]:
    tokens = split_tokens(text)
    word_indexes: List[int] = []
    words: List[str] = []
    for idx, token in enumerate(tokens):
        if is_word_token(token):
            word_indexes.append(idx)
            words.append(token)

    stream = ""
    boundaries: List[int] = []
    for word in words:
        stream += word_norm(word)
        boundaries.append(len(stream))

    boundary_set = set(boundaries[:-1])
    return tokens, word_indexes, words, boundaries, stream, boundary_set


def sequence_ratio(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    return difflib.SequenceMatcher(a=a, b=b, autojunk=False).ratio()


def choose_reference(
    tb2_norm: str,
    ref_rows: Dict[int, RowRef],
    verse: int,
    min_direct_ratio: float,
    min_neighbor_ratio: float,
    neighbor_window: int,
) -> Tuple[Optional[RowRef], str, float]:
    direct_ref = ref_rows.get(verse)
    best_ref = direct_ref
    best_ratio = sequence_ratio(tb2_norm, direct_ref.normalized) if direct_ref else 0.0
    best_mode = "same"

    if best_ratio >= min_direct_ratio and direct_ref is not None:
        return direct_ref, best_mode, best_ratio

    low = max(1, verse - neighbor_window)
    high = verse + neighbor_window
    for candidate_verse in range(low, high + 1):
        if candidate_verse == verse:
            continue
        candidate = ref_rows.get(candidate_verse)
        if candidate is None:
            continue
        ratio = sequence_ratio(tb2_norm, candidate.normalized)
        if ratio > best_ratio:
            best_ratio = ratio
            best_ref = candidate
            best_mode = "neighbor"

    if best_ref is None:
        return None, "none", best_ratio

    if best_mode == "neighbor" and best_ratio >= min_neighbor_ratio:
        return best_ref, best_mode, best_ratio
    return None, "none", best_ratio


def project_boundaries(tb2_text: str, ref_text: str) -> str:
    tokens2, word_idx2, words2, boundaries2, stream2, _ = build_stream(tb2_text)
    _, _, _, _, stream_ref, ref_boundaries = build_stream(ref_text)

    if not stream2 or not stream_ref or not words2:
        return tb2_text

    matcher = difflib.SequenceMatcher(a=stream2, b=stream_ref, autojunk=False)
    map_stream2_to_ref: List[Optional[int]] = [None] * len(stream2)

    for block in matcher.get_matching_blocks():
        for offset in range(block.size):
            map_stream2_to_ref[block.a + offset] = block.b + offset

    keep_space_after_word = [True] * (len(words2) - 1)
    for i in range(len(words2) - 1):
        boundary = boundaries2[i]
        ref_boundary: Optional[int] = None
        if boundary - 1 >= 0 and map_stream2_to_ref[boundary - 1] is not None:
            ref_boundary = map_stream2_to_ref[boundary - 1] + 1
        elif boundary < len(map_stream2_to_ref) and map_stream2_to_ref[boundary] is not None:
            ref_boundary = map_stream2_to_ref[boundary]
        keep_space_after_word[i] = ref_boundary in ref_boundaries if ref_boundary is not None else True

    out_tokens = tokens2[:]
    wi = 0
    while wi < len(words2):
        merged = words2[wi]
        wj = wi
        while wj < len(words2) - 1 and not keep_space_after_word[wj]:
            merged += words2[wj + 1]
            wj += 1

        out_tokens[word_idx2[wi]] = merged
        for kill in range(wi + 1, wj + 1):
            out_tokens[word_idx2[kill]] = ""

        for k in range(wi, wj):
            left = word_idx2[k]
            right = word_idx2[k + 1]
            for token_i in range(left + 1, right):
                if out_tokens[token_i].isspace():
                    out_tokens[token_i] = ""

        wi = wj + 1

    return "".join(out_tokens)


def build_tb1_lexicon(tb1_rows: List[Dict[str, str]]) -> Tuple[Counter[str], Dict[str, str]]:
    word_counter: Counter[str] = Counter()
    hyphen_forms: Counter[str] = Counter()

    for row in tb1_rows:
        for field in ("text", "pericope"):
            text = row.get(field) or ""
            for token in WORD_TOKEN_RE.findall(text):
                lowered = token.lower()
                word_counter[lowered] += 1
                if VALID_HYPHEN_WORD_RE.fullmatch(lowered):
                    parts = lowered.split("-")
                    if any(part in SUFFIX_TOKENS for part in parts[1:]):
                        continue
                    if any(len(part) < 3 for part in parts):
                        continue
                    hyphen_forms[lowered] += 1

    hyphen_lookup: Dict[str, str] = {}
    by_joined: Dict[str, List[Tuple[str, int]]] = defaultdict(list)
    for token, freq in hyphen_forms.items():
        joined = token.replace("-", "")
        by_joined[joined].append((token, freq))
    for joined, options in by_joined.items():
        options.sort(key=lambda item: item[1], reverse=True)
        hyphen_lookup[joined] = options[0][0]

    return word_counter, hyphen_lookup


def token_score(token: str, lexicon: Counter[str]) -> float:
    lowered = token.lower()
    if not lowered:
        return -10.0

    freq = lexicon.get(lowered, 0)
    if freq > 0:
        return 6.0 + math.log10(freq + 1) * 1.8

    if zipf_frequency is not None:
        z = zipf_frequency(lowered, "id")
        if z >= 5.2:
            return 4.0 + (z - 5.2)
        if z >= 4.6 and len(lowered) >= 4:
            return 2.0 + (z - 4.6)

    if len(lowered) <= 2 and lowered not in COMMON_STANDALONE_SHORT:
        return -6.0
    if len(lowered) == 3 and lowered not in COMMON_STANDALONE_SHORT:
        return -3.5
    return -2.5


def fallback_group_score(tokens: Sequence[str], lexicon: Counter[str]) -> float:
    if len(tokens) == 1:
        return token_score(tokens[0], lexicon)

    first = tokens[0].lower()
    if len(tokens) == 2 and first in DO_NOT_JOIN_TWO:
        merged = "".join(tokens).lower()
        if lexicon.get(merged, 0) == 0:
            return -9999.0

    merged = "".join(tokens)
    merged_score = token_score(merged, lexicon)
    split_score = sum(token_score(part, lexicon) for part in tokens)

    if merged_score + 0.8 * (len(tokens) - 1) < split_score - 0.2:
        return -9999.0
    if merged_score < 0.5:
        return -9999.0
    return merged_score + 0.8 * (len(tokens) - 1)


def fallback_merge_words(words: List[str], lexicon: Counter[str], max_group: int = 5) -> str:
    n = len(words)
    if n <= 1:
        return " ".join(words)

    best_score = [-10_000.0] * (n + 1)
    best_len = [1] * n
    best_score[n] = 0.0

    for i in range(n - 1, -1, -1):
        upper = min(max_group, n - i)
        for k in range(1, upper + 1):
            chunk = words[i : i + k]
            score = fallback_group_score(chunk, lexicon)
            if score <= -9990.0:
                continue
            total = score + best_score[i + k]
            if total > best_score[i]:
                best_score[i] = total
                best_len[i] = k

    out: List[str] = []
    i = 0
    while i < n:
        k = best_len[i]
        out.append("".join(words[i : i + k]))
        i += k
    return " ".join(out)


def fallback_clean_text(text: str, lexicon: Counter[str]) -> str:
    def repl(match: re.Match[str]) -> str:
        words = match.group(0).split()
        return fallback_merge_words(words, lexicon)

    return WORD_RUN_RE.sub(repl, text)


def apply_suffix_join(text: str) -> str:
    # Join enclitics that almost never stand alone in this corpus.
    pattern = re.compile(rf"\b([{LETTER_CLASS}]+)\s+({'|'.join(sorted(SUFFIX_TOKENS))})\b", re.IGNORECASE)
    previous = None
    current = text
    for _ in range(3):
        if current == previous:
            break
        previous = current
        current = pattern.sub(r"\1\2", current)
    return current


def restore_hyphen_forms(text: str, hyphen_lookup: Dict[str, str]) -> str:
    def repl(match: re.Match[str]) -> str:
        token = match.group(0)
        normalized = token.lower()
        hyphen = hyphen_lookup.get(normalized)
        if not hyphen:
            return token
        if token[:1].isupper():
            return hyphen[:1].upper() + hyphen[1:]
        return hyphen

    return re.sub(rf"\b[{LETTER_CLASS}]{{5,}}\b", repl, text)


def apply_static_safe_phrase_fixes(text: str) -> str:
    fixed = text
    for _ in range(4):
        prev = fixed
        for pattern, replacement in STATIC_SAFE_PHRASE_FIXES:
            fixed = pattern.sub(replacement, fixed)
        if fixed == prev:
            break
    return fixed


def is_reference_book_token(token: str) -> bool:
    if not CITATION_BOOK_TOKEN_RE.fullmatch(token):
        return False
    return token.rstrip(".") in REFERENCE_BOOK_ABBRS


def remove_cross_reference_noise(text: str) -> str:
    tokens = REFERENCE_TOKEN_RE.findall(text)
    if not tokens:
        return text

    remove = [False] * len(tokens)
    separators = {",", ";", ":", ".", "!", "?", "(", ")", "[", "]", '"', "'", "/", "-"}

    i = 0
    while i < len(tokens):
        token = tokens[i]
        if token.isspace():
            i += 1
            continue
        if not (CITATION_REF_RE.fullmatch(token) or is_reference_book_token(token) or CITATION_CONT_RE.fullmatch(token)):
            i += 1
            continue

        j = i
        ref_count = 0
        book_count = 0
        cont_count = 0
        sep_count = 0
        nonspace_count = 0
        prev_kind = ""

        while j < len(tokens):
            current = tokens[j]
            if current.isspace():
                j += 1
                continue
            if CITATION_REF_RE.fullmatch(current):
                ref_count += 1
                nonspace_count += 1
                prev_kind = "ref"
                j += 1
                continue
            if is_reference_book_token(current):
                book_count += 1
                nonspace_count += 1
                prev_kind = "book"
                j += 1
                continue
            if current in separators:
                sep_count += 1
                nonspace_count += 1
                prev_kind = "sep"
                j += 1
                continue
            if CITATION_CONT_RE.fullmatch(current):
                if prev_kind in {"sep", "ref", "book", "cont"}:
                    cont_count += 1
                    nonspace_count += 1
                    prev_kind = "cont"
                    j += 1
                    continue
                break
            break

        looks_like_reference = (
            (ref_count >= 2 and (book_count >= 1 or cont_count >= 1))
            or (book_count >= 1 and ref_count >= 1 and sep_count >= 1 and nonspace_count >= 5)
            or (ref_count >= 3)
        )
        if looks_like_reference:
            for idx in range(i, j):
                remove[idx] = True
            i = j
            continue

        i += 1

    cleaned = "".join(token for idx, token in enumerate(tokens) if not remove[idx])
    cleaned = REFERENCE_PARENS_RE.sub("", cleaned)
    cleaned = MALFORMED_HEAD_REF_RE.sub("", cleaned)
    cleaned = re.sub(r"\s{2,}", " ", cleaned).strip()
    cleaned = re.sub(r"\s+([,.;:!?])", r"\1", cleaned)
    cleaned = re.sub(r"([(\[{])\s+", r"\1", cleaned)
    cleaned = re.sub(r"\s+([)\]}])", r"\1", cleaned)
    cleaned = re.sub(r"\s*-\s*([,.;:!?])", r"\1", cleaned)
    cleaned = cleaned.strip(" ;,")
    return cleaned


def trim_low_confidence_tail(text: str, reference_text: str, max_ratio: float = 1.35) -> str:
    source = text.strip()
    if not source:
        return source

    source_norm = normalize_letters(source)
    reference_norm = normalize_letters(reference_text or "")
    if not source_norm or not reference_norm:
        return source
    if len(source_norm) <= int(len(reference_norm) * max_ratio):
        return source

    sentence_ends: List[Tuple[int, int]] = []
    letter_count = 0
    for idx, char in enumerate(source):
        if re.match(rf"[{LETTER_CLASS}]", char):
            letter_count += 1
        if char in ".!?":
            sentence_ends.append((idx + 1, letter_count))

    if not sentence_ends:
        return source

    ref_letters = len(reference_norm)
    lower = int(ref_letters * 0.65)
    upper = int(ref_letters * 1.55)
    candidates = [(idx, letters) for idx, letters in sentence_ends if lower <= letters <= upper]
    if not candidates:
        return source

    best_idx, _ = min(candidates, key=lambda item: abs(item[1] - ref_letters))
    trimmed = source[:best_idx].strip()
    return trimmed or source


def load_rows(path: Path) -> List[Dict[str, str]]:
    with path.open("r", encoding="utf-8", newline="") as handle:
        return [dict(row) for row in csv.DictReader(handle)]


def write_rows(path: Path, rows: List[Dict[str, str]]) -> None:
    fields = ["book_name", "grouping", "order_index", "chapter", "verse", "text", "pericope"]
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            writer.writerow({field: row.get(field, "") for field in fields})


def index_tb1_rows(tb1_rows: List[Dict[str, str]]) -> Dict[Tuple[str, str], Dict[int, RowRef]]:
    index: Dict[Tuple[str, str], Dict[int, RowRef]] = defaultdict(dict)
    for row in tb1_rows:
        book = (row.get("book_name") or "").strip()
        chapter = (row.get("chapter") or "").strip()
        verse_raw = (row.get("verse") or "").strip()
        text = normalize_spacing(row.get("text") or "")
        if not book or not chapter or not verse_raw:
            continue
        try:
            verse = int(verse_raw)
        except ValueError:
            continue
        index[(book, chapter)][verse] = RowRef(verse=verse, text=text, normalized=normalize_letters(text))
    return index


def main() -> None:
    args = parse_args()

    tb2_rows = load_rows(args.tb2_csv)
    tb1_rows = load_rows(args.tb1_csv)

    tb1_index = index_tb1_rows(tb1_rows)
    lexicon, hyphen_lookup = build_tb1_lexicon(tb1_rows)

    output_rows: List[Dict[str, str]] = []
    stats = Stats()
    examples: List[Dict[str, str]] = []
    low_confidence_examples: List[Dict[str, str]] = []

    for row in tb2_rows:
        stats.rows_total += 1
        out = dict(row)

        source_text = normalize_spacing(row.get("text") or "")
        source_pericope = normalize_spacing(row.get("pericope") or "")

        stats.short_runs_before += len(SHORT_RUN_RE.findall(source_text))

        book = (row.get("book_name") or "").strip()
        chapter = (row.get("chapter") or "").strip()
        verse_raw = (row.get("verse") or "").strip()
        chapter_index = tb1_index.get((book, chapter), {})

        aligned_text = source_text
        aligned_pericope = source_pericope
        method = "fallback"
        confidence = 0.0

        verse_num: Optional[int] = None
        try:
            verse_num = int(verse_raw)
        except ValueError:
            verse_num = None

        direct_ref: Optional[RowRef] = chapter_index.get(verse_num) if verse_num is not None else None

        if verse_num is not None and chapter_index:
            ref, mode, ratio = choose_reference(
                tb2_norm=normalize_letters(source_text),
                ref_rows=chapter_index,
                verse=verse_num,
                min_direct_ratio=args.min_direct_ratio,
                min_neighbor_ratio=args.min_neighbor_ratio,
                neighbor_window=args.neighbor_window,
            )
            confidence = ratio
            if ref is not None:
                aligned_text = project_boundaries(source_text, ref.text)
                if source_pericope:
                    aligned_pericope = project_boundaries(source_pericope, ref.text)
                method = "alignment_same" if mode == "same" else "alignment_neighbor"
            else:
                method = "fallback"

        if method == "fallback":
            stats.rows_fallback += 1
            aligned_text = fallback_clean_text(source_text, lexicon)
            if source_pericope:
                aligned_pericope = fallback_clean_text(source_pericope, lexicon)
            if confidence < args.min_neighbor_ratio:
                if direct_ref is not None:
                    aligned_text = trim_low_confidence_tail(aligned_text, direct_ref.text)
                stats.low_confidence_rows += 1
                if len(low_confidence_examples) < 30:
                    low_confidence_examples.append(
                        {
                            "book": book,
                            "chapter": chapter,
                            "verse": verse_raw,
                            "ratio": round(confidence, 4),
                            "before": source_text[:220],
                            "after": aligned_text[:220],
                        }
                    )
        elif method == "alignment_same":
            stats.rows_alignment_same_verse += 1
        elif method == "alignment_neighbor":
            stats.rows_alignment_neighbor += 1

        # Final normalizations
        aligned_text = apply_static_safe_phrase_fixes(aligned_text)
        aligned_text = apply_suffix_join(aligned_text)
        aligned_text = restore_hyphen_forms(aligned_text, hyphen_lookup)
        aligned_text = remove_cross_reference_noise(aligned_text)
        aligned_text = normalize_punctuation_spacing(aligned_text)
        if direct_ref is not None:
            aligned_text = trim_low_confidence_tail(aligned_text, direct_ref.text, max_ratio=1.35)
            aligned_text = normalize_punctuation_spacing(aligned_text)

        if aligned_pericope:
            aligned_pericope = apply_static_safe_phrase_fixes(aligned_pericope)
            aligned_pericope = apply_suffix_join(aligned_pericope)
            aligned_pericope = restore_hyphen_forms(aligned_pericope, hyphen_lookup)
            aligned_pericope = remove_cross_reference_noise(aligned_pericope)
            aligned_pericope = normalize_punctuation_spacing(aligned_pericope)

        out["text"] = aligned_text
        out["pericope"] = aligned_pericope
        output_rows.append(out)

        stats.short_runs_after += len(SHORT_RUN_RE.findall(aligned_text))

        if aligned_text != source_text or aligned_pericope != source_pericope:
            stats.rows_changed += 1
            if len(examples) < args.preview_limit:
                examples.append(
                    {
                        "book": book,
                        "chapter": chapter,
                        "verse": verse_raw,
                        "method": method,
                        "ratio": round(confidence, 4),
                        "before": source_text[:240],
                        "after": aligned_text[:240],
                    }
                )

    write_rows(args.out_csv, output_rows)

    summary = {
        "input_tb2_csv": str(args.tb2_csv),
        "input_tb1_csv": str(args.tb1_csv),
        "output_csv": str(args.out_csv),
        "settings": {
            "min_direct_ratio": args.min_direct_ratio,
            "min_neighbor_ratio": args.min_neighbor_ratio,
            "neighbor_window": args.neighbor_window,
        },
        "rows": {
            "total": stats.rows_total,
            "changed": stats.rows_changed,
            "alignment_same_verse": stats.rows_alignment_same_verse,
            "alignment_neighbor": stats.rows_alignment_neighbor,
            "fallback": stats.rows_fallback,
            "low_confidence_rows": stats.low_confidence_rows,
        },
        "quality": {
            "short_runs_before": stats.short_runs_before,
            "short_runs_after": stats.short_runs_after,
        },
        "examples": examples,
        "low_confidence_examples": low_confidence_examples,
    }

    args.summary_json.parent.mkdir(parents=True, exist_ok=True)
    args.summary_json.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
