import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from detect import (
    Detection,
    intersection_over_union,
    non_maximum_suppression,
    suppress_contained_subparts,
    suppress_union_boxes,
)


class PostProcessingTests(unittest.TestCase):
    def test_nms_is_class_agnostic(self) -> None:
        detections = [
            box("toy", 0.9, 10, 10, 90, 90),
            box("plush toy", 0.7, 12, 12, 88, 88),
        ]
        self.assertEqual(non_maximum_suppression(detections, 0.5), [detections[0]])

    def test_neighboring_toys_are_not_merged(self) -> None:
        left = box("toy", 0.8, 0, 0, 50, 50)
        right = box("toy", 0.7, 45, 0, 95, 50)
        self.assertLess(intersection_over_union(left, right), 0.5)
        self.assertEqual(len(non_maximum_suppression([left, right], 0.5)), 2)

    def test_large_union_box_is_suppressed(self) -> None:
        union = box("toy", 0.75, 0, 0, 200, 100)
        left = box("plush toy", 0.8, 5, 5, 85, 95)
        right = box("animal figure", 0.7, 115, 5, 195, 95)
        self.assertEqual(suppress_union_boxes([union, left, right]), [left, right])

    def test_single_child_does_not_suppress_large_box(self) -> None:
        parent = box("toy", 0.7, 0, 0, 100, 100)
        child = box("plush toy", 0.8, 10, 10, 80, 80)
        self.assertEqual(suppress_union_boxes([parent, child]), [parent, child])

    def test_weak_contained_subpart_is_suppressed(self) -> None:
        parent = box("stuffed toy", 0.5, 0, 0, 100, 100)
        subpart = box("toy", 0.3, 25, 25, 65, 65)
        self.assertEqual(suppress_contained_subparts([parent, subpart]), [parent])


def box(
    label: str,
    confidence: float,
    x1: int,
    y1: int,
    x2: int,
    y2: int,
) -> Detection:
    return Detection(label, confidence, x1, y1, x2, y2)


if __name__ == "__main__":
    unittest.main()
