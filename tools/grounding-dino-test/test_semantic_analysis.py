import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from analyze_candidates import validate_semantic_results


class SemanticValidationTests(unittest.TestCase):
    def test_valid_results_are_mapped_by_candidate_id_not_order(self) -> None:
        value = {"candidates": [keep("candidate-2"), rotate("candidate-1")]}
        result = validate_semantic_results(value, ["candidate-1", "candidate-2"])
        self.assertEqual(
            [item["candidateId"] for item in result["candidates"]],
            ["candidate-1", "candidate-2"],
        )

    def test_duplicate_candidate_id_is_rejected(self) -> None:
        value = {"candidates": [keep("candidate-1"), rotate("candidate-1")]}
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            validate_semantic_results(value, ["candidate-1", "candidate-2"])

    def test_unknown_candidate_id_is_rejected(self) -> None:
        value = {"candidates": [keep("candidate-1"), rotate("candidate-9")]}
        with self.assertRaisesRegex(ValueError, "Unknown"):
            validate_semantic_results(value, ["candidate-1", "candidate-2"])

    def test_missing_candidate_result_is_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "exactly one"):
            validate_semantic_results(
                {"candidates": [keep("candidate-1")]},
                ["candidate-1", "candidate-2"],
            )

    def test_non_toy_requires_null_fields(self) -> None:
        invalid = non_toy("candidate-1")
        invalid["name"] = "table"
        with self.assertRaisesRegex(ValueError, "non-toy"):
            validate_semantic_results({"candidates": [invalid]}, ["candidate-1"])

    def test_keep_requires_two_or_three_play_ideas(self) -> None:
        invalid = keep("candidate-1")
        invalid["playIdeas"] = invalid["playIdeas"][:1]
        with self.assertRaisesRegex(ValueError, "2 or 3"):
            validate_semantic_results({"candidates": [invalid]}, ["candidate-1"])

    def test_rotate_rejects_play_ideas(self) -> None:
        invalid = rotate("candidate-1")
        invalid["playIdeas"] = copy.deepcopy(keep("candidate-1")["playIdeas"])
        with self.assertRaisesRegex(ValueError, "cannot"):
            validate_semantic_results({"candidates": [invalid]}, ["candidate-1"])


def keep(candidate_id: str) -> dict:
    return {
        "candidateId": candidate_id,
        "isToy": True,
        "name": "soft toy dog",
        "category": "Soft toy",
        "recommendation": "KEEP",
        "reason": "Suitable for imaginative play.",
        "confidence": 0.9,
        "playIdeas": [
            {"title": "Animal walk", "description": "Take the dog on a pretend walk."},
            {"title": "Vet visit", "description": "Pretend to give the dog a check-up."},
        ],
    }


def rotate(candidate_id: str) -> dict:
    value = keep(candidate_id)
    value["recommendation"] = "ROTATE"
    value["playIdeas"] = []
    return value


def non_toy(candidate_id: str) -> dict:
    return {
        "candidateId": candidate_id,
        "isToy": False,
        "name": None,
        "category": None,
        "recommendation": None,
        "reason": None,
        "confidence": None,
        "playIdeas": [],
    }


if __name__ == "__main__":
    unittest.main()
