from __future__ import annotations

import json
from pathlib import Path


def write_chunks_jsonl(chunks: list[dict[str, object]], output_path: str) -> str:
    """Write complete chunk dictionaries as UTF-8 JSONL and return the resolved path."""
    path = Path(output_path)
    with path.open("w", encoding="utf-8") as output:
        for chunk in chunks:
            output.write(json.dumps(chunk, ensure_ascii=False, separators=(",", ":")) + "\n")
    return str(path)
