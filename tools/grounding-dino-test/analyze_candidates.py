from __future__ import annotations

import argparse
import base64
import json
import os
import re
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"
OPENAI_MODEL = "gpt-4o-mini"
CANDIDATE_FILE_PATTERN = re.compile(r"^candidate-(\d+)\.jpg$", re.IGNORECASE)
RECOMMENDATIONS = {"KEEP", "ROTATE", "PASS_ON"}
RESULT_KEYS = {
    "candidateId",
    "isToy",
    "name",
    "category",
    "recommendation",
    "reason",
    "confidence",
    "playIdeas",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Analyze existing Grounding DINO candidate crops with OpenAI."
    )
    parser.add_argument("--candidates", required=True, type=Path)
    parser.add_argument("--child-age-months", required=True, type=positive_integer)
    parser.add_argument("--output", type=Path)
    return parser.parse_args()


def positive_integer(value: str) -> int:
    parsed = int(value)
    if parsed <= 0:
        raise argparse.ArgumentTypeError("value must be a positive integer")
    return parsed


def main() -> None:
    args = parse_args()
    candidate_dir = args.candidates.expanduser().resolve()
    candidates = discover_candidates(candidate_dir)
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()

    if not api_key:
        raise SystemExit(
            "OPENAI_API_KEY is not configured in this local shell. "
            "Set it temporarily and run the command again."
        )

    payload = build_request(candidates, args.child_age_months)
    response = create_response(payload, api_key)
    semantic_output = extract_structured_output(response)
    validated = validate_semantic_results(semantic_output, [item[0] for item in candidates])
    usage = parse_usage(response)
    output_path = (
        args.output.expanduser().resolve()
        if args.output
        else candidate_dir.parent / "semantic-results.json"
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(validated, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    print_summary(validated)
    print("\nUsage:")
    print(json.dumps(usage, ensure_ascii=False))
    print(f"Semantic results: {output_path}")


def discover_candidates(candidate_dir: Path) -> list[tuple[str, Path]]:
    if not candidate_dir.is_dir():
        raise SystemExit(f"Candidate directory does not exist: {candidate_dir}")

    candidates: list[tuple[int, str, Path]] = []
    for path in candidate_dir.iterdir():
        match = CANDIDATE_FILE_PATTERN.fullmatch(path.name) if path.is_file() else None
        if match:
            candidate_id = f"candidate-{int(match.group(1))}"
            candidates.append((int(match.group(1)), candidate_id, path.resolve()))

    if not candidates:
        raise SystemExit(f"No candidate-*.jpg files found in: {candidate_dir}")

    candidates.sort(key=lambda item: item[0])
    ids = [item[1] for item in candidates]
    if len(ids) != len(set(ids)):
        raise SystemExit("Candidate filenames produce duplicate candidate IDs.")

    return [(candidate_id, path) for _, candidate_id, path in candidates]


def build_request(
    candidates: list[tuple[str, Path]], child_age_months: int, detail: str = "high"
) -> dict[str, Any]:
    if detail not in {"low", "high"}:
        raise ValueError("Image detail must be low or high.")
    candidate_ids = [candidate_id for candidate_id, _ in candidates]
    user_content: list[dict[str, Any]] = [
        {
            "type": "input_text",
            "text": (
                f"The child is {child_age_months} months old. Analyze exactly the "
                f"{len(candidates)} supplied candidate crops. Each text label immediately "
                "before an image gives that image's candidateId. Return exactly one result "
                "for every supplied candidateId and do not create any other IDs."
            ),
        }
    ]

    for candidate_id, path in candidates:
        encoded = base64.b64encode(path.read_bytes()).decode("ascii")
        user_content.extend(
            [
                {"type": "input_text", "text": f"candidateId: {candidate_id}"},
                {
                    "type": "input_image",
                    "image_url": f"data:image/jpeg;base64,{encoded}",
                    "detail": detail,
                },
            ]
        )

    return {
        "model": OPENAI_MODEL,
        "store": False,
        "input": [
            {
                "role": "developer",
                "content": [{"type": "input_text", "text": semantic_instructions()}],
            },
            {"role": "user", "content": user_content},
        ],
        "text": {
            "format": {
                "type": "json_schema",
                "name": "candidate_semantic_analysis",
                "strict": True,
                "schema": semantic_schema(candidate_ids),
            }
        },
    }


def semantic_instructions() -> str:
    return """
You analyze only the supplied candidate crop images. Grounding DINO has already
defined the complete candidate inventory. Do not search for additional objects and
do not infer toys outside these crops.

For each supplied candidateId, decide whether the crop represents a toy. If isToy is
false, return null for name, category, recommendation, reason, and confidence, and
return an empty playIdeas array. If isToy is true, use a cautious useful name,
category or null, exactly one KEEP/ROTATE/PASS_ON recommendation, a concise
parent-friendly reason, and confidence from 0 to 1 or null. Use a licensed character
or product name only when clearly recognizable; otherwise prefer a generic visual
name such as soft toy dog, plush puppy, plastic horse figure, or stacking toy.

For every KEEP toy, return exactly 2 or 3 short, practical, age-appropriate play
ideas that use that specific toy, do not require buying products, and do not invent
capabilities. For ROTATE and PASS_ON, return an empty playIdeas array.
""".strip()


def semantic_schema(candidate_ids: list[str]) -> dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "candidates": {
                "type": "array",
                "minItems": len(candidate_ids),
                "maxItems": len(candidate_ids),
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "candidateId": {"type": "string", "enum": candidate_ids},
                        "isToy": {"type": "boolean"},
                        "name": {"type": ["string", "null"]},
                        "category": {"type": ["string", "null"]},
                        "recommendation": {
                            "type": ["string", "null"],
                            "enum": ["KEEP", "ROTATE", "PASS_ON", None],
                        },
                        "reason": {"type": ["string", "null"]},
                        "confidence": {
                            "type": ["number", "null"],
                            "minimum": 0,
                            "maximum": 1,
                        },
                        "playIdeas": {
                            "type": "array",
                            "maxItems": 3,
                            "items": {
                                "type": "object",
                                "additionalProperties": False,
                                "properties": {
                                    "title": {"type": "string"},
                                    "description": {"type": "string"},
                                },
                                "required": ["title", "description"],
                            },
                        },
                    },
                    "required": sorted(RESULT_KEYS),
                },
            }
        },
        "required": ["candidates"],
    }


def create_response(payload: dict[str, Any], api_key: str) -> dict[str, Any]:
    request = urllib.request.Request(
        OPENAI_RESPONSES_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            value = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:500]
        raise SystemExit(f"OpenAI request failed with HTTP {error.code}: {detail}") from error
    except urllib.error.URLError as error:
        raise SystemExit(f"OpenAI request could not be completed: {error.reason}") from error

    if not isinstance(value, dict):
        raise SystemExit("OpenAI returned a malformed top-level response.")
    return value


def extract_structured_output(response: dict[str, Any]) -> Any:
    for output in response.get("output", []):
        if not isinstance(output, dict):
            continue
        for content in output.get("content", []):
            if (
                isinstance(content, dict)
                and content.get("type") == "output_text"
                and isinstance(content.get("text"), str)
            ):
                try:
                    return json.loads(content["text"])
                except json.JSONDecodeError as error:
                    raise SystemExit("OpenAI structured output was not valid JSON.") from error
    raise SystemExit("OpenAI response contained no structured output text.")


def validate_semantic_results(value: Any, expected_ids: list[str]) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != {"candidates"}:
        raise ValueError("Semantic output must contain only candidates.")
    candidates = value["candidates"]
    if not isinstance(candidates, list) or len(candidates) != len(expected_ids):
        raise ValueError("Semantic output must contain exactly one result per candidate.")

    validated_by_id: dict[str, dict[str, Any]] = {}
    expected = set(expected_ids)
    for candidate in candidates:
        validated = validate_candidate(candidate)
        candidate_id = validated["candidateId"]
        if candidate_id not in expected:
            raise ValueError(f"Unknown candidateId: {candidate_id}")
        if candidate_id in validated_by_id:
            raise ValueError(f"Duplicate candidateId: {candidate_id}")
        validated_by_id[candidate_id] = validated

    missing = expected - set(validated_by_id)
    if missing:
        raise ValueError(f"Missing candidate IDs: {sorted(missing)}")

    return {"candidates": [validated_by_id[item] for item in expected_ids]}


def validate_candidate(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != RESULT_KEYS:
        raise ValueError("Candidate semantic result has invalid fields.")
    candidate_id = nonblank(value["candidateId"], "candidateId")
    is_toy = value["isToy"]
    if not isinstance(is_toy, bool):
        raise ValueError("isToy must be boolean.")

    play_ideas = validate_play_ideas(value["playIdeas"])
    if not is_toy:
        nullable_fields = ("name", "category", "recommendation", "reason", "confidence")
        if any(value[field] is not None for field in nullable_fields) or play_ideas:
            raise ValueError("A non-toy candidate must use null semantic fields and no play ideas.")
    else:
        value["name"] = nonblank(value["name"], "name")
        value["reason"] = nonblank(value["reason"], "reason")
        if value["category"] is not None:
            value["category"] = nonblank(value["category"], "category")
        if value["recommendation"] not in RECOMMENDATIONS:
            raise ValueError("Toy recommendation is invalid.")
        confidence = value["confidence"]
        if confidence is not None and (
            isinstance(confidence, bool)
            or not isinstance(confidence, (int, float))
            or not 0 <= confidence <= 1
        ):
            raise ValueError("confidence must be null or between 0 and 1.")
        if value["recommendation"] == "KEEP" and len(play_ideas) not in (2, 3):
            raise ValueError("KEEP candidates require exactly 2 or 3 play ideas.")
        if value["recommendation"] != "KEEP" and play_ideas:
            raise ValueError("ROTATE/PASS_ON candidates cannot have play ideas.")

    value["candidateId"] = candidate_id
    value["playIdeas"] = play_ideas
    return value


def validate_play_ideas(value: Any) -> list[dict[str, str]]:
    if not isinstance(value, list):
        raise ValueError("playIdeas must be an array.")
    ideas: list[dict[str, str]] = []
    for idea in value:
        if not isinstance(idea, dict) or set(idea) != {"title", "description"}:
            raise ValueError("Play idea has invalid fields.")
        ideas.append(
            {
                "title": nonblank(idea["title"], "play idea title"),
                "description": nonblank(idea["description"], "play idea description"),
            }
        )
    return ideas


def nonblank(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field} must be a nonblank string.")
    return value.strip()


def parse_usage(response: dict[str, Any]) -> dict[str, Any]:
    usage = response.get("usage")
    if not isinstance(usage, dict):
        return {
            "inputTokens": None,
            "outputTokens": None,
            "totalTokens": None,
            "inputTokenDetails": None,
        }
    return {
        "inputTokens": usage.get("input_tokens") if isinstance(usage.get("input_tokens"), int) else None,
        "outputTokens": usage.get("output_tokens") if isinstance(usage.get("output_tokens"), int) else None,
        "totalTokens": usage.get("total_tokens") if isinstance(usage.get("total_tokens"), int) else None,
        "inputTokenDetails": usage.get("input_tokens_details")
        if isinstance(usage.get("input_tokens_details"), dict)
        else None,
    }


def print_summary(result: dict[str, Any]) -> None:
    for candidate in result["candidates"]:
        print(f"\n{candidate['candidateId']}")
        print(f"Is toy: {candidate['isToy']}")
        print(f"Name: {candidate['name'] or '-'}")
        print(f"Recommendation: {candidate['recommendation'] or '-'}")
        print(f"Reason: {candidate['reason'] or '-'}")
        if candidate["playIdeas"]:
            print("Play ideas:")
            for index, idea in enumerate(candidate["playIdeas"], start=1):
                print(f"{index}. {idea['title']}: {idea['description']}")


if __name__ == "__main__":
    main()
