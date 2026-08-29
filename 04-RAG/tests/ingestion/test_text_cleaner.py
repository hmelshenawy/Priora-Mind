from priora_rag.ingestion.text_cleaner import clean_pages, clean_text


def test_clean_text_preserves_arabic_english_diacritics_and_paragraphs() -> None:
    value = "  Stress\u00a0skills\r\ncontinued.\r\n\r\nمَهارةـ عربية  "
    assert clean_text(value) == "Stress skills continued.\n\nمَهارة عربية"


def test_clean_pages_preserves_page_numbers() -> None:
    assert clean_pages([{"page_number": 7, "text": " A  text "}]) == [
        {"page_number": 7, "text": "A text"}
    ]
