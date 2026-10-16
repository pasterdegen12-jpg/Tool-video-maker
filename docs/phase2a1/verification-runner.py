import datetime, hashlib, json, os, sys, xml.etree.ElementTree as ET
from pathlib import Path
import pytest
root = Path('F:/tool-ai-dh/local-ai-gateway').resolve()
stage = Path(__file__).resolve().parent
sys.path.insert(0, str(root))
os.environ['PHASE2A_EVIDENCE_DIR'] = str(stage/'evidence')
args = [str(root/'tests'), '-q', '-p', 'no:cacheprovider', '--basetemp='+str(stage/'pytest-data'), '--junitxml='+str(stage/'gateway.junit.xml')]
started = datetime.datetime.now(datetime.timezone.utc).isoformat()
result = pytest.main(args)
import ai_gateway.workflow_parser as parser
import ai_gateway.web_adapters as adapters
assert Path(parser.__file__).resolve() == root/'ai_gateway/workflow_parser.py'
assert Path(adapters.__file__).resolve() == root/'ai_gateway/web_adapters.py'
old = ET.parse(root/'runtime/phase2a/installed.junit.xml').findall('.//testcase')
new = ET.parse(stage/'gateway.junit.xml').findall('.//testcase')
ids = lambda cases: {(c.get('classname'),c.get('name')) for c in cases}
assert len(old) == 131 and ids(old) <= ids(new)
baseline = json.loads((stage/'gateway-before.json').read_text('utf-8'))
unchanged = []
for name, sha in baseline.items():
    if name == 'web_adapters.py': continue
    assert hashlib.sha256((root/'ai_gateway'/name).read_bytes()).hexdigest() == sha, name
    unchanged.append(name)
blocked_modules = [m for m in ('torch','transformers','bitsandbytes') if m in sys.modules]
assert not blocked_modules
summary = {
 'started_utc':started, 'finished_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'command': ' '.join([sys.executable,'-I','-B',str(Path(__file__).resolve())]),
 'pytest_args':args,'exit_code':result,'test_count':len(new),
 'existing_131_retained':len(ids(old)&ids(new)),
 'non_pass':sum(bool(list(c)) for c in new),
 'parser_file':parser.__file__,'adapter_file':adapters.__file__,
 'unchanged_gateway_modules':unchanged,'model_modules_loaded':blocked_modules,
 'real_inference':'NOT RUN'
}
(stage/'verification.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
print(json.dumps(summary,indent=2))
raise SystemExit(result)
