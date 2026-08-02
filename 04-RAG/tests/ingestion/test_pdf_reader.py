from pathlib import Path

import pymupdf
import pytest

from priora_rag.ingestion.pdf_reader import read_pdf_pages


def test_reads_each_pdf_page_with_one_based_number(tmp_path: Path) -> None:
    path = tmp_path / "two pages.pdf"
    document = pymupdf.open()
    document.new_page().insert_text((72, 72), "First page")
    document.new_page().insert_text((72, 72), "Second page")
    document.save(path)
    document.close()

    assert read_pdf_pages(str(path)) == [
        {"page_number": 1, "text": "First page\n"},
        {"page_number": 2, "text": "Second page\n"},
    ]


def test_rejects_missing_and_non_pdf_files(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError):
        read_pdf_pages(str(tmp_path / "missing.pdf"))
    text = tmp_path / "source.txt"
    text.write_text("text", encoding="utf-8")
    with pytest.raises(ValueError, match="must be a PDF"):
        read_pdf_pages(str(text))
