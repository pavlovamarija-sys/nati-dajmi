from __future__ import annotations

import argparse
import io
import json
from email.parser import BytesParser
from email.policy import default
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Protocol

from PIL import Image, UnidentifiedImageError

from detect import MODEL_ID
from detector_core import GroundingDinoDetector


MAX_UPLOAD_BYTES = 20 * 1024 * 1024


class Detector(Protocol):
    device: object

    def detect(self, image: Image.Image) -> list[dict]: ...


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the local toy detector HTTP service.")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", default=8000, type=int)
    return parser.parse_args()


def create_server(host: str, port: int, detector: Detector) -> ThreadingHTTPServer:
    class Handler(LocalDetectorHandler):
        pass

    Handler.detector = detector
    return ThreadingHTTPServer((host, port), Handler)


class LocalDetectorHandler(BaseHTTPRequestHandler):
    detector: Detector

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self._cors_headers()
        self.end_headers()

    def do_GET(self) -> None:
        if self.path != "/health":
            self._json({"error": "Not found."}, 404)
            return

        device = getattr(self.detector.device, "type", str(self.detector.device))
        self._json({"status": "ok", "model": MODEL_ID, "device": device})

    def do_POST(self) -> None:
        if self.path != "/detect-toys":
            self._json({"error": "Not found."}, 404)
            return

        try:
            image_bytes = self._read_multipart_image()
            with Image.open(io.BytesIO(image_bytes)) as opened:
                image = opened.convert("RGB")
            candidates = self.detector.detect(image)
        except ValueError as error:
            self._json({"error": str(error)}, 400)
            return
        except (UnidentifiedImageError, OSError):
            self._json({"error": "Uploaded file is not a supported image."}, 400)
            return
        except Exception as error:
            print(
                json.dumps(
                    {"event": "detector_failed", "errorType": type(error).__name__}
                )
            )
            self._json({"error": "Detection failed."}, 500)
            return

        self._json(
            {
                "imageWidth": image.width,
                "imageHeight": image.height,
                "candidates": candidates,
            }
        )

    def _read_multipart_image(self) -> bytes:
        content_type = self.headers.get("Content-Type", "")
        if not content_type.lower().startswith("multipart/form-data"):
            raise ValueError("Content-Type must be multipart/form-data.")

        content_length_text = self.headers.get("Content-Length", "")
        try:
            content_length = int(content_length_text)
        except ValueError as error:
            raise ValueError("Content-Length is required.") from error

        if content_length <= 0 or content_length > MAX_UPLOAD_BYTES:
            raise ValueError("Image upload must be between 1 byte and 20 MB.")

        body = self.rfile.read(content_length)
        message = BytesParser(policy=default).parsebytes(
            b"Content-Type: " + content_type.encode("ascii") + b"\r\n\r\n" + body
        )
        if not message.is_multipart():
            raise ValueError("Malformed multipart request.")

        for part in message.iter_parts():
            if part.get_param("name", header="content-disposition") != "image":
                continue
            payload = part.get_payload(decode=True)
            if payload:
                return payload
        raise ValueError("Multipart field 'image' is required.")

    def _json(self, value: object, status: int = 200) -> None:
        body = json.dumps(value).encode("utf-8")
        self.send_response(status)
        self._cors_headers()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _cors_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def log_message(self, format: str, *args: object) -> None:
        print(f"[local-detector] {self.address_string()} {format % args}")


def main() -> None:
    args = parse_args()
    print(f"Loading {MODEL_ID} from the local cache...")
    detector = GroundingDinoDetector()
    server = create_server(args.host, args.port, detector)
    print(
        f"Local detector listening on http://{args.host}:{args.port} "
        f"({detector.device.type})."
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()

