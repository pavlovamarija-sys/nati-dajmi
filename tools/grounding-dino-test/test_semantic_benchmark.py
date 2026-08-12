import hashlib
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))

from benchmark_semantic import (
    CONFIGURATIONS,
    acceptable_recognition_ids,
    create_semantic_copies,
    select_winner,
)


class SemanticBenchmarkTests(unittest.TestCase):
    def test_semantic_copy_resizes_without_upscaling_or_mutating_source(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            large = root / "candidate-1.jpg"
            small = root / "candidate-2.jpg"
            Image.new("RGB", (1484, 931), "coral").save(large, "JPEG")
            Image.new("RGB", (320, 240), "green").save(small, "JPEG")
            source_hashes = {path: sha256(path) for path in (large, small)}

            copies = create_semantic_copies(
                [("candidate-1", large), ("candidate-2", small)],
                root / "derived",
                max_side=768,
                quality=88,
            )

            with Image.open(copies[0][1]) as image:
                self.assertEqual(image.size, (768, 482))
            with Image.open(copies[1][1]) as image:
                self.assertEqual(image.size, (320, 240))
            self.assertEqual(
                source_hashes,
                {path: sha256(path) for path in (large, small)},
            )

    def test_benchmark_matrix_keeps_prompt_variables_constant(self) -> None:
        self.assertEqual(
            [(item.name, item.max_side, item.detail) for item in CONFIGURATIONS],
            [
                ("original-high", None, "high"),
                ("768-low", 768, "low"),
                ("512-low", 512, "low"),
                ("768-high", 768, "high"),
            ],
        )

    def test_winner_is_lowest_input_token_configuration_with_three_correct(self) -> None:
        results = [
            benchmark_result("incorrect-cheap", 100, 1.0, False),
            benchmark_result("correct-expensive", 400, 1.0, True),
            benchmark_result("correct-cheap", 200, 2.0, True),
        ]
        self.assertEqual(select_winner(results)["name"], "correct-cheap")

    def test_expected_sample_names_are_scored_conservatively(self) -> None:
        result = {
            "candidates": [
                candidate("candidate-1", "Paw Patrol plush dog"),
                candidate("candidate-2", "Plastic horse figure"),
                candidate("candidate-3", "Soft interactive dog"),
            ]
        }
        self.assertEqual(
            acceptable_recognition_ids(result),
            {"candidate-1", "candidate-2", "candidate-3"},
        )


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def benchmark_result(
    name: str, input_tokens: int, duration_seconds: float, all_three_correct: bool
) -> dict:
    return {
        "name": name,
        "usage": {"inputTokens": input_tokens},
        "durationSeconds": duration_seconds,
        "allThreeCorrect": all_three_correct,
    }


def candidate(candidate_id: str, name: str) -> dict:
    return {"candidateId": candidate_id, "name": name, "isToy": True}


if __name__ == "__main__":
    unittest.main()
