from __future__ import annotations

import argparse
import json

from priora_rag.retrieval import retrieve


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Search the Priora RAG collection.")
    parser.add_argument("question")
    parser.add_argument("--limit", type=int)
    parser.add_argument("--score-threshold", type=float)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        results = retrieve(
            args.question,
            limit=args.limit,
            score_threshold=args.score_threshold,
        )
    except Exception as exc:
        print(f"search failed: {type(exc).__name__}: {exc}")
        return 1
    print(json.dumps({"results": results}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
