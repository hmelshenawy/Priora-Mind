from __future__ import annotations

import hashlib
import re
from uuid import NAMESPACE_URL, uuid5


CHUNK_KEYS = (
    "chunk_id",
    "source_id",
    "source_title",
    "source_file",
    "source_type",
    "chunk_index",
    "text",
    "page_number",
    "page_start",
    "page_end",
    "heading",
    "section",
    "text_hash",
)


def create_chunks(
    pages: list[dict[str, object]],
    source_id: str,
    source_title: str,
    source_file: str,
    chunk_size: int,
    chunk_overlap: int,
) -> list[dict[str, object]]:
    """Create deterministic character-sized chunks with source and PDF page metadata."""
    _validate_options(source_id, source_title, source_file, chunk_size, chunk_overlap)
    combined, page_ranges = _combine_pages(pages)
    if not combined:
        return []

    chunks: list[dict[str, object]] = []
    for chunk_index, (start, end) in enumerate(_chunk_spans(combined, chunk_size, chunk_overlap)):
        text = combined[start:end].strip()
        if not text:
            continue
        page_numbers = [
            page_number
            for range_start, range_end, page_number in page_ranges
            if range_start < end and range_end > start
        ]
        if not page_numbers:
            raise ValueError("could not determine page range for chunk")
        text_hash = "sha256:" + hashlib.sha256(text.encode("utf-8")).hexdigest()
        identity = (
            f"{source_id}|{chunk_index}|{text_hash}|{chunk_size}|{chunk_overlap}|"
            f"{page_numbers[0]}|{page_numbers[-1]}"
        )
        chunks.append(
            {
                "chunk_id": str(uuid5(NAMESPACE_URL, identity)),
                "source_id": source_id,
                "source_title": source_title,
                "source_file": source_file,
                "source_type": "pdf",
                "chunk_index": chunk_index,
                "text": text,
                "page_number": page_numbers[0],
                "page_start": page_numbers[0],
                "page_end": page_numbers[-1],
                "heading": None,
                "section": None,
                "text_hash": text_hash,
            }
        )
    return chunks


def _validate_options(
    source_id: str,
    source_title: str,
    source_file: str,
    chunk_size: int,
    chunk_overlap: int,
) -> None:
    for field, value in (
        ("source_id", source_id),
        ("source_title", source_title),
        ("source_file", source_file),
    ):
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f"chunk field '{field}' must not be empty")
    if chunk_size <= 0:
        raise ValueError("chunk_size must be greater than zero")
    if chunk_overlap < 0 or chunk_overlap >= chunk_size:
        raise ValueError("chunk_overlap must be >= 0 and less than chunk_size")


def _combine_pages(
    pages: list[dict[str, object]],
) -> tuple[str, list[tuple[int, int, int]]]:
    parts: list[str] = []
    ranges: list[tuple[int, int, int]] = []
    position = 0
    for page in pages:
        if set(page) != {"page_number", "text"}:
            raise ValueError("cleaned page must contain exactly 'page_number' and 'text'")
        page_number = page["page_number"]
        text = page["text"]
        if not isinstance(page_number, int) or page_number < 1:
            raise ValueError("page field 'page_number' must be a positive integer")
        if not isinstance(text, str):
            raise ValueError("page field 'text' must be a string")
        if parts:
            parts.append("\n\n")
            position += 2
        start = position
        parts.append(text)
        position += len(text)
        ranges.append((start, position, page_number))
    return "".join(parts), ranges


def _chunk_spans(text: str, chunk_size: int, overlap: int) -> list[tuple[int, int]]:
    spans: list[tuple[int, int]] = []
    start = 0
    while start < len(text):
        target = min(start + chunk_size, len(text))
        end = _best_break(text, start, target) if target < len(text) else target
        if end <= start:
            end = target
        spans.append((start, end))
        if end >= len(text):
            break
        start = max(0, end - overlap)
        while start < end and not text[start].isspace():
            start += 1
        while start < len(text) and text[start].isspace():
            start += 1
    return spans


def _best_break(text: str, start: int, target: int) -> int:
    window = text[start:target]
    minimum = max(1, len(window) // 2)
    matches = list(re.finditer(r"\n\n|(?<=[.!?؟])\s+|\s+", window))
    candidates = [match.end() for match in matches if match.end() >= minimum]
    return start + candidates[-1] if candidates else target
