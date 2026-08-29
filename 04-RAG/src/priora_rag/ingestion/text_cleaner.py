from __future__ import annotations

import re
import unicodedata


def clean_text(text: str) -> str:
    """Normalize extracted text while preserving Unicode, punctuation, and paragraphs."""
    if not isinstance(text, str):
        raise ValueError("text must be a string")
    cleaned = unicodedata.normalize("NFKC", text)
    cleaned = cleaned.replace("\r\n", "\n").replace("\r", "\n")
    cleaned = cleaned.replace("\u00a0", " ").replace("\u0640", "")
    cleaned = re.sub(r"(?<=\w)-\n(?=\w)", "", cleaned)
    cleaned = re.sub(r"(?<![.!?؟:\n])\n(?!\n)", " ", cleaned)
    cleaned = re.sub(r"[ \t]+", " ", cleaned)
    cleaned = re.sub(r" *\n *", "\n", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def clean_pages(pages: list[dict[str, object]]) -> list[dict[str, object]]:
    """Clean page text and preserve each positive, one-based page number."""
    cleaned_pages: list[dict[str, object]] = []
    for page in pages:
        if "page_number" not in page or "text" not in page:
            raise ValueError("page requires 'page_number' and 'text'")
        page_number = page["page_number"]
        if not isinstance(page_number, int) or page_number < 1:
            raise ValueError("page field 'page_number' must be a positive integer")
        cleaned_pages.append({"page_number": page_number, "text": clean_text(page["text"])})
    return cleaned_pages
