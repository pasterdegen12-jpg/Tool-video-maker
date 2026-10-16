"""Real gateway test process. CPU only, no model imports or GPU worker startup permitted."""
import importlib.abc
import json
import os
from pathlib import Path
import socket
import sys
import threading
import time

blocked = ('torch', 'transformers', 'bitsandbytes', 'ai_gateway.inference', 'ai_gateway.worker')
attempts = []
class Guard(importlib.abc.MetaPathFinder):
    def find_spec(self, fullname, path=None, target=None):
        if any(fullname == name or fullname.startswith(name + '.') for name in blocked):
            attempts.append(fullname)
            raise AssertionError('Model import forbidden in CPU integration test')

sys.meta_path.insert(0, Guard())
sys.path.insert(0, os.environ['PHASE3A_GATEWAY_ROOT'])
assert os.environ['GATEWAY_START_GPU_WORKER'] == 'false'
from ai_gateway.config import Settings
from ai_gateway.api import create_app
from ai_gateway.process import ProcessBackend
import uvicorn

async def forbidden_start(self):
    attempts.append('ProcessBackend.start')
    raise AssertionError('GPU worker startup forbidden')

ProcessBackend.start = forbidden_start
settings = Settings.from_env()
assert settings.start_gpu_worker is False
assert settings.gpu_mode == 'shared'
assert settings.gpu_lock_path == Path('F:/Cooking-AI-review/jobs/.speech_gpu.lock')
app = create_app(settings)
sock = socket.socket()
sock.bind(('127.0.0.1', int(os.environ.get('PHASE3A_GATEWAY_PORT', '0'))))
sock.listen(16)
server = uvicorn.Server(uvicorn.Config(app, log_level='critical', access_log=False))
thread = threading.Thread(target=server.run, kwargs={'sockets': [sock]}, daemon=True)
thread.start()
try:
    deadline = time.monotonic() + 10
    while not server.started and thread.is_alive() and time.monotonic() < deadline:
        time.sleep(.01)
    assert server.started
    print(json.dumps({'ready': True, 'port': sock.getsockname()[1]}), flush=True)
    sys.stdin.readline()
finally:
    server.should_exit = True
    thread.join(10)
    sock.close()
    assert not thread.is_alive()
    loaded = [name for name in blocked if name in sys.modules]
    assert not attempts and not loaded
    print(json.dumps({'stopped': True, 'blocked_import_attempts': attempts, 'model_modules_loaded': loaded,
                      'gpu_worker_started': False}), flush=True)
