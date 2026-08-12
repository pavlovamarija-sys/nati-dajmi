import http.client
import json
import sys
import threading
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from server import create_server


class FakeDevice:
    type = "cpu"


class FakeDetector:
    device = FakeDevice()

    def detect(self, image):
        return [
            {
                "candidateId": "candidate-1",
                "confidence": 0.9,
                "boundingBox": {"x": 0.1, "y": 0.2, "width": 0.3, "height": 0.4},
            }
        ]


class ServerEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        self.server = create_server("127.0.0.1", 0, FakeDetector())
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.connection = http.client.HTTPConnection(
            "127.0.0.1", self.server.server_address[1], timeout=5
        )

    def tearDown(self) -> None:
        self.connection.close()
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)

    def test_health(self) -> None:
        self.connection.request("GET", "/health")
        response = self.connection.getresponse()
        body = json.loads(response.read())
        self.assertEqual(response.status, 200)
        self.assertEqual(body["status"], "ok")
        self.assertEqual(body["device"], "cpu")

    def test_detect_toys_accepts_multipart_image(self) -> None:
        image = (Path(__file__).parent / "three-toy-photo.jpg").read_bytes()
        boundary = "local-detector-test"
        body = (
            f"--{boundary}\r\n"
            'Content-Disposition: form-data; name="image"; filename="photo.jpg"\r\n'
            "Content-Type: image/jpeg\r\n\r\n"
        ).encode() + image + f"\r\n--{boundary}--\r\n".encode()
        self.connection.request(
            "POST",
            "/detect-toys",
            body=body,
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        )
        response = self.connection.getresponse()
        value = json.loads(response.read())
        self.assertEqual(response.status, 200)
        self.assertGreater(value["imageWidth"], 0)
        self.assertEqual(value["candidates"][0]["candidateId"], "candidate-1")


if __name__ == "__main__":
    unittest.main()
