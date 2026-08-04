from priora_rag.config import SCORE_THRESHOLD


# Live calibration snapshot from priora_mind2 using BAAI/bge-m3 on 2026-08-04.
# These tests make the evidence behind the configured boundary explicit.
CALIBRATION_TOP_SCORES = {
    "What is CBT?": 0.46743292,
    "What are evidence-based ways to manage anxiety?": 0.63354,
    "How do I replace a flat tire?": 0.419188,
    "What is the capital of France?": 0.305902,
    "How do I implement quicksort in JavaScript?": 0.393569,
    "How do I bake a chocolate cake?": 0.412046,
}


def test_relevant_queries_clear_grounding_threshold() -> None:
    assert CALIBRATION_TOP_SCORES["What is CBT?"] >= SCORE_THRESHOLD
    assert (
        CALIBRATION_TOP_SCORES["What are evidence-based ways to manage anxiety?"]
        >= SCORE_THRESHOLD
    )


def test_unrelated_queries_remain_below_grounding_threshold() -> None:
    unrelated = [
        "How do I replace a flat tire?",
        "What is the capital of France?",
        "How do I implement quicksort in JavaScript?",
        "How do I bake a chocolate cake?",
    ]
    assert all(CALIBRATION_TOP_SCORES[query] < SCORE_THRESHOLD for query in unrelated)
