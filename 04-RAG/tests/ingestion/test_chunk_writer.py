import json
from pathlib import Path

from priora_rag.ingestion.chunk_writer import write_chunks_jsonl


def test_writes_complete_unicode_jsonl(tmp_path: Path) -> None:
    chunks = [{"chunk_id": "one", "text": "مهارة"}, {"chunk_id": "two", "text": "CBT"}]
    output = tmp_path / "chunks.jsonl"
    assert write_chunks_jsonl(chunks, str(output)) == str(output)
    records = [json.loads(line) for line in output.read_text(encoding="utf-8").splitlines()]
    assert records == chunks
