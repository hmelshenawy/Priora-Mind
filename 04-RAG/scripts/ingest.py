from __future__ import annotations

import argparse
import json

from priora_rag.ingestion import ingest_document


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Ingest one PDF into Qdrant.")
    parser.add_argument("source_file")
    parser.add_argument("--chunk-size", type=int)
    parser.add_argument("--chunk-overlap", type=int)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        result = ingest_document(
            args.source_file,
            chunk_size=args.chunk_size,
            chunk_overlap=args.chunk_overlap,
        )
    except Exception as exc:
        print(f"ingest failed: {type(exc).__name__}: {exc}")
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
