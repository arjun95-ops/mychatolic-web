#!/usr/bin/env python3
"""
Sync prayer translations from official Catholic sources.

Sources:
- Vatican Compendium of the Catechism (EN/FR/IT/ES/DE/PT + LATIN)
- Korean Catholic Bishops' Conference prayer API (KO)
- Catholic Bishops' Conference of Japan posts/PDF/pages (JA)
- Catholic Bishops' Conference of the Philippines liturgy PDF (TL, partial)

Notes:
- Korean and Japanese outputs include pronunciation lines beneath each sentence.
- Tagalog coverage in this script is currently limited to prayers that can be
  extracted from verified official CBCP liturgy text.
"""

from __future__ import annotations

import argparse
import datetime as dt
import html
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Any

import requests
import fitz
from bs4 import BeautifulSoup
from hangul_romanize import Transliter
from hangul_romanize.rule import academic
from pykakasi import kakasi


COMPENDIUM_DOC_URLS = {
    "en": "https://www.vatican.va/archive/compendium_ccc/documents/archive_2005_compendium-ccc_en.html",
    "fr": "https://www.vatican.va/archive/compendium_ccc/documents/archive_2005_compendium-ccc_fr.html",
    "it": "https://www.vatican.va/archive/compendium_ccc/documents/archive_2005_compendium-ccc_it.html",
    "sp": "https://www.vatican.va/archive/compendium_ccc/documents/archive_2005_compendium-ccc_sp.html",
    "ge": "https://www.vatican.va/archive/compendium_ccc/documents/archive_2005_compendium-ccc_ge.html",
    "po": "https://www.vatican.va/archive/compendium_ccc/documents/archive_2005_compendium-ccc_po.html",
}


CORE_SLUGS = [
    "tanda-salib",
    "kemuliaan",
    "bapa-kami",
    "salam-maria",
    "aku-percaya-syahadat",
    "doa-tobat-pengakuan-dosa",
    "doa-untuk-arwah-orang-meninggal",
    "doa-roh-kudus",
    "doa-malaikat-tuhan-angelus",
    "salam-regina-ratu-surga-bersukacitalah",
]


# Block indexes were verified against Vatican pages on 2026-02-21.
COMPENDIUM_PLANS: dict[str, dict[str, Any]] = {
    "en": {
        "source_doc": "en",
        "source_url": COMPENDIUM_DOC_URLS["en"],
        "entries": {
            "aku-percaya-syahadat": {"indexes": [166]},
            "bapa-kami": {"indexes": [1991]},
            "tanda-salib": {"indexes": [2062], "drop_first_line": True},
            "kemuliaan": {"indexes": [2066], "drop_first_line": True},
            "salam-maria": {"indexes": [2070], "drop_first_line": True},
            "doa-untuk-arwah-orang-meninggal": {"indexes": [2078], "drop_first_line": True},
            "doa-malaikat-tuhan-angelus": {"indexes": [2082], "drop_first_line": True},
            "salam-regina-ratu-surga-bersukacitalah": {"indexes": [2119]},
            "doa-roh-kudus": {"indexes": [2155]},
            "doa-tobat-pengakuan-dosa": {"indexes": [2215]},
        },
    },
    "fr": {
        "source_doc": "fr",
        "source_url": COMPENDIUM_DOC_URLS["fr"],
        "entries": {
            "aku-percaya-syahadat": {"indexes": [164, 165, 166]},
            "bapa-kami": {"indexes": [1962]},
            "tanda-salib": {"indexes": [2035]},
            "kemuliaan": {"indexes": [2037]},
            "salam-maria": {"indexes": [2039]},
            "doa-untuk-arwah-orang-meninggal": {"indexes": [2043]},
            "doa-malaikat-tuhan-angelus": {"indexes": [2056]},
            "salam-regina-ratu-surga-bersukacitalah": {"indexes": [2066]},
            "doa-roh-kudus": {"indexes": [2090]},
            "doa-tobat-pengakuan-dosa": {"indexes": [2133]},
        },
    },
    "it": {
        "source_doc": "it",
        "source_url": COMPENDIUM_DOC_URLS["it"],
        "entries": {
            "aku-percaya-syahadat": {"indexes": [159], "drop_first_line": True},
            "bapa-kami": {"indexes": [1944], "drop_first_line": True},
            "tanda-salib": {"indexes": [2015], "drop_first_line": True},
            "kemuliaan": {"indexes": [2016], "drop_first_line": True},
            "salam-maria": {"indexes": [2017], "drop_first_line": True},
            "doa-untuk-arwah-orang-meninggal": {"indexes": [2019], "drop_first_line": True},
            "doa-malaikat-tuhan-angelus": {"indexes": [2020], "drop_first_line": True},
            "salam-regina-ratu-surga-bersukacitalah": {"indexes": [2022], "drop_first_line": True},
            "doa-roh-kudus": {"indexes": [2028], "drop_first_line": True},
            "doa-tobat-pengakuan-dosa": {"indexes": [2036], "drop_first_line": True},
        },
    },
    "es": {
        "source_doc": "sp",
        "source_url": COMPENDIUM_DOC_URLS["sp"],
        "entries": {
            "aku-percaya-syahadat": {"indexes": [162, 163]},
            "bapa-kami": {"indexes": [1985]},
            "tanda-salib": {"indexes": [2057], "drop_first_line": True},
            "kemuliaan": {"indexes": [2061], "drop_first_line": True},
            "salam-maria": {"indexes": [2069], "drop_first_line": True},
            "doa-untuk-arwah-orang-meninggal": {"indexes": [2077], "drop_first_line": True},
            "doa-malaikat-tuhan-angelus": {"indexes": [2081], "drop_first_line": True},
            "salam-regina-ratu-surga-bersukacitalah": {"indexes": [2114]},
            "doa-roh-kudus": {"indexes": [2212, 2213, 2214, 2215, 2216]},
            "doa-tobat-pengakuan-dosa": {"indexes": [2288], "drop_first_line": True},
        },
    },
    "de": {
        "source_doc": "ge",
        "source_url": COMPENDIUM_DOC_URLS["ge"],
        "entries": {
            "aku-percaya-syahadat": {"indexes": [157, 158, 159, 160]},
            "bapa-kami": {"indexes": [2002]},
            "tanda-salib": {"indexes": [2075]},
            "kemuliaan": {"indexes": [2077]},
            "salam-maria": {"indexes": [2079]},
            "doa-untuk-arwah-orang-meninggal": {"indexes": [2083]},
            "doa-malaikat-tuhan-angelus": {"indexes": [2085, 2086, 2087, 2088, 2089, 2090, 2091, 2092, 2093]},
            "salam-regina-ratu-surga-bersukacitalah": {"indexes": [2102]},
            "doa-roh-kudus": {"indexes": [2125, 2126, 2127, 2128, 2129, 2130, 2131, 2132, 2133]},
            "doa-tobat-pengakuan-dosa": {"indexes": [2168]},
        },
    },
    "pt": {
        "source_doc": "po",
        "source_url": COMPENDIUM_DOC_URLS["po"],
        "entries": {
            "aku-percaya-syahadat": {"indexes": [167, 168, 169]},
            "bapa-kami": {"indexes": [1997]},
            "tanda-salib": {"indexes": [2070]},
            "kemuliaan": {"indexes": [2072]},
            "salam-maria": {"indexes": [2074]},
            "doa-untuk-arwah-orang-meninggal": {"indexes": [2078]},
            "doa-malaikat-tuhan-angelus": {"indexes": [2080, 2081, 2082, 2083, 2084, 2085, 2086, 2087, 2088, 2089]},
            "salam-regina-ratu-surga-bersukacitalah": {"indexes": [2094]},
            "doa-roh-kudus": {"indexes": [2114]},
            "doa-tobat-pengakuan-dosa": {"indexes": [2150]},
        },
    },
    "la": {
        "source_doc": "en",
        "source_url": COMPENDIUM_DOC_URLS["en"],
        "entries": {
            "aku-percaya-syahadat": {"indexes": [167], "drop_first_line": True},
            "bapa-kami": {"indexes": [1992], "drop_first_line": True},
            "tanda-salib": {"indexes": [2064], "drop_first_line": True},
            "kemuliaan": {"indexes": [2068], "drop_first_line": True},
            "salam-maria": {"indexes": [2072], "drop_first_line": True},
            "doa-untuk-arwah-orang-meninggal": {"indexes": [2080], "drop_first_line": True},
            "doa-malaikat-tuhan-angelus": {"indexes": [2091], "drop_first_line": True},
            "salam-regina-ratu-surga-bersukacitalah": {"indexes": [2123]},
            "doa-roh-kudus": {"indexes": [2157]},
            "doa-tobat-pengakuan-dosa": {"indexes": [2217]},
        },
    },
}


KO_SEQ_BY_SLUG = {
    "tanda-salib": 1,
    "bapa-kami": 2,
    "salam-maria": 3,
    "kemuliaan": 4,
    "aku-percaya-syahadat": 5,
    "doa-mohon-ampun": 6,
    "doa-tobat-pengakuan-dosa": 9,
    "doa-mohon-berkat": 11,
    "doa-malaikat-tuhan-angelus": 12,
    "salam-regina-ratu-surga-bersukacitalah": 13,
    "doa-sebelum-makan": 16,
    "doa-sesudah-makan": 17,
    "doa-roh-kudus": 18,
    "doa-pagi": 20,
    "doa-malam": 21,
    "doa-mohon-perlindungan": 24,
    "litani-hati-kudus-yesus": 31,
    "litani-santa-perawan-maria": 32,
    "doa-untuk-keluarga": 58,
    "doa-untuk-orang-tua": 60,
    "doa-untuk-orang-sakit": 65,
    "doa-untuk-arwah-orang-meninggal": 67,
}


JA_POST_BY_SLUG = {
    "bapa-kami": 15311,
    "aku-percaya-syahadat": 7456,
    "salam-maria": 5759,
}


JA_PDF_BY_SLUG = {
    "litani-santa-perawan-maria": "https://www.cbcj.catholic.jp/wp-content/uploads/2020/10/rengan_rosary.pdf",
}


JA_UBECAT_PRAY_URL = "https://ubecat.jp/pray/"
JA_UBECAT_MISSA_URL = "https://ubecat.jp/missa/"
JA_CBCJ_STAGE1_URL = "https://www.cbcj.catholic.jp/catholic/holyyear/synod2023/stage1/"
JA_OSAKA_SICK_VISIT_URL = (
    "https://osaka-takamatsu.liturgy.jp/index.php/download_file/view_inline/"
    "3ea533d0-632a-4a93-86cd-cd74dea06a7c"
)
JA_KASUGAI_PRAY_URL = "http://catholic-kasugai.jimdofree.com/%E7%A5%88%E3%82%8A/"
R_JINA_PREFIX = "https://r.jina.ai/"

JA_UBECAT_PRAY_MODAL_BY_SLUG = {
    "tanda-salib": {"modal_id": "sign_crossModal", "title": "十字のしるし"},
    "kemuliaan": {"modal_id": "glory_beModal", "title": "栄唱"},
}


TL_CORE_SOURCE_URL = (
    "https://cbcponline.net/wp-content/uploads/2021/10/"
    "Banal-na-Misa-at-Pagbubukas-ng-Sinodo-sa-Lokal-na-Simbahan.pdf"
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Sync official prayer translations")
    parser.add_argument("--dry-run", action="store_true", help="Build payload and report only, do not upsert")
    parser.add_argument(
        "--report",
        default="docs/import/prayer_translation_sync_report.json",
        help="Report JSON path",
    )
    parser.add_argument("--timeout", type=int, default=25, help="HTTP timeout (seconds)")
    return parser.parse_args()


def load_env_file(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    env: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        env[key.strip()] = value.strip().strip("'\"")
    return env


def normalize_line(line: str) -> str:
    return re.sub(r"\s+", " ", line).strip()


def normalize_text_block(text: str) -> str:
    lines = [normalize_line(ln) for ln in text.splitlines()]
    lines = [ln for ln in lines if ln]
    return "\n".join(lines).strip()


def parse_vatican_blocks(html_text: str) -> list[str]:
    soup = BeautifulSoup(html_text, "html.parser")
    blocks: list[str] = []
    for node in soup.find_all(["p", "td"]):
        text = node.get_text("\n", strip=True)
        text = normalize_text_block(text)
        if text:
            blocks.append(text)
    return blocks


def extract_blocks(blocks: list[str], indexes: list[int], drop_first_line: bool = False) -> str:
    lines: list[str] = []
    for i, idx in enumerate(indexes):
        if idx < 0 or idx >= len(blocks):
            raise IndexError(f"Block index {idx} out of range (max={len(blocks)-1})")
        block_lines = [normalize_line(ln) for ln in blocks[idx].split("\n") if normalize_line(ln)]
        if i == 0 and drop_first_line and block_lines:
            block_lines = block_lines[1:]
        lines.extend(block_lines)
    return normalize_text_block("\n".join(lines))


def clean_korean_lines(lines: list[str]) -> list[str]:
    cleaned: list[str] = []
    for line in lines:
        line = normalize_line(line)
        if not line:
            continue
        if re.fullmatch(r"[○●◎┼]+", line):
            continue
        if "밑줄 부분" in line:
            continue
        if line.startswith("잠깐 반성"):
            continue
        if line == "십자 성호를 그으며":
            continue
        cleaned.append(line)
    return cleaned


def add_korean_pronunciation(text: str, transliter: Transliter) -> str:
    out: list[str] = []
    for line in text.splitlines():
        clean = normalize_line(line)
        if not clean:
            continue
        out.append(clean)
        if re.search(r"[가-힣]", clean):
            roman = normalize_line(transliter.translit(clean))
            if roman:
                out.append(f"({roman})")
    return "\n".join(out)


def add_japanese_pronunciation(text: str, kk: Any) -> str:
    out: list[str] = []
    for line in text.splitlines():
        clean = normalize_line(line)
        if not clean:
            continue
        out.append(clean)
        if re.search(r"[ぁ-んァ-ン一-龯ー]", clean):
            parts = kk.convert(clean)
            roma = " ".join(normalize_line(p.get("hepburn", "")) for p in parts if normalize_line(p.get("hepburn", "")))
            roma = normalize_line(roma)
            if roma:
                out.append(f"({roma})")
    return "\n".join(out)


class SupabaseRest:
    def __init__(self, base_url: str, service_key: str, timeout: int, schema: str = "public") -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.schema = schema
        self.session = requests.Session()
        self.base_headers = {
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
        }
        self.read_headers = {**self.base_headers, "Accept-Profile": self.schema}
        self.write_headers = {
            **self.base_headers,
            "Accept-Profile": self.schema,
            "Content-Profile": self.schema,
        }

    def _url(self, table_or_path: str) -> str:
        if table_or_path.startswith("http://") or table_or_path.startswith("https://"):
            return table_or_path
        if table_or_path.startswith("/"):
            return f"{self.base_url}{table_or_path}"
        return f"{self.base_url}/rest/v1/{table_or_path}"

    def get(self, table_or_path: str, params: dict[str, Any] | None = None) -> Any:
        res = self.session.get(
            self._url(table_or_path),
            headers=self.read_headers,
            params=params or {},
            timeout=self.timeout,
        )
        if res.status_code >= 300:
            raise RuntimeError(f"GET {table_or_path} failed: {res.status_code} {res.text[:400]}")
        if not res.text:
            return None
        return res.json()

    def upsert(self, table: str, rows: list[dict[str, Any]], on_conflict: str) -> Any:
        headers = {
            **self.write_headers,
            "Prefer": "resolution=merge-duplicates,return=representation",
        }
        params = {"on_conflict": on_conflict}
        res = self.session.post(
            self._url(table),
            headers=headers,
            params=params,
            data=json.dumps(rows, ensure_ascii=False),
            timeout=self.timeout,
        )
        if res.status_code >= 300:
            raise RuntimeError(f"UPSERT {table} failed: {res.status_code} {res.text[:600]}")
        if not res.text:
            return []
        return res.json()


def fetch_cbck_prayer(seq: int, timeout: int) -> tuple[str, str]:
    url = f"https://cbck.or.kr/Catholic/Prayer/PrayerContentsLoad?seq={seq}"
    res = requests.get(url, timeout=timeout)
    res.raise_for_status()
    payload = res.json()
    data = payload.get("data")
    if not data:
        raise RuntimeError(f"CBCK seq {seq} has no data")
    title = normalize_line(str(data.get("title", "")))
    raw = str(data.get("prayer", ""))
    soup = BeautifulSoup(raw, "html.parser")
    text = soup.get_text("\n", strip=True)
    lines = [normalize_line(ln) for ln in text.splitlines() if normalize_line(ln)]
    lines = clean_korean_lines(lines)
    return title, "\n".join(lines).strip()


def fetch_cbcj_post(post_id: int, timeout: int) -> tuple[str, str, str]:
    api_url = f"https://www.cbcj.catholic.jp/wp-json/wp/v2/posts/{post_id}"
    res = requests.get(api_url, timeout=timeout)
    res.raise_for_status()
    data = json.loads(res.content.decode("utf-8-sig"))
    title = normalize_line(str(data.get("title", {}).get("rendered", "")))
    link = str(data.get("link", "")).strip()
    content_html = str(data.get("content", {}).get("rendered", ""))
    soup = BeautifulSoup(content_html, "html.parser")
    lines: list[str] = []
    for p in soup.find_all("p"):
        p_text = p.get_text("\n", strip=True)
        p_lines = [normalize_line(ln) for ln in p_text.splitlines() if normalize_line(ln)]
        lines.extend(p_lines)
    text = "\n".join(lines).strip()
    return title, text, link


def clean_japanese_html_lines(text: str) -> list[str]:
    lines = [normalize_line(ln) for ln in text.splitlines()]
    return [ln for ln in lines if ln]


def fetch_ubecat_pray_modal_prayers(timeout: int) -> dict[str, tuple[str, str]]:
    res = requests.get(JA_UBECAT_PRAY_URL, timeout=timeout)
    res.raise_for_status()
    # The site omits charset in headers; decode bytes as UTF-8 explicitly.
    soup = BeautifulSoup(res.content.decode("utf-8", errors="replace"), "html.parser")

    out: dict[str, tuple[str, str]] = {}
    for slug, cfg in JA_UBECAT_PRAY_MODAL_BY_SLUG.items():
        modal = soup.find("div", id=cfg["modal_id"])
        if not modal:
            raise RuntimeError(f"Could not find modal '{cfg['modal_id']}' in {JA_UBECAT_PRAY_URL}")
        modal_body = modal.find("div", class_="modal-body")
        if not modal_body:
            raise RuntimeError(f"Could not find modal body for '{cfg['modal_id']}' in {JA_UBECAT_PRAY_URL}")

        lines = clean_japanese_html_lines(modal_body.get_text("\n", strip=True))
        if cfg["modal_id"] == "sign_crossModal":
            # Drop movement annotations such as "（右手を額に）".
            lines = [ln for ln in lines if not re.fullmatch(r"（[^）]+）", ln)]
        text = "\n".join(lines).strip()
        if not text:
            raise RuntimeError(f"No text extracted from modal '{cfg['modal_id']}' in {JA_UBECAT_PRAY_URL}")
        out[slug] = (cfg["title"], text)

    return out


def fetch_ubecat_missa_prayers(timeout: int) -> dict[str, tuple[str, str]]:
    res = requests.get(JA_UBECAT_MISSA_URL, timeout=timeout)
    res.raise_for_status()
    # The site omits charset in headers; decode bytes as UTF-8 explicitly.
    soup = BeautifulSoup(res.content.decode("utf-8", errors="replace"), "html.parser")

    out: dict[str, tuple[str, str]] = {}

    # Confiteor block in the Penitential Act (first form).
    conf_dd = next(
        (
            dd
            for dd in soup.find_all("dd")
            if "全能の神と、兄弟姉妹の皆さんに告白します。" in dd.get_text("\n", strip=True)
        ),
        None,
    )
    if not conf_dd:
        raise RuntimeError(f"Could not find confiteor block in {JA_UBECAT_MISSA_URL}")
    conf_dl = conf_dd.find_parent("dl")
    if not conf_dl:
        raise RuntimeError(f"Confiteor block has no parent dl in {JA_UBECAT_MISSA_URL}")
    conf_lines: list[str] = []
    for dd in conf_dl.find_all("dd"):
        conf_lines.extend(clean_japanese_html_lines(dd.get_text("\n", strip=True)))
    out["doa-tobat-pengakuan-dosa"] = ("回心（第一形式）", "\n".join(conf_lines).strip())

    # Kyrie (first form) as "doa mohon ampun".
    kyrie = soup.find("div", id="kyrie101")
    if not kyrie:
        raise RuntimeError(f"Could not find Kyrie block id='kyrie101' in {JA_UBECAT_MISSA_URL}")
    kyrie_lines: list[str] = []
    for dd in kyrie.find_all("dd"):
        kyrie_lines.extend(clean_japanese_html_lines(dd.get_text("\n", strip=True)))
    out["doa-mohon-ampun"] = ("いつくしみの賛歌（Kyrie）", "\n".join(kyrie_lines).strip())

    # Final blessing block (first dispatch form).
    blessing_dd = next(
        (
            dd
            for dd in soup.find_all("dd")
            if "全能の神、父と子と聖霊の祝福が皆さんの上にありますように。" in dd.get_text(" ", strip=True)
        ),
        None,
    )
    if not blessing_dd:
        raise RuntimeError(f"Could not find final blessing block in {JA_UBECAT_MISSA_URL}")
    blessing_dl = blessing_dd.find_parent("dl")
    if not blessing_dl:
        raise RuntimeError(f"Final blessing block has no parent dl in {JA_UBECAT_MISSA_URL}")
    blessing_lines: list[str] = []
    for dd in blessing_dl.find_all("dd"):
        blessing_lines.extend(clean_japanese_html_lines(dd.get_text("\n", strip=True)))
    out["doa-mohon-berkat"] = ("祝福", "\n".join(blessing_lines).strip())

    for slug, (_, text) in out.items():
        if not text:
            raise RuntimeError(f"Extracted empty text for slug '{slug}' from {JA_UBECAT_MISSA_URL}")

    return out


def fetch_cbcj_stage1_holy_spirit_prayer(timeout: int) -> str:
    res = requests.get(JA_CBCJ_STAGE1_URL, timeout=timeout)
    res.raise_for_status()
    soup = BeautifulSoup(res.content.decode("utf-8", errors="replace"), "html.parser")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()
    page_text = soup.get_text("\n", strip=True).replace("\u3000", " ")

    match = re.search(r"聖霊よ、わたしたちはあなたの前に立ち、(.*?)アーメン。", page_text, re.S)
    if not match:
        raise RuntimeError("Could not locate Japanese Holy Spirit prayer block in CBCJ stage1 page")

    block = "聖霊よ、わたしたちはあなたの前に立ち、" + match.group(1) + "アーメン。"
    block = normalize_line(re.sub(r"\s+", " ", block))
    lines = [normalize_line(ln) for ln in re.split(r"(?<=。)", block) if normalize_line(ln)]
    prayer = "\n".join(lines).strip()
    if not prayer:
        raise RuntimeError("Extracted empty Japanese Holy Spirit prayer block from CBCJ stage1 page")
    return prayer


def fetch_markdown_via_rjina(source_url: str, timeout: int, retries: int = 4) -> str:
    source_url = source_url.strip()
    if source_url.startswith("http://") or source_url.startswith("https://"):
        proxy_url = f"{R_JINA_PREFIX}{source_url}"
    else:
        raise ValueError(f"Unsupported URL for r.jina.ai proxy: {source_url}")

    last_err: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            res = requests.get(proxy_url, timeout=timeout)
            res.raise_for_status()
            text = res.text
            if (
                "Warning: Target URL returned error 403: Forbidden" in text
                or text.startswith("Title: Just a moment...")
            ):
                raise RuntimeError("Source returned bot-verification page")
            if len(text) < 800:
                raise RuntimeError(f"Proxy response too short (len={len(text)})")
            return text
        except Exception as exc:
            last_err = exc
            if attempt < retries:
                time.sleep(1.2)
                continue
            break
    raise RuntimeError(f"Failed fetching source via r.jina.ai for {source_url}: {last_err}")


def extract_kasugai_salve_regina(timeout: int) -> str:
    md = fetch_markdown_via_rjina(JA_KASUGAI_PRAY_URL, timeout=timeout, retries=5)
    match = re.search(r"元后\s*あわれみの母(.*?)喜びのおとめマリア。", md, re.S)
    if not match:
        raise RuntimeError("Could not locate Salve Regina block in Kasugai prayer page")

    block = "元后あわれみの母" + match.group(1) + "喜びのおとめマリア。"
    block = re.sub(r"\*+", "", block)
    block = normalize_line(re.sub(r"\s+", " ", block))
    block = block.replace("元后あわれみの母 ", "元后あわれみの母、")
    block = block.replace("も、 涙", "も、涙")
    block = block.replace("かた、 あわれみ", "かた、あわれみ")
    block = block.replace("を、 旅路", "を、旅路")
    block = block.replace("、 喜びのおとめマリア。", "、喜びのおとめマリア。")

    lines = [normalize_line(ln) for ln in re.split(r"(?<=。)", block) if normalize_line(ln)]
    prayer = "\n".join(lines).strip()
    if not prayer:
        raise RuntimeError("Extracted empty Salve Regina text from Kasugai page")
    return prayer


def fetch_pdf_text(url: str, timeout: int) -> str:
    res = requests.get(url, timeout=timeout)
    res.raise_for_status()
    doc = fitz.open(stream=res.content, filetype="pdf")
    return "\n".join(page.get_text("text") for page in doc)


def clean_pdf_lines(text: str) -> list[str]:
    lines = [normalize_line(ln) for ln in text.splitlines()]
    cleaned: list[str] = []
    for line in lines:
        if not line:
            continue
        if re.fullmatch(r"\d+", line):
            continue
        if "BANAL NA MISA" in line.upper():
            continue
        cleaned.append(line)
    return cleaned


def extract_osaka_sick_visit_prayers(url: str, timeout: int) -> dict[str, tuple[str, str]]:
    text = fetch_pdf_text(url, timeout=timeout)
    compact = re.sub(r"\s+", "", text)
    out: dict[str, tuple[str, str]] = {}

    sick_match = re.search(
        r"全能永遠の神よ、あなたを信じるすべての人は、尽きることのない健康をあなたに見出します。"
        r".*?わたしたちの主イエス･キリストによって。",
        compact,
    )
    if not sick_match:
        raise RuntimeError("Could not locate sick prayer block in Osaka sick-visit rite PDF")
    sick = sick_match.group(0)
    # Normalize known glyph-order artifacts in vertical extraction.
    sick = sick.replace("喜に満ちた", "喜びに満ちた")
    sick = sick.replace("。びわたしたちの主", "。わたしたちの主")
    sick_lines = [normalize_line(ln) for ln in re.split(r"(?<=。)", sick) if normalize_line(ln)]
    if not sick_lines or sick_lines[-1] != "アーメン。":
        sick_lines.append("アーメン。")
    out["doa-untuk-orang-sakit"] = ("病者のための祈り", "\n".join(sick_lines).strip())

    protection_match = re.search(
        r"主がわたしたちを祝福し、すべての悪から守り、永遠のいのちに導いてくださいますように。",
        compact,
    )
    if not protection_match:
        raise RuntimeError("Could not locate protection blessing formula in Osaka sick-visit rite PDF")
    out["doa-mohon-perlindungan"] = (
        "守りの祈り",
        f"{protection_match.group(0)}\nアーメン。",
    )

    return out


def extract_tagalog_core_prayers_from_cbcp_pdf(url: str, timeout: int) -> dict[str, str]:
    text = fetch_pdf_text(url, timeout=timeout)
    out: dict[str, str] = {}

    # Sign of the Cross (opening formula in the approved liturgy text).
    if re.search(r"ngalan\s+ng\s+Ama\s+at\s+ng\s+Anak\s+at\s+ng\s+Espiritu\s+Santo\.", text, re.I):
        out["tanda-salib"] = "Sa ngalan ng Ama,\nat ng Anak at ng Espiritu Santo.\nAmen."
    else:
        raise RuntimeError("Tagalog sign of the cross block not found in CBCP PDF")

    # Our Father.
    our_father_match = re.search(
        r"Ama\s+namin,\s+sumasalangit\s+ka\.(.*?)At\s+iadya\s+mo\s+kami\s+sa\s+lahat\s+ng\s+masama\.",
        text,
        re.I | re.S,
    )
    if not our_father_match:
        raise RuntimeError("Tagalog Our Father block not found in CBCP PDF")
    our_father_block = "Ama namin, sumasalangit ka." + our_father_match.group(1) + "At iadya mo kami sa lahat ng masama."
    out["bapa-kami"] = "\n".join(clean_pdf_lines(our_father_block))

    # Apostles' Creed.
    creed_match = re.search(
        r"Sumasampalataya\s+ako\s+sa\s+Diyos\s+Amang\s+makapangyarihan\s+sa\s+lahat,(.*?)"
        r"at\s+sa\s+buhay\s+na\s+walang\s+hanggan\.\s*Amen\.",
        text,
        re.I | re.S,
    )
    if not creed_match:
        raise RuntimeError("Tagalog creed block not found in CBCP PDF")
    creed_block = (
        "Sumasampalataya ako sa Diyos Amang makapangyarihan sa lahat,"
        + creed_match.group(1)
        + "at sa buhay na walang hanggan. Amen."
    )
    out["aku-percaya-syahadat"] = "\n".join(clean_pdf_lines(creed_block))

    # Gloria.
    gloria_match = re.search(
        r"Papuri\s+sa\s+Diyos\s+sa\s+kaitaasan(.*?)"
        r"sa\s+kadakilaan\s+ng\s+Diyos\s+Ama\.\s*Amen\.",
        text,
        re.I | re.S,
    )
    if not gloria_match:
        raise RuntimeError("Tagalog Gloria block not found in CBCP PDF")
    gloria_block = (
        "Papuri sa Diyos sa kaitaasan"
        + gloria_match.group(1)
        + "sa kadakilaan ng Diyos Ama. Amen."
    )
    out["kemuliaan"] = "\n".join(clean_pdf_lines(gloria_block))

    # Holy Spirit prayer (Adsumus).
    adsumus_match = re.search(
        r"Narito\s+kami\s+sa\s+iyong\s+haparan,\s*Espiritung\s+Banal,(.*?)"
        r"magpasawalang\s+hanggan\.\s*Amen\.",
        text,
        re.I | re.S,
    )
    if not adsumus_match:
        raise RuntimeError("Tagalog Holy Spirit prayer block not found in CBCP PDF")
    adsumus_block = (
        "Narito kami sa iyong haparan, Espiritung Banal,"
        + adsumus_match.group(1)
        + "magpasawalang hanggan. Amen."
    )
    out["doa-roh-kudus"] = "\n".join(clean_pdf_lines(adsumus_block))

    # Final blessing formula.
    blessing_match = re.search(
        r"(P\s*agpalain\s+kayo\s+ng\s+makapangyarihang\s+Diyos,\s*Ama\s*X\s*at\s*Anak\s*X\s*at\s*Espiritu\s*X\s*Santo\.)"
        r"(?:.{0,240}?)Amen\.",
        text,
        re.I | re.S,
    )
    if not blessing_match:
        raise RuntimeError("Tagalog final blessing block not found in CBCP PDF")
    blessing_formula = normalize_line(re.sub(r"\s+", " ", blessing_match.group(1)))
    blessing_formula = re.sub(r"\bP\s+agpalain\b", "Pagpalain", blessing_formula, flags=re.I)
    blessing_formula = re.sub(r",\s*Ama\s+X", ",\nAma X", blessing_formula)
    out["doa-mohon-berkat"] = f"{blessing_formula}\nAmen."

    return out


def extract_cbcj_marian_litany_from_pdf(url: str, timeout: int) -> str:
    res = requests.get(url, timeout=timeout)
    res.raise_for_status()
    doc = fitz.open(stream=res.content, filetype="pdf")

    # Keep only larger text layer to avoid furigana noise.
    chars: list[str] = []
    for page in doc:
        d = page.get_text("dict")
        for block in d.get("blocks", []):
            for line in block.get("lines", []):
                for span in line.get("spans", []):
                    if float(span.get("size", 0)) >= 7.0:
                        token = str(span.get("text", "")).strip()
                        if token:
                            chars.append(token)

    joined = "".join(chars)
    start = joined.find("主よ、あわれんでください。")
    end = joined.find("アーメン。", start if start >= 0 else 0)
    if start < 0 or end < 0:
        raise RuntimeError("Could not locate Japanese Marian litany prayer block")

    prayer = joined[start : end + len("アーメン。")]
    prayer = re.sub(r"\d{4}", "", prayer)
    prayer = prayer.replace("〃", "わたしたちのために祈ってください。")
    prayer = prayer.replace("わたしたちのために……", "わたしたちのために祈ってください。")
    prayer = prayer.replace("わたしたちのために...", "わたしたちのために祈ってください。")
    prayer = prayer.replace("。", "。\n")
    prayer = re.sub(r"\n+", "\n", prayer).strip()
    return prayer


def chunked(items: list[Any], size: int) -> list[list[Any]]:
    return [items[i : i + size] for i in range(0, len(items), size)]


def main() -> int:
    args = parse_args()

    env = load_env_file(Path(".env.local"))
    base_url = env.get("NEXT_PUBLIC_SUPABASE_URL", "").strip()
    service_key = env.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    db_schema = (env.get("SUPABASE_DB_SCHEMA", "public") or "public").strip()
    if not base_url or not service_key:
        print("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local", file=sys.stderr)
        return 1

    supabase = SupabaseRest(base_url, service_key, timeout=args.timeout, schema=db_schema)

    prayers_rows = supabase.get("prayers", params={"select": "id,slug,name", "order": "sort_order.asc"})
    language_rows = supabase.get("prayer_languages", params={"select": "code,name"})
    prayer_by_slug = {row["slug"]: row for row in prayers_rows}
    languages_available = {row["code"] for row in language_rows}

    missing_catalog_slugs = [slug for slug in CORE_SLUGS if slug not in prayer_by_slug]
    if missing_catalog_slugs:
        raise RuntimeError(f"Missing core prayer slugs in DB catalog: {missing_catalog_slugs}")

    # Cache compendium blocks by source document key.
    compendium_blocks_cache: dict[str, list[str]] = {}
    for key, url in COMPENDIUM_DOC_URLS.items():
        res = requests.get(url, timeout=args.timeout)
        res.raise_for_status()
        compendium_blocks_cache[key] = parse_vatican_blocks(res.text)

    payload: list[dict[str, Any]] = []
    extraction_log: list[dict[str, Any]] = []
    failures: list[str] = []

    # Vatican-based languages (core prayer set)
    for lang_code, plan in COMPENDIUM_PLANS.items():
        if lang_code not in languages_available:
            failures.append(f"Language '{lang_code}' not present in prayer_languages")
            continue
        source_doc = plan["source_doc"]
        source_url = plan["source_url"]
        blocks = compendium_blocks_cache[source_doc]
        entries: dict[str, Any] = plan["entries"]

        for slug in CORE_SLUGS:
            cfg = entries.get(slug)
            if not cfg:
                continue
            try:
                text = extract_blocks(
                    blocks,
                    cfg["indexes"],
                    drop_first_line=bool(cfg.get("drop_first_line", False)),
                )
                prayer = prayer_by_slug[slug]
                row = {
                    "prayer_id": prayer["id"],
                    "language_code": lang_code,
                    "title": prayer["name"],
                    "content": text,
                    "source_note": f"Official source: Vatican Compendium of the Catechism ({source_url})",
                    "is_published": True,
                }
                payload.append(row)
                extraction_log.append(
                    {
                        "language": lang_code,
                        "slug": slug,
                        "source": source_url,
                        "content_length": len(text),
                    }
                )
            except Exception as exc:
                failures.append(f"{lang_code}:{slug} -> {exc}")

    # Korean (CBCK): wider catalog coverage
    ko_transliter = Transliter(academic)
    if "ko" in languages_available:
        for slug, seq in KO_SEQ_BY_SLUG.items():
            if slug not in prayer_by_slug:
                failures.append(f"ko:{slug} not found in prayers catalog")
                continue
            try:
                ko_title, ko_text = fetch_cbck_prayer(seq, args.timeout)
                ko_with_pron = add_korean_pronunciation(ko_text, ko_transliter)
                row = {
                    "prayer_id": prayer_by_slug[slug]["id"],
                    "language_code": "ko",
                    "title": ko_title or prayer_by_slug[slug]["name"],
                    "content": ko_with_pron,
                    "source_note": (
                        "Official source: 한국천주교주교회의 가톨릭 기도서 "
                        f"(https://cbck.or.kr/Catholic/Prayer/PrayerContentsLoad?seq={seq})"
                    ),
                    "is_published": True,
                }
                payload.append(row)
                extraction_log.append(
                    {
                        "language": "ko",
                        "slug": slug,
                        "source": f"https://cbck.or.kr/Catholic/Prayer/PrayerContentsLoad?seq={seq}",
                        "content_length": len(ko_with_pron),
                    }
                )
            except Exception as exc:
                failures.append(f"ko:{slug} (seq {seq}) -> {exc}")
    else:
        failures.append("Language 'ko' not present in prayer_languages")

    # Japanese (CBCJ): currently verified official texts for selected prayers
    kk = kakasi()
    if "ja" in languages_available:
        for slug, post_id in JA_POST_BY_SLUG.items():
            if slug not in prayer_by_slug:
                failures.append(f"ja:{slug} not found in prayers catalog")
                continue
            try:
                ja_title, ja_text, ja_link = fetch_cbcj_post(post_id, args.timeout)
                ja_with_pron = add_japanese_pronunciation(ja_text, kk)
                row = {
                    "prayer_id": prayer_by_slug[slug]["id"],
                    "language_code": "ja",
                    "title": ja_title or prayer_by_slug[slug]["name"],
                    "content": ja_with_pron,
                    "source_note": f"Official source: カトリック中央協議会 ({ja_link})",
                    "is_published": True,
                }
                payload.append(row)
                extraction_log.append(
                    {
                        "language": "ja",
                        "slug": slug,
                        "source": ja_link,
                        "content_length": len(ja_with_pron),
                    }
                )
            except Exception as exc:
                failures.append(f"ja:{slug} (post {post_id}) -> {exc}")

        # Additional Japanese prayer texts from official CBCJ PDF.
        for slug, pdf_url in JA_PDF_BY_SLUG.items():
            if slug not in prayer_by_slug:
                failures.append(f"ja:{slug} not found in prayers catalog")
                continue
            try:
                ja_text = extract_cbcj_marian_litany_from_pdf(pdf_url, args.timeout)
                ja_with_pron = add_japanese_pronunciation(ja_text, kk)
                row = {
                    "prayer_id": prayer_by_slug[slug]["id"],
                    "language_code": "ja",
                    "title": prayer_by_slug[slug]["name"],
                    "content": ja_with_pron,
                    "source_note": f"Official source: カトリック中央協議会 ({pdf_url})",
                    "is_published": True,
                }
                payload.append(row)
                extraction_log.append(
                    {
                        "language": "ja",
                        "slug": slug,
                        "source": pdf_url,
                        "content_length": len(ja_with_pron),
                    }
                )
            except Exception as exc:
                failures.append(f"ja:{slug} (pdf) -> {exc}")

        # Additional Japanese prayers from official Catholic Ube Church pages.
        try:
            ubecat_pray = fetch_ubecat_pray_modal_prayers(args.timeout)
            for slug, (ja_title, ja_text) in ubecat_pray.items():
                if slug not in prayer_by_slug:
                    failures.append(f"ja:{slug} not found in prayers catalog")
                    continue
                ja_with_pron = add_japanese_pronunciation(ja_text, kk)
                row = {
                    "prayer_id": prayer_by_slug[slug]["id"],
                    "language_code": "ja",
                    "title": ja_title or prayer_by_slug[slug]["name"],
                    "content": ja_with_pron,
                    "source_note": f"Official source: カトリック宇部教会 ({JA_UBECAT_PRAY_URL})",
                    "is_published": True,
                }
                payload.append(row)
                extraction_log.append(
                    {
                        "language": "ja",
                        "slug": slug,
                        "source": JA_UBECAT_PRAY_URL,
                        "content_length": len(ja_with_pron),
                    }
                )
        except Exception as exc:
            failures.append(f"ja:ubecat pray -> {exc}")

        try:
            ubecat_missa = fetch_ubecat_missa_prayers(args.timeout)
            for slug, (ja_title, ja_text) in ubecat_missa.items():
                if slug not in prayer_by_slug:
                    failures.append(f"ja:{slug} not found in prayers catalog")
                    continue
                ja_with_pron = add_japanese_pronunciation(ja_text, kk)
                row = {
                    "prayer_id": prayer_by_slug[slug]["id"],
                    "language_code": "ja",
                    "title": ja_title or prayer_by_slug[slug]["name"],
                    "content": ja_with_pron,
                    "source_note": f"Official source: カトリック宇部教会 ({JA_UBECAT_MISSA_URL})",
                    "is_published": True,
                }
                payload.append(row)
                extraction_log.append(
                    {
                        "language": "ja",
                        "slug": slug,
                        "source": JA_UBECAT_MISSA_URL,
                        "content_length": len(ja_with_pron),
                    }
                )
        except Exception as exc:
            failures.append(f"ja:ubecat missa -> {exc}")

        try:
            slug = "doa-roh-kudus"
            if slug not in prayer_by_slug:
                failures.append(f"ja:{slug} not found in prayers catalog")
            else:
                ja_text = fetch_cbcj_stage1_holy_spirit_prayer(args.timeout)
                ja_with_pron = add_japanese_pronunciation(ja_text, kk)
                row = {
                    "prayer_id": prayer_by_slug[slug]["id"],
                    "language_code": "ja",
                    "title": "聖霊への祈り",
                    "content": ja_with_pron,
                    "source_note": f"Official source: カトリック中央協議会 ({JA_CBCJ_STAGE1_URL})",
                    "is_published": True,
                }
                payload.append(row)
                extraction_log.append(
                    {
                        "language": "ja",
                        "slug": slug,
                        "source": JA_CBCJ_STAGE1_URL,
                        "content_length": len(ja_with_pron),
                    }
                )
        except Exception as exc:
            failures.append(f"ja:doa-roh-kudus (holyyear stage1) -> {exc}")

        try:
            osaka_prayers = extract_osaka_sick_visit_prayers(JA_OSAKA_SICK_VISIT_URL, args.timeout)
            for slug, (ja_title, ja_text) in osaka_prayers.items():
                if slug not in prayer_by_slug:
                    failures.append(f"ja:{slug} not found in prayers catalog")
                    continue
                ja_with_pron = add_japanese_pronunciation(ja_text, kk)
                row = {
                    "prayer_id": prayer_by_slug[slug]["id"],
                    "language_code": "ja",
                    "title": ja_title or prayer_by_slug[slug]["name"],
                    "content": ja_with_pron,
                    "source_note": (
                        "Official source: カトリック大阪高松大司教区 典礼委員会 "
                        f"({JA_OSAKA_SICK_VISIT_URL})"
                    ),
                    "is_published": True,
                }
                payload.append(row)
                extraction_log.append(
                    {
                        "language": "ja",
                        "slug": slug,
                        "source": JA_OSAKA_SICK_VISIT_URL,
                        "content_length": len(ja_with_pron),
                    }
                )
        except Exception as exc:
            failures.append(f"ja:osaka sick visit -> {exc}")

        try:
            slug = "salam-regina-ratu-surga-bersukacitalah"
            if slug not in prayer_by_slug:
                failures.append(f"ja:{slug} not found in prayers catalog")
            else:
                ja_text = extract_kasugai_salve_regina(args.timeout)
                ja_with_pron = add_japanese_pronunciation(ja_text, kk)
                row = {
                    "prayer_id": prayer_by_slug[slug]["id"],
                    "language_code": "ja",
                    "title": "元后あわれみの母",
                    "content": ja_with_pron,
                    "source_note": f"Official source: 公式カトリック春日井教会 ({JA_KASUGAI_PRAY_URL})",
                    "is_published": True,
                }
                payload.append(row)
                extraction_log.append(
                    {
                        "language": "ja",
                        "slug": slug,
                        "source": JA_KASUGAI_PRAY_URL,
                        "content_length": len(ja_with_pron),
                    }
                )
        except Exception as exc:
            failures.append(f"ja:salam-regina-ratu-surga-bersukacitalah (kasugai) -> {exc}")
    else:
        failures.append("Language 'ja' not present in prayer_languages")

    # Tagalog (CBCP): currently verified core prayers from official liturgy PDF.
    if "tl" in languages_available:
        try:
            tl_by_slug = extract_tagalog_core_prayers_from_cbcp_pdf(TL_CORE_SOURCE_URL, args.timeout)
            for slug, tl_text in tl_by_slug.items():
                if slug not in prayer_by_slug:
                    failures.append(f"tl:{slug} not found in prayers catalog")
                    continue
                row = {
                    "prayer_id": prayer_by_slug[slug]["id"],
                    "language_code": "tl",
                    "title": prayer_by_slug[slug]["name"],
                    "content": tl_text,
                    "source_note": f"Official source: Catholic Bishops' Conference of the Philippines ({TL_CORE_SOURCE_URL})",
                    "is_published": True,
                }
                payload.append(row)
                extraction_log.append(
                    {
                        "language": "tl",
                        "slug": slug,
                        "source": TL_CORE_SOURCE_URL,
                        "content_length": len(tl_text),
                    }
                )
        except Exception as exc:
            failures.append(f"tl:core extraction -> {exc}")
    else:
        failures.append("Language 'tl' not present in prayer_languages")

    # Coverage report (what this run attempts)
    attempted_by_lang: dict[str, set[str]] = {}
    for row in payload:
        attempted_by_lang.setdefault(row["language_code"], set()).add(
            next((slug for slug, p in prayer_by_slug.items() if p["id"] == row["prayer_id"]), "")
        )

    all_catalog_slugs = [row["slug"] for row in prayers_rows]
    unresolved_by_lang: dict[str, list[str]] = {}
    for code in ["fr", "en", "it", "pt", "es", "de", "la", "ko", "ja", "tl"]:
        attempted = attempted_by_lang.get(code, set())
        unresolved = [slug for slug in all_catalog_slugs if slug not in attempted]
        unresolved_by_lang[code] = unresolved

    upserted_count = 0
    if not args.dry_run:
        # Deduplicate payload by (prayer_id, language_code) while keeping latest row
        dedup_map: dict[tuple[str, str], dict[str, Any]] = {}
        for row in payload:
            dedup_map[(row["prayer_id"], row["language_code"])] = row
        dedup_rows = list(dedup_map.values())
        for batch in chunked(dedup_rows, 100):
            saved = supabase.upsert("prayer_translations", batch, on_conflict="prayer_id,language_code")
            upserted_count += len(saved)

    counts_after: dict[str, int] = {}
    try:
        all_trans = supabase.get("prayer_translations", params={"select": "language_code"})
        for row in all_trans:
            code = row.get("language_code")
            counts_after[code] = counts_after.get(code, 0) + 1
    except Exception as exc:
        failures.append(f"Failed counting final translations: {exc}")

    report = {
        "timestamp_utc": dt.datetime.now(dt.UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "dry_run": bool(args.dry_run),
        "payload_rows": len(payload),
        "upserted_rows": upserted_count,
        "counts_after_by_language": counts_after,
        "attempted_by_language": {k: sorted(v) for k, v in attempted_by_lang.items()},
        "unresolved_by_language": unresolved_by_lang,
        "extraction_log": extraction_log,
        "failures": failures,
    }

    report_path = Path(args.report)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(json.dumps(
        {
            "dry_run": report["dry_run"],
            "payload_rows": report["payload_rows"],
            "upserted_rows": report["upserted_rows"],
            "counts_after_by_language": report["counts_after_by_language"],
            "failure_count": len(failures),
            "report": str(report_path),
        },
        ensure_ascii=False,
        indent=2,
    ))

    # Don't fail hard on partial source coverage; fail only on fatal errors collected above.
    fatal_failures = [f for f in failures if "not present in prayer_languages" in f or "Missing core prayer slugs" in f]
    return 1 if fatal_failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
