import os
import re
from typing import Dict
from PIL import Image, ImageFilter, ImageOps
import pytesseract

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
MONTH_ALIASES = {
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

NAME_PATTERNS = [
    r"name[:\-\s]+([A-Z0-9 .,'`]+)",
    r"member name[:\-\s]+([A-Z0-9 .,'`]+)",
    r"name\s+([A-Z0-9 .,'`]+)",
]
MONTH_PATTERNS = [
    r"month[:\-\s]+([A-Z]+)",
    r"([A-Z][a-z]{2,8})",
]


def configure_tesseract():
    env_path = os.getenv("TESSERACT_CMD")
    if env_path:
        pytesseract.pytesseract.tesseract_cmd = env_path


def improve_image(image: Image.Image) -> Image.Image:
    image = image.convert("L")
    image = ImageOps.autocontrast(image)
    image = image.filter(ImageFilter.SHARPEN)
    width, height = image.size
    max_dimension = 1600
    if max(width, height) > max_dimension:
        scale = max_dimension / max(width, height)
        image = image.resize((int(width * scale), int(height * scale)), Image.LANCZOS)
    return image


def extract_text(image_path: str) -> str:
    configure_tesseract()
    with Image.open(image_path) as image:
        image = improve_image(image)
        text = pytesseract.image_to_string(image, lang="eng")
    return text.strip()


def normalize_line(line: str) -> str:
    line = line.strip()
    line = re.sub(r"[–—_]+", " ", line)
    line = re.sub(r"\s{2,}", " ", line)
    return line


def normalize_name(name: str) -> str:
    name = name.strip()
    name = re.sub(r"[^A-Za-z0-9 .,'`-]", " ", name)
    name = re.sub(r"\s{2,}", " ", name)
    return name.title().replace(" .", ".").replace(" - ", "-")


def find_month(text: str) -> str | None:
    lines = [normalize_line(line) for line in text.splitlines() if line.strip()]
    for line in lines:
        match = re.search(r"month[:\-\s]+([A-Za-z]{3,9})", line, re.IGNORECASE)
        if match:
            month_token = match.group(1).lower()
            return MONTH_ALIASES.get(month_token[:3], MONTHS_FULL[[m.lower() for m in MONTHS_FULL].index(month_token)]) if month_token[:3] in MONTH_ALIASES else None
    for line in lines:
        tokens = re.findall(r"[A-Za-z]{3,9}", line)
        for token in tokens:
            token_lower = token.lower()
            if token_lower in MONTH_ALIASES:
                return MONTH_ALIASES[token_lower]
            if token_lower in [m.lower() for m in MONTHS_FULL]:
                return token.title()
    return None


def find_name(text: str) -> str | None:
    lines = [normalize_line(line) for line in text.splitlines() if line.strip()]
    for line in lines:
        for pattern in NAME_PATTERNS:
            match = re.search(pattern, line, re.IGNORECASE)
            if match:
                return normalize_name(match.group(1))
    for line in lines:
        if re.search(r"[A-Za-z0-9 .,'`-]{3,}", line):
            if not any(token.lower() in MONTH_ALIASES or token.lower() in [m.lower() for m in MONTHS_FULL] for token in re.findall(r"[A-Za-z]{3,9}", line)):
                return normalize_name(line)
    return None


def process_card(image_path: str) -> Dict[str, str | float | None]:
    raw_text = extract_text(image_path)
    detected_name = find_name(raw_text) if raw_text else None
    detected_month = find_month(raw_text) if raw_text else None
    confidence = 0.98 if detected_name and detected_month else 0.45
    return {
        "name": detected_name,
        "month": detected_month,
        "confidence": confidence,
        "raw_text": raw_text,
    }
