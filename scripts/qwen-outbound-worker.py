"""One outbound Qwen consumer. No listener, Firebase admin credential or model loader."""
import argparse
import base64
import hashlib
import io
import ipaddress
import json
import os
from pathlib import Path
import re
import socket
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

from PIL import Image, ImageOps

DEFAULT_CONFIG = Path(os.environ.get('LOCALAPPDATA', '.')) / 'WebAI/QwenWorker/worker.private.json'


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def request(url, bearer=None, body=None, limit=800000, timeout=30):
    headers = {'Accept': 'application/json'}
    if bearer:
        headers['Authorization'] = 'Bearer ' + bearer
    if body is not None:
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None, headers=headers)
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    with opener.open(req, timeout=timeout) as res:
        data = res.read(limit + 1)
        if len(data) > limit:
            raise ValueError('RESPONSE_TOO_LARGE')
        return json.loads(data)


def validate_image_url(url, origin, project_id):
    parsed, base = urllib.parse.urlsplit(url), urllib.parse.urlsplit(origin)
    if (parsed.scheme != 'https' or parsed.netloc != base.netloc or base.scheme != 'https'
            or parsed.username or parsed.password or parsed.query or parsed.fragment
            or not parsed.path.startswith('/project_' + project_id + '/')
            or any(x in parsed.path for x in ['%', '\\', '..'])):
        raise ValueError('UNSAFE_IMAGE_URL')
    return parsed


def image_copy(data):
    # Original bytes are never overwritten or uploaded. EXIF rotation is preserved.
    Image.MAX_IMAGE_PIXELS = 24000000
    with Image.open(io.BytesIO(data)) as src:
        if src.format not in ('PNG', 'JPEG', 'WEBP') or src.width * src.height > 24000000 or getattr(src, 'n_frames', 1) != 1:
            raise ValueError('INVALID_IMAGE')
        src.load()
        normalized = ImageOps.exif_transpose(src).convert('RGB')
        normalized.thumbnail((896, 896), Image.Resampling.LANCZOS)
        for quality in (88, 78, 68, 58):
            out = io.BytesIO()
            normalized.save(out, format='JPEG', quality=quality, optimize=True)
            value = out.getvalue()
            if len(value) <= 512000:
                return value
    raise ValueError('IMAGE_TOO_LARGE')


def download_image(job, origin):
    parsed = validate_image_url(job['imageUrl'], origin, job['projectId'])
    # Resolve and pin a public destination; never follow redirects or forward credentials.
    addresses = socket.getaddrinfo(parsed.hostname, parsed.port or 443, socket.AF_INET, socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):
        raise ValueError('PRIVATE_ADDRESS')
    import http.client
    import ssl
    address = addresses[0][4][0]
    connection = http.client.HTTPSConnection(parsed.hostname, parsed.port or 443, timeout=30)
    raw = socket.create_connection((address, parsed.port or 443), timeout=30)
    connection.sock = ssl.create_default_context().wrap_socket(raw, server_hostname=parsed.hostname)
    try:
        connection.request('GET', parsed.path, headers={'Accept': 'image/png,image/jpeg,image/webp'})
        response = connection.getresponse()
        if response.status != 200 or response.getheader('Content-Type', '').split(';')[0].lower() not in ('image/png', 'image/jpeg', 'image/webp'):
            raise ValueError('INVALID_IMAGE_RESPONSE')
        data = response.read(25 * 1048576 + 1)
        if len(data) > 25 * 1048576 or hashlib.sha256(data).hexdigest() != job['sourceHash']:
            raise ValueError('IMAGE_CHANGED')
        return image_copy(data)
    finally:
        connection.close()


class Worker:
    def __init__(self, config, stop=None):
        if config['origin'] != 'https://www.aivideomaker.live' or not re.fullmatch('[a-f0-9]{64}', config['workerToken']):
            raise ValueError('CONFIGURATION')
        self.config = config
        gateway = json.loads(Path(config['gatewayConfig']).read_text('utf-8'))
        if gateway['port'] != 8765:
            raise ValueError('LOOPBACK_CONFIGURATION')
        self.gateway = 'http://127.0.0.1:8765'
        self.gateway_token = gateway['settings']['service_token']
        self.stop = stop or threading.Event()

    def cloud(self, action, body):
        return request(self.config['origin'] + '/api/qwen?action=worker_' + action, self.config['workerToken'], body)

    def ready(self):
        try:
            health = request(self.gateway + '/health', self.gateway_token, timeout=5)
            return health.get('model_ready') is True and health.get('busy') is False and health.get('worker_state') == 'ready'
        except (OSError, ValueError):
            return False

    def process(self, job):
        done = threading.Event()
        lost = threading.Event()
        ticket = {'jobId': job['id'], 'lease': job['lease']}

        def heartbeat():
            while not done.wait(20):
                try:
                    self.cloud('renew', ticket)
                except (OSError, ValueError):
                    lost.set()
                    return

        thread = threading.Thread(target=heartbeat, daemon=True)
        thread.start()
        try:
            image = download_image(job, self.config['imageOrigin'])
            if lost.is_set() or self.stop.is_set():
                return
            if not self.ready():
                self.cloud('retry', ticket)
                return
            payload = {'image_base64': base64.b64encode(image).decode(), 'mime_type': 'image/jpeg'}
            # One POST only. Uncertain admission is NOT repeated in this lease.
            admitted = request(self.gateway + '/v1/visual/profile', self.gateway_token, payload)
            local_id = admitted.get('job_id', '')
            if not re.fullmatch('[a-f0-9]{32}', local_id):
                raise ValueError('INVALID_GATEWAY_JOB')
            deadline = time.monotonic() + 240
            while not self.stop.wait(2) and time.monotonic() < deadline and not lost.is_set():
                state = request(self.gateway + '/v1/jobs/' + local_id, self.gateway_token)
                if state.get('job_id') != local_id:
                    raise ValueError('INVALID_GATEWAY_JOB')
                if state['state'] == 'failed':
                    raise ValueError('INFERENCE_FAILED')
                if state['state'] == 'completed':
                    result = state['result']
                    if result.get('operation') != 'visual_profile' or result.get('image_sha256') != hashlib.sha256(image).hexdigest():
                        raise ValueError('INVALID_GATEWAY_RESULT')
                    output = {**ticket, 'result': {'sourceHash': job['sourceHash'], 'profile': result['profile'], 'image_base64': payload['image_base64']}}
                    # Results are idempotent; retry the SAME result, never the inference POST.
                    for attempt in range(3):
                        try:
                            saved = self.cloud('result', output)
                            print(json.dumps({'job': job['id'], 'local_job': local_id, 'state': saved['state'],
                                              'inference_image_sha256': result['image_sha256'],
                                              'request_latency_seconds': (state.get('metrics') or {}).get('request_latency_seconds')}), flush=True)
                            return
                        except (OSError, ValueError):
                            if attempt == 2:
                                raise
                            if self.stop.wait(3):
                                return
                    return
            if not lost.is_set() and not self.stop.is_set():
                self.cloud('fail', ticket)
        except (OSError, ValueError):
            # No raw URL, body, token or traceback in logs.
            if not lost.is_set():
                try:
                    self.cloud('fail', ticket)
                except (OSError, ValueError):
                    pass
            print(json.dumps({'job': job['id'], 'state': 'interrupted_or_failed'}), flush=True)
        finally:
            done.set()
            thread.join(timeout=31)

    def run(self, once=False):
        errors = 0
        while not self.stop.is_set():
            try:
                reply = self.cloud('claim', {'ready': self.ready()})
                errors = 0
                if reply.get('job'):
                    self.process(reply['job'])
                    if once:
                        return
                    continue
                if once:
                    print(json.dumps({'state': 'no_claimable_job'}), flush=True)
                    return
                delay = 60
            except (OSError, ValueError):
                errors += 1
                delay = min(300, 30 * 2 ** min(errors, 4))
                print(json.dumps({'state': 'queue_unavailable', 'retrySeconds': delay}), flush=True)
            self.stop.wait(delay)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, default=DEFAULT_CONFIG)
    parser.add_argument('--once', action='store_true')
    args = parser.parse_args()
    # Windows OS lock is released on process exit; no stale PID deletion/bypass.
    import msvcrt
    lock = args.config.parent / 'worker.lock'
    args.config.parent.mkdir(parents=True, exist_ok=True)
    with lock.open('a+b') as handle:
        handle.seek(0)
        if not handle.read(1):
            handle.write(b'0'); handle.flush()
        handle.seek(0)
        try:
            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        except OSError:
            print('Worker already running; no second worker started.')
            return 2
        try:
            worker = Worker(json.loads(args.config.read_text('utf-8')))
            worker.run(args.once)
        except KeyboardInterrupt:
            return 0
        except (OSError, ValueError, KeyError):
            print('Worker configuration/startup failed. No credentials printed.')
            return 2
        finally:
            handle.seek(0)
            msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
