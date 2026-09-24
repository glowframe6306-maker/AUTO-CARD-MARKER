import re
from typing import Dict
from rapidfuzz import fuzz, process

MONTHS_FULL = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
]


def normalize_text(value: str) -> str:
    if not value:
        return ""
    value = value.strip()
    value = value.lower()
    value = re.sub(r"[^a-z0-9]+", " ", value)
    value = re.sub(r"\s{2,}", " ", value)
    return value.strip()


def match_name(ocr_name: str, candidate_names: list[str]) -> Dict[str, str | float]:
    normalized_ocr = normalize_text(ocr_name)
    if not normalized_ocr:
        return {"matched_name": None, "confidence": 0.0, "status": "unmatched"}
    best = process.extractOne(
        normalized_ocr,
        candidate_names,
        scorer=fuzz.token_sort_ratio,
        score_cutoff=0,
    )
    if not best:
        return {"matched_name": None, "confidence": 0.0, "status": "unmatched"}
    matched_name, score, _ = best
    status = "matched" if score >= 65 else "review"
    if score >= 95:
        status = "matched"
    return {
        "matched_name": matched_name,
        "confidence": score / 100.0,
        "status": status,
    }


def generate_candidates(ocr_name: str, candidate_names: list[str], limit: int = 5) -> list[Dict[str, str | float]]:
    normalized_ocr = normalize_text(ocr_name)
    if not normalized_ocr:
        return []
    results = process.extract(
        normalized_ocr,
        candidate_names,
        scorer=fuzz.token_sort_ratio,
        limit=limit,
    )
    return [
        {
            "matched_name": name,
            "confidence": score / 100.0,
        }
        for name, score, _ in results
    ]


def find_month_column(month: str) -> str | None:
    if not month:
        return None
    normalized = month.strip().lower()
    aliases = {
        "jan": "January",
        "feb": "February",
        "mar": "March",
        "apr": "April",
        "may": "May",
        "jun": "June",
        "jul": "July",
        "aug": "August",
        "sep": "September",
        "sept": "September",
        "oct": "October",
        "nov": "November",
        "dec": "December",
    }
    if normalized in aliases:
        return aliases[normalized]
    for month_name in MONTHS_FULL:
        if normalized == month_name.lower():
            return month_name
    return None
