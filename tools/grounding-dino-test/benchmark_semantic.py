from __future__ import annotations

import argparse
import json
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from PIL import Image

from analyze_candidates import (
    build_request,
    create_response,
    discover_candidates,
    extract_structured_output,
    parse_usage,
    validate_semantic_results,
)


BASELINE_INPUT_TOKENS = 88_287
DEFAULT_JPEG_QUALITY = 88
RESAMPLING = Image.Resampling.LANCZOS


@dataclass(frozen=True)
class BenchmarkConfiguration:
    name: str
    max_side: int | None
    detail: str


CONFIGURATIONS = (
    BenchmarkConfiguration("original-high", None, "high"),
    BenchmarkConfiguration("768-low", 768, "low"),
    BenchmarkConfiguration("512-low", 512, "low"),
    BenchmarkConfiguration("768-high", 768, "high"),
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Benchmark semantic crop size/detail combinations with OpenAI."
    )
    parser.add_argument("--candidates", required=True, type=Path)
    parser.add_argument("--child-age-months", required=True, type=positive_integer)
    parser.add_argument("--jpeg-quality", default=DEFAULT_JPEG_QUALITY, type=jpeg_quality)
    parser.add_argument("--output", type=Path)
    return parser.parse_args()


def positive_integer(value: str) -> int:
    parsed = int(value)
    if parsed <= 0:
        raise argparse.ArgumentTypeError("value must be a positive integer")
    return parsed


def jpeg_quality(value: str) -> int:
    parsed = int(value)
    if not 1 <= parsed <= 100:
        raise argparse.ArgumentTypeError("JPEG quality must be between 1 and 100")
    return parsed


def main() -> None:
    args = parse_args()
    candidate_dir = args.candidates.expanduser().resolve()
    original_candidates = discover_candidates(candidate_dir)
    benchmark_path = (
        args.output.expanduser().resolve()
        if args.output
        else candidate_dir.parent / "semantic-benchmark.json"
    )
    prepared = prepare_configurations(
        original_candidates,
        candidate_dir.parent / "semantic-inputs",
        args.jpeg_quality,
    )
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()

    if not api_key:
        write_benchmark(
            benchmark_path,
            {
                "model": "gpt-4o-mini",
                "baselineInputTokens": BASELINE_INPUT_TOKENS,
                "jpegQuality": args.jpeg_quality,
                "status": "blocked_missing_openai_api_key",
                "configurations": [configuration_metadata(item) for item in prepared],
            },
        )
        raise SystemExit(
            "OPENAI_API_KEY is not configured. Semantic copies and benchmark metadata "
            f"were created at {benchmark_path}, but no API requests were made."
        )

    results: list[dict[str, Any]] = []
    expected_ids = [candidate_id for candidate_id, _ in original_candidates]
    for item in prepared:
        started = time.perf_counter()
        response = create_response(
            build_request(item["candidates"], args.child_age_months, item["detail"]),
            api_key,
        )
        duration = time.perf_counter() - started
        validated = validate_semantic_results(
            extract_structured_output(response), expected_ids
        )
        usage = parse_usage(response)
        correct_ids = acceptable_recognition_ids(validated)
        input_tokens = usage["inputTokens"]
        reduction = (
            (BASELINE_INPUT_TOKENS - input_tokens) / BASELINE_INPUT_TOKENS * 100
            if isinstance(input_tokens, int)
            else None
        )
        result = {
            **configuration_metadata(item),
            "durationSeconds": round(duration, 3),
            "usage": usage,
            "inputTokenReductionPercent": round(reduction, 2)
            if reduction is not None
            else None,
            "recognition": [
                {
                    "candidateId": candidate["candidateId"],
                    "name": candidate["name"],
                    "recommendation": candidate["recommendation"],
                    "acceptable": candidate["candidateId"] in correct_ids,
                }
                for candidate in validated["candidates"]
            ],
            "correctCount": len(correct_ids),
            "allThreeCorrect": len(correct_ids) == len(expected_ids),
            "semanticResult": validated,
        }
        results.append(result)
        print_configuration(result)

    winner = select_winner(results)
    write_benchmark(
        benchmark_path,
        {
            "model": "gpt-4o-mini",
            "baselineInputTokens": BASELINE_INPUT_TOKENS,
            "jpegQuality": args.jpeg_quality,
            "status": "completed",
            "configurations": results,
            "recommendedConfiguration": winner["name"] if winner else None,
        },
    )
    print(f"\nRecommended configuration: {winner['name'] if winner else 'none'}")
    print(f"Benchmark results: {benchmark_path}")


def prepare_configurations(
    originals: list[tuple[str, Path]], semantic_inputs_dir: Path, quality: int
) -> list[dict[str, Any]]:
    prepared: list[dict[str, Any]] = []
    for configuration in CONFIGURATIONS:
        candidates = originals
        if configuration.max_side is not None:
            output_dir = semantic_inputs_dir / str(configuration.max_side)
            candidates = create_semantic_copies(
                originals, output_dir, configuration.max_side, quality
            )
        prepared.append(
            {
                "name": configuration.name,
                "maxSide": configuration.max_side,
                "detail": configuration.detail,
                "candidates": candidates,
                "images": image_metadata(candidates),
            }
        )
    return prepared


def create_semantic_copies(
    originals: list[tuple[str, Path]], output_dir: Path, max_side: int, quality: int
) -> list[tuple[str, Path]]:
    output_dir.mkdir(parents=True, exist_ok=True)
    copies: list[tuple[str, Path]] = []
    for candidate_id, source in originals:
        destination = output_dir / source.name
        with Image.open(source) as opened:
            image = opened.convert("RGB")
            if max(image.size) > max_side:
                scale = max_side / max(image.size)
                target = (
                    max(1, round(image.width * scale)),
                    max(1, round(image.height * scale)),
                )
                image = image.resize(target, RESAMPLING)
            image.save(destination, "JPEG", quality=quality, optimize=True, subsampling=0)
        copies.append((candidate_id, destination.resolve()))
    return copies


def image_metadata(candidates: list[tuple[str, Path]]) -> list[dict[str, Any]]:
    metadata: list[dict[str, Any]] = []
    for candidate_id, path in candidates:
        with Image.open(path) as image:
            metadata.append(
                {
                    "candidateId": candidate_id,
                    "width": image.width,
                    "height": image.height,
                    "bytes": path.stat().st_size,
                    "path": str(path),
                }
            )
    return metadata


def configuration_metadata(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "name": item["name"],
        "maxSide": item["maxSide"],
        "detail": item["detail"],
        "images": item["images"],
    }


def acceptable_recognition_ids(result: dict[str, Any]) -> set[str]:
    expectations = {
        "candidate-1": {"paw", "marshall", "plush", "dog"},
        "candidate-2": {"horse"},
        "candidate-3": {"dog", "puppy", "interactive"},
    }
    accepted: set[str] = set()
    for candidate in result["candidates"]:
        name = (candidate["name"] or "").lower()
        expected_terms = expectations.get(candidate["candidateId"], set())
        if candidate["isToy"] and any(term in name for term in expected_terms):
            accepted.add(candidate["candidateId"])
    return accepted


def select_winner(results: list[dict[str, Any]]) -> dict[str, Any] | None:
    eligible = [item for item in results if item["allThreeCorrect"]]
    return min(
        eligible,
        key=lambda item: (
            item["usage"]["inputTokens"]
            if item["usage"]["inputTokens"] is not None
            else float("inf"),
            item["durationSeconds"],
        ),
        default=None,
    )


def print_configuration(result: dict[str, Any]) -> None:
    print(f"\nConfiguration: {result['name']} / detail={result['detail']}")
    for image in result["images"]:
        print(
            f"{image['candidateId']}: {image['width']}x{image['height']}, "
            f"{image['bytes'] / 1024:.1f} KB"
        )
    for recognition in result["recognition"]:
        print(
            f"{recognition['candidateId']} -> {recognition['name']} "
            f"({recognition['recommendation']}, acceptable={recognition['acceptable']})"
        )
    print(f"Usage: {json.dumps(result['usage'])}")
    print(f"Input-token reduction: {result['inputTokenReductionPercent']}%")
    print(f"Duration: {result['durationSeconds']}s")


def write_benchmark(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
