from __future__ import annotations

import argparse
import json
import os
import time
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CACHE_DIR = ROOT / ".cache"
os.environ.setdefault("HF_HOME", str(CACHE_DIR))
os.environ.setdefault("HF_HUB_OFFLINE", "1")

import torch
from PIL import Image, ImageDraw, ImageFont
from transformers import AutoModelForZeroShotObjectDetection, AutoProcessor


MODEL_ID = "IDEA-Research/grounding-dino-tiny"
GENERIC_PROMPT = (
    "toy . stuffed toy . plush toy . animal figure . toy figure . children's toy"
)
SPECIFIC_PROMPT = "plush dog . plush puppy . horse figure . Paw Patrol plush"


@dataclass(frozen=True)
class Detection:
    label: str
    confidence: float
    x1: int
    y1: int
    x2: int
    y2: int

    def normalized(self, image_width: int, image_height: int) -> dict[str, float]:
        return {
            "x": self.x1 / image_width,
            "y": self.y1 / image_height,
            "width": (self.x2 - self.x1) / image_width,
            "height": (self.y2 - self.y1) / image_height,
        }

    @property
    def area(self) -> int:
        return (self.x2 - self.x1) * (self.y2 - self.y1)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run local Grounding DINO toy detection and save visual outputs."
    )
    parser.add_argument("--image", required=True, type=Path)
    parser.add_argument("--box-threshold", default=0.20, type=threshold)
    parser.add_argument("--text-threshold", default=0.20, type=threshold)
    parser.add_argument("--candidate-confidence", default=0.20, type=threshold)
    parser.add_argument("--nms-iou-threshold", default=0.50, type=threshold)
    parser.add_argument("--min-area-ratio", default=0.0, type=area_ratio)
    parser.add_argument("--max-area-ratio", default=1.0, type=area_ratio)
    parser.add_argument(
        "--prompt-mode",
        choices=("both", "generic", "specific"),
        default="generic",
    )
    parser.add_argument("--output-dir", type=Path, default=Path("output"))
    return parser.parse_args()


def threshold(value: str) -> float:
    parsed = float(value)
    if not 0 < parsed < 1:
        raise argparse.ArgumentTypeError("threshold must be between 0 and 1")
    return parsed


def area_ratio(value: str) -> float:
    parsed = float(value)
    if not 0 <= parsed <= 1:
        raise argparse.ArgumentTypeError("area ratio must be between 0 and 1")
    return parsed


def main() -> None:
    args = parse_args()
    image_path = args.image.expanduser().resolve()
    if not image_path.is_file():
        raise SystemExit(f"Image does not exist: {image_path}")

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Model: {MODEL_ID}")
    print(f"Device: {device.type}")
    if device.type == "cuda":
        print(f"GPU: {torch.cuda.get_device_name(0)}")
    else:
        print("CUDA unavailable; CPU inference may be slow.")

    load_started = time.perf_counter()
    processor = AutoProcessor.from_pretrained(
        MODEL_ID, cache_dir=CACHE_DIR, local_files_only=True
    )
    model = AutoModelForZeroShotObjectDetection.from_pretrained(
        MODEL_ID, cache_dir=CACHE_DIR, local_files_only=True
    ).to(device)
    model.eval()
    print(f"Model load/download time: {time.perf_counter() - load_started:.2f}s")

    with Image.open(image_path) as opened_image:
        image = opened_image.convert("RGB")

    prompts = {
        "generic": GENERIC_PROMPT,
        "specific": SPECIFIC_PROMPT,
    }
    modes = prompts.keys() if args.prompt_mode == "both" else (args.prompt_mode,)

    for mode in modes:
        run_detection(
            image=image,
            prompt=prompts[mode],
            mode=mode,
            output_dir=(ROOT / args.output_dir / mode).resolve(),
            processor=processor,
            model=model,
            device=device,
            box_threshold=args.box_threshold,
            text_threshold=args.text_threshold,
            candidate_confidence=args.candidate_confidence,
            nms_iou_threshold=args.nms_iou_threshold,
            min_area_ratio=args.min_area_ratio,
            max_area_ratio=args.max_area_ratio,
        )


def run_detection(
    *,
    image: Image.Image,
    prompt: str,
    mode: str,
    output_dir: Path,
    processor: AutoProcessor,
    model: AutoModelForZeroShotObjectDetection,
    device: torch.device,
    box_threshold: float,
    text_threshold: float,
    candidate_confidence: float,
    nms_iou_threshold: float,
    min_area_ratio: float,
    max_area_ratio: float,
) -> None:
    print(f"\n[{mode}] Prompt: {prompt}")
    inputs = processor(images=image, text=prompt, return_tensors="pt").to(device)

    started = time.perf_counter()
    with torch.inference_mode():
        outputs = model(**inputs)
    inference_seconds = time.perf_counter() - started

    results = processor.post_process_grounded_object_detection(
        outputs,
        inputs.input_ids,
        box_threshold=box_threshold,
        text_threshold=text_threshold,
        target_sizes=[image.size[::-1]],
    )[0]
    detections = build_detections(results, *image.size)
    confidence_filtered = filter_candidates(
        detections,
        image_width=image.width,
        image_height=image.height,
        minimum_confidence=candidate_confidence,
        minimum_area_ratio=min_area_ratio,
        maximum_area_ratio=max_area_ratio,
    )
    without_union_boxes = suppress_union_boxes(confidence_filtered)
    without_subparts = suppress_contained_subparts(without_union_boxes)
    candidates = non_maximum_suppression(without_subparts, nms_iou_threshold)
    candidates = sort_candidates(candidates)

    print(f"Inference time: {inference_seconds:.2f}s")
    print(f"Raw detections: {len(detections)}")
    print(f"After confidence filtering: {len(confidence_filtered)}")
    print(f"After duplicate suppression: {len(candidates)}")
    print(f"Final candidate count: {len(candidates)}")

    output_dir.mkdir(parents=True, exist_ok=True)
    annotated = image.copy()
    draw = ImageDraw.Draw(annotated)
    font = ImageFont.load_default()

    for index, detection in enumerate(detections, start=1):
        normalized = detection.normalized(*image.size)
        print(
            json.dumps(
                {
                    "index": index,
                    "label": detection.label,
                    "confidence": round(detection.confidence, 6),
                    "x1": detection.x1,
                    "y1": detection.y1,
                    "x2": detection.x2,
                    "y2": detection.y2,
                    "normalized": normalized,
                },
                ensure_ascii=False,
            )
        )

        draw.rectangle(
            (detection.x1, detection.y1, detection.x2, detection.y2),
            outline="#EF6F51",
            width=max(3, min(image.size) // 300),
        )
        caption = f"{index}: {detection.label} {detection.confidence:.2f}"
        text_box = draw.textbbox((detection.x1, detection.y1), caption, font=font)
        draw.rectangle(text_box, fill="#FFF4E8")
        draw.text((detection.x1, detection.y1), caption, fill="#332C27", font=font)

    annotated.save(output_dir / "detections.jpg", quality=95, subsampling=0)
    print(f"Annotated image: {output_dir / 'detections.jpg'}")
    save_candidates(image, candidates, output_dir)


def build_detections(results: dict, image_width: int, image_height: int) -> list[Detection]:
    detections: list[Detection] = []
    labels = results.get("text_labels", results.get("labels", []))

    for box, score, label in zip(results["boxes"], results["scores"], labels):
        x1, y1, x2, y2 = (float(value) for value in box.tolist())
        left = max(0, min(image_width - 1, int(round(x1))))
        top = max(0, min(image_height - 1, int(round(y1))))
        right = max(left + 1, min(image_width, int(round(x2))))
        bottom = max(top + 1, min(image_height, int(round(y2))))
        detections.append(
            Detection(
                label=str(label),
                confidence=float(score.item()),
                x1=left,
                y1=top,
                x2=right,
                y2=bottom,
            )
        )

    return detections


def filter_candidates(
    detections: list[Detection],
    *,
    image_width: int,
    image_height: int,
    minimum_confidence: float,
    minimum_area_ratio: float,
    maximum_area_ratio: float,
) -> list[Detection]:
    image_area = image_width * image_height
    return [
        detection
        for detection in detections
        if detection.confidence >= minimum_confidence
        and minimum_area_ratio <= detection.area / image_area <= maximum_area_ratio
    ]


def suppress_union_boxes(detections: list[Detection]) -> list[Detection]:
    """Suppress a large region only when it encloses two distinct strong boxes.

    A smaller box counts as contained when at least 85% of its area lies inside the
    large box, it is at most 65% of the large area, and its confidence is no more
    than 0.15 below the large box. Two contained boxes must have IoU below 0.30 so
    duplicate detections of one object cannot trigger union suppression.
    """
    suppressed: set[int] = set()

    for large_index, large in enumerate(detections):
        contained = [
            (index, candidate)
            for index, candidate in enumerate(detections)
            if index != large_index
            and candidate.area <= large.area * 0.65
            and intersection_area(large, candidate) / candidate.area >= 0.85
            and candidate.confidence >= large.confidence - 0.15
        ]

        has_two_distinct_children = any(
            intersection_over_union(left, right) < 0.30
            for left_index, (_, left) in enumerate(contained)
            for _, right in contained[left_index + 1 :]
        )

        if has_two_distinct_children:
            suppressed.add(large_index)

    return [
        detection
        for index, detection in enumerate(detections)
        if index not in suppressed
    ]


def non_maximum_suppression(
    detections: list[Detection], iou_threshold: float
) -> list[Detection]:
    ordered = sorted(
        detections,
        key=lambda item: (-item.confidence, item.area, item.y1, item.x1),
    )
    selected: list[Detection] = []

    for detection in ordered:
        if all(
            intersection_over_union(detection, retained) < iou_threshold
            for retained in selected
        ):
            selected.append(detection)

    return selected


def suppress_contained_subparts(detections: list[Detection]) -> list[Detection]:
    """Remove a weak inner part when a stronger whole-object box encloses it."""
    suppressed: set[int] = set()

    for child_index, child in enumerate(detections):
        for parent_index, parent in enumerate(detections):
            if child_index == parent_index:
                continue
            if (
                child.area <= parent.area * 0.50
                and intersection_area(parent, child) / child.area >= 0.85
                and parent.confidence >= child.confidence + 0.10
            ):
                suppressed.add(child_index)
                break

    return [
        detection
        for index, detection in enumerate(detections)
        if index not in suppressed
    ]


def intersection_over_union(left: Detection, right: Detection) -> float:
    intersection = intersection_area(left, right)
    union = left.area + right.area - intersection
    return intersection / union if union > 0 else 0.0


def intersection_area(left: Detection, right: Detection) -> int:
    width = max(0, min(left.x2, right.x2) - max(left.x1, right.x1))
    height = max(0, min(left.y2, right.y2) - max(left.y1, right.y1))
    return width * height


def sort_candidates(detections: list[Detection]) -> list[Detection]:
    return sorted(
        detections,
        key=lambda item: (
            (item.y1 + item.y2) / 2,
            (item.x1 + item.x2) / 2,
            -item.confidence,
        ),
    )


def save_candidates(
    image: Image.Image, candidates: list[Detection], output_dir: Path
) -> None:
    annotated = image.copy()
    draw = ImageDraw.Draw(annotated)
    font = ImageFont.load_default()
    crops_dir = output_dir / "candidates"
    crops_dir.mkdir(parents=True, exist_ok=True)

    for index, candidate in enumerate(candidates, start=1):
        candidate_id = f"candidate-{index}"
        print(
            json.dumps(
                {
                    "candidateId": candidate_id,
                    "sourceLabel": candidate.label,
                    "confidence": round(candidate.confidence, 6),
                    "x1": candidate.x1,
                    "y1": candidate.y1,
                    "x2": candidate.x2,
                    "y2": candidate.y2,
                    "normalized": candidate.normalized(*image.size),
                },
                ensure_ascii=False,
            )
        )
        draw.rectangle(
            (candidate.x1, candidate.y1, candidate.x2, candidate.y2),
            outline="#2E8B57",
            width=max(3, min(image.size) // 300),
        )
        caption = f"Candidate {index}"
        text_box = draw.textbbox((candidate.x1, candidate.y1), caption, font=font)
        draw.rectangle(text_box, fill="#F0FAF3")
        draw.text((candidate.x1, candidate.y1), caption, fill="#214F37", font=font)
        image.crop((candidate.x1, candidate.y1, candidate.x2, candidate.y2)).save(
            crops_dir / f"{candidate_id}.jpg", quality=95, subsampling=0
        )

    candidates_path = output_dir / "candidates.jpg"
    annotated.save(candidates_path, quality=95, subsampling=0)
    print(f"Candidate image: {candidates_path}")


if __name__ == "__main__":
    main()
