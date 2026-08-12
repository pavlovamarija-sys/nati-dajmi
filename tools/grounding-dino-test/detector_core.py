from __future__ import annotations

import os
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CACHE_DIR = ROOT / ".cache"
os.environ.setdefault("HF_HOME", str(CACHE_DIR))
os.environ.setdefault("HF_HUB_OFFLINE", "1")

import torch
from PIL import Image
from transformers import AutoModelForZeroShotObjectDetection, AutoProcessor

from detect import (
    GENERIC_PROMPT,
    MODEL_ID,
    build_detections,
    filter_candidates,
    non_maximum_suppression,
    sort_candidates,
    suppress_contained_subparts,
    suppress_union_boxes,
)


BOX_THRESHOLD = 0.20
TEXT_THRESHOLD = 0.20
CANDIDATE_CONFIDENCE = 0.20
NMS_IOU_THRESHOLD = 0.50


class GroundingDinoDetector:
    """Long-lived local detector using the proven PoC post-processing settings."""

    def __init__(self) -> None:
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.processor = AutoProcessor.from_pretrained(
            MODEL_ID, cache_dir=CACHE_DIR, local_files_only=True
        )
        self.model = AutoModelForZeroShotObjectDetection.from_pretrained(
            MODEL_ID, cache_dir=CACHE_DIR, local_files_only=True
        ).to(self.device)
        self.model.eval()
        self._inference_lock = threading.Lock()

    def detect(self, image: Image.Image) -> list[dict]:
        rgb_image = image.convert("RGB")
        inputs = self.processor(
            images=rgb_image, text=GENERIC_PROMPT, return_tensors="pt"
        ).to(self.device)

        with self._inference_lock, torch.inference_mode():
            outputs = self.model(**inputs)

        results = self.processor.post_process_grounded_object_detection(
            outputs,
            inputs.input_ids,
            box_threshold=BOX_THRESHOLD,
            text_threshold=TEXT_THRESHOLD,
            target_sizes=[rgb_image.size[::-1]],
        )[0]
        detections = build_detections(results, *rgb_image.size)
        filtered = filter_candidates(
            detections,
            image_width=rgb_image.width,
            image_height=rgb_image.height,
            minimum_confidence=CANDIDATE_CONFIDENCE,
            minimum_area_ratio=0.0,
            maximum_area_ratio=1.0,
        )
        candidates = suppress_union_boxes(filtered)
        candidates = suppress_contained_subparts(candidates)
        candidates = non_maximum_suppression(candidates, NMS_IOU_THRESHOLD)
        candidates = sort_candidates(candidates)

        return [
            {
                "candidateId": f"candidate-{index}",
                "confidence": round(candidate.confidence, 6),
                "boundingBox": candidate.normalized(*rgb_image.size),
            }
            for index, candidate in enumerate(candidates, start=1)
        ]

