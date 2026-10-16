"""
Controlled single-image Qwen3-VL-4B inference for Character Set ID.
Reads the approved 500x896 derivative image. Never touches source or modifies project.
Outputs JSON result to stdout and to docs/qwen-character-id/inference-result.json.
"""
import sys, json, hashlib, base64, time
from pathlib import Path

sys.path.insert(0, 'F:/tool-ai-dh/local-ai-gateway')

from ai_gateway.gpu import gpu_snapshot, GPUReservation
from ai_gateway.gpu_policy import require_preload, require_postload
from ai_gateway.errors import GatewayError
from ai_gateway.visual import VisualRequest, PROMPT, VisualResult
from ai_gateway.qwen_runtime import QwenRuntime

REF_IMAGE = Path(__file__).parent / 'judge-set-id-reference.jpeg'
CHECKPOINT = Path('F:/Cooking-AI-review/models/qwen3-vl-4b')
OUT = Path(__file__).parent / 'inference-result.json'
EXPECTED_REF_SHA256 = '6050e6c5a2ce8a8d540d751b23a0d7245cb71599f61ec3cac37d2877313d62f4'
EXPECTED_SOURCE_SHA256 = '94304d0e23551917a4e4a9ca44a8f4cc7a59d39f0b22dcca7bf1987be2d0f46b'

from PIL import Image, ImageOps
import io, warnings

def load_image(path):
    raw = path.read_bytes()
    sha = hashlib.sha256(raw).hexdigest()
    assert sha == EXPECTED_REF_SHA256, f'Derivative SHA256 mismatch: {sha}'
    with warnings.catch_warnings():
        warnings.simplefilter('error', Image.DecompressionBombWarning)
        with Image.open(io.BytesIO(raw)) as im:
            assert im.format == 'JPEG'
            assert im.size == (500, 896)
        with Image.open(io.BytesIO(raw)) as im:
            im.load()
            normalized = ImageOps.exif_transpose(im).convert('RGB')
    return normalized, sha

def main():
    print('=== Qwen3-VL-4B Character Set ID Inference ===', file=sys.stderr)
    
    # Preflight
    snap = gpu_snapshot()
    print(f'GPU: {snap["name"]}, free={snap["free_mb"]:.0f}MB, compute_pids={snap["other_compute_pids"]}', file=sys.stderr)
    
    try:
        require_preload(snap)
    except GatewayError as e:
        result = {'status': 'BLOCKED', 'code': e.code, 'message': str(e)}
        OUT.write_text(json.dumps(result, indent=2), encoding='utf-8')
        print(json.dumps(result))
        return 1
    
    print('Gate: PASS. Loading model...', file=sys.stderr)
    
    # Load image before model (fail fast if image is bad)
    image, ref_sha = load_image(REF_IMAGE)
    print(f'Image loaded: {image.size}, sha256={ref_sha[:16]}...', file=sys.stderr)
    
    runtime = QwenRuntime(CHECKPOINT)
    reservation = GPUReservation()
    try:
        reservation.acquire()
        
        after_reserve = gpu_snapshot()
        require_preload(after_reserve)
        
        t_load = time.perf_counter()
        runtime.load()
        print(f'Model loaded in {time.perf_counter()-t_load:.1f}s', file=sys.stderr)
        
        after_load = gpu_snapshot()
        require_postload(after_load, runtime.model.hf_device_map,
                         [str(p.device) for p in runtime.model.parameters()])
        print('Post-load safety: PASS', file=sys.stderr)
        
        # Build messages: include system message to align with the updated PROMPT contract.
        # The system message reinforces the 8-16 segment descriptive ID requirement and
        # keeps the description concise to prevent repetition loops.
        messages = [
            {
                'role': 'system',
                'content': (
                    'You produce concise visual descriptions in JSON. '
                    'visual_id must be descriptive lowercase snake_case with 8 to 16 segments '
                    'encoding stable visible traits: age, gender, hair color, hair style, '
                    'glasses/accessories, clothing. Omit props, furniture and pose. '
                    'Keep visual_description under 300 characters. '
                    'Do not repeat sentences. '
                    'Output status "detected" when one person is clearly visible.'
                )
            },
            {
                'role': 'user',
                'content': [
                    {'type': 'image', 'image': image},
                    {'type': 'text', 'text': PROMPT},
                ]
            }
        ]

        # Generation schema for lmformatenforcer:
        # - maxLength: 380 on visual_description: stops before the repetition loop starts.
        #   The model produces a coherent first paragraph by ~300 chars; loops begin ~400+.
        #   380 gives a clean cutoff well within VisualResult's 600-char post-parse limit.
        #   Crucially, at 380 chars the description clearly shows ONE person → model should
        #   write status="detected" rather than "ambiguous".
        # - pattern on visual_id: lmformatenforcer enforces this token-by-token, preventing
        #   digits (e.g. "judge_01" → blocked; "adult_female_judge_robe" → allowed).
        schema = {
            "type": "object",
            "properties": {
                "status": {"type": "string", "enum": ["detected", "ambiguous", "no_human"]},
                "visual_id": {
                    "type": "string",
                    "pattern": "^[a-z]+(?:_[a-z]+){1,15}$",
                },
                "visual_description": {"type": "string", "maxLength": 380},
            },
            "required": ["status", "visual_id", "visual_description"],
            "additionalProperties": False,
        }

        print('Running inference...', file=sys.stderr)
        t_inf = time.perf_counter()
        raw, metrics = runtime.generate(
            messages=messages,
            images=[image],
            schema=schema,
            max_input_tokens=3072,
            max_new_tokens=768,
        )
        elapsed = time.perf_counter() - t_inf
        print(f'Inference complete in {elapsed:.1f}s. Raw: {raw!r}', file=sys.stderr)
        
        parsed = VisualResult.model_validate(
            __import__('json').loads(raw, object_pairs_hook=lambda pairs: dict(pairs))
        )
        
        result = {
            'status': 'OK',
            'reference_sha256': ref_sha,
            'source_sha256': EXPECTED_SOURCE_SHA256,
            'inference': parsed.model_dump(),
            'metrics': metrics,
        }
    except GatewayError as e:
        result = {'status': 'GATEWAY_ERROR', 'code': e.code, 'message': str(e)}
    except Exception as e:
        result = {'status': 'ERROR', 'type': type(e).__name__, 'message': str(e)}
    finally:
        try:
            runtime.close()
        except Exception:
            pass
        try:
            reservation.close()
        except Exception:
            pass
        image.close()
    
    OUT.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result.get('status') == 'OK' else 1

if __name__ == '__main__':
    raise SystemExit(main())
