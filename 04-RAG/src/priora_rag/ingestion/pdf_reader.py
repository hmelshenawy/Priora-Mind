from __future__ import annotations

from pathlib import Path


def read_pdf_pages(file_path: str, max_source_bytes: int | None = None) -> list[dict[str, object]]:
    """Read a PDF into {page_number, text} dictionaries without cleaning the text."""
    path = Path(file_path).resolve(strict=True)
    if not path.is_file():
        raise FileNotFoundError(path)
    if path.suffix.lower() != ".pdf":
        raise ValueError("source file must be a PDF")
    size = path.stat().st_size
    if size <= 0:
        raise ValueError("source PDF is empty")
    if max_source_bytes is not None and size > max_source_bytes:
        raise ValueError("source PDF is too large")

    import pymupdf

    document = pymupdf.open(str(path))
    try:
        return [
            {"page_number": page_index + 1, "text": page.get_text()}
            for page_index, page in enumerate(document)
        ]
    finally:
        document.close()
