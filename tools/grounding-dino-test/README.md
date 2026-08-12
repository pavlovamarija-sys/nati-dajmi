# Local Grounding DINO proof of concept

This folder is isolated from the Expo and Supabase production paths. It runs
Grounding DINO locally and never uploads the test image.

## Requirements

- Windows and Python 3.10–3.12 (Python 3.11 is used here).
- PyTorch is required.
- CUDA is optional. The script automatically uses CUDA when PyTorch can see it,
  otherwise it uses CPU.
- `IDEA-Research/grounding-dino-tiny` downloads about 689 MB of model weights on
  first use, plus configuration files. PyTorch and its dependencies require
  additional disk space.
- CPU inference is supported but may take minutes per prompt on a large image.

The machine's existing Python 3.14 installation is not used because compatible
PyTorch wheels are not presently available for this PoC stack.

## Environment setup used on this machine

Python 3.11 is installed side-by-side for the current Windows user and is not added
to PATH. All computer-vision packages are installed only inside this folder's
`.venv`.

```powershell
cd "D:\ToyExchange App\tools\grounding-dino-test"
Invoke-WebRequest `
  -Uri "https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe" `
  -OutFile "$env:TEMP\python-3.11.9-amd64.exe"
& "$env:TEMP\python-3.11.9-amd64.exe" /quiet `
  Include_pip=1 Include_launcher=0 `
  InstallAllUsers=0 PrependPath=0 Include_test=0
& "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe" -m venv .venv
& ".\.venv\Scripts\python.exe" -m pip install --upgrade pip
& ".\.venv\Scripts\python.exe" -m pip install -r requirements.txt
```

For a CUDA system, replace the default PyTorch package with the wheel command
recommended by the current PyTorch installation selector for the installed CUDA
version. Do not install CUDA wheels unless the machine has a compatible NVIDIA GPU.

## Run

The default run evaluates only the generic high-recall prompt and then performs
class-agnostic spatial deduplication:

```powershell
& ".\.venv\Scripts\python.exe" detect.py `
  --image "C:\path\to\three-toy-photo.jpg" `
  --box-threshold 0.20 `
  --text-threshold 0.20
```

The specific prompt remains available only for debugging:

```powershell
& ".\.venv\Scripts\python.exe" detect.py `
  --image "C:\path\to\photo.jpg" `
  --prompt-mode specific
```

Outputs are written without changing the source image:

- `output/generic/detections.jpg`
- `output/generic/candidates.jpg`
- `output/generic/candidates/candidate-1.jpg`, etc.
- `output/specific/detections.jpg`

Candidate post-processing defaults:

- candidate confidence: `0.20`
- class-agnostic NMS IoU: `0.50`
- minimum/maximum area ratios: `0.0` / `1.0` (disabled by default)

All can be overridden with `--candidate-confidence`, `--nms-iou-threshold`,
`--min-area-ratio`, and `--max-area-ratio`.

A likely union box is suppressed only when it contains at least two spatially
distinct, similarly strong smaller boxes. Each child must be at most 65% of the
large box, at least 85% contained, and no more than 0.15 below its confidence. The
two children must have IoU below 0.30. This avoids treating duplicate boxes for one
object as evidence that a large box contains several objects.

After union suppression, a weak internal subpart is removed only when at least 85%
of it is inside a stronger whole-object box, its area is at most 50% of the parent,
and the parent confidence is at least 0.10 higher. This removes detections such as a
toy's embedded activity panel without merging nearby physical toys.

The Hugging Face model cache is kept inside `.cache` so the entire PoC remains
local to this folder. After the first model download, detection uses
`local_files_only=True` and makes no network requests.

## Local semantic candidate analysis

Grounding DINO remains responsible for the candidate inventory. The semantic script
sends only the final candidate crops to OpenAI in one batched Responses API request.

Set the API key only in the current local shell, then run:

```powershell
$env:OPENAI_API_KEY="your-local-key"
& ".\.venv\Scripts\python.exe" analyze_candidates.py `
  --candidates "output\generic\candidates" `
  --child-age-months 30
```

The key is never printed or written to disk. Validated results are saved to:

- `output/generic/semantic-results.json`

The script rejects missing, unknown, or duplicate candidate IDs and validates the
recommendation-specific play-idea rules before saving anything.

## Semantic input optimization benchmark

The benchmark keeps the original candidate crops unchanged and creates optimized
JPEG copies under:

- `output/generic/semantic-inputs/512/`
- `output/generic/semantic-inputs/768/`

It compares the same candidate IDs, child age, prompt, schema, and batch shape for
`original/high`, `768/low`, `512/low`, and `768/high`:

```powershell
$env:OPENAI_API_KEY="your-local-key"
& ".\.venv\Scripts\python.exe" benchmark_semantic.py `
  --candidates "output\generic\candidates" `
  --child-age-months 30 `
  --jpeg-quality 88
```

Results are written separately to
`output/generic/semantic-benchmark.json`; the existing
`output/generic/semantic-results.json` is not changed. The recommended
configuration is the lowest-input-token option that still recognizes all three
known sample toys acceptably. If `OPENAI_API_KEY` is absent, the command creates
the derived images and records a blocked benchmark status without making or
fabricating API calls.

## Development detector HTTP service

The service keeps the Grounding DINO model loaded and exposes only normalized
candidate regions. It uses the same generic prompt, thresholds, NMS, union-box
suppression, subpart suppression, and ordering as `detect.py`.

```powershell
cd "D:\ToyExchange App\tools\grounding-dino-test"
& ".\.venv\Scripts\python.exe" server.py --host 0.0.0.0 --port 8000
```

Endpoints:

- `GET /health`
- `POST /detect-toys` with multipart field `image`

For Expo Go on a physical phone, find the development computer's IPv4 address:

```powershell
ipconfig
```

Put the LAN address reachable by the phone in the app's local `.env`, for example:

```dotenv
EXPO_PUBLIC_LOCAL_DETECTOR_URL=http://192.168.1.25:8000
```

Restart Metro after changing `.env`. Do not use `127.0.0.1` or `localhost` from a
physical phone: those refer to the phone itself. The server's permissive CORS and
unauthenticated LAN endpoint are development conveniences, not a production
security or hosting design. When this variable is absent, the app retains its
existing server-first analysis path.
