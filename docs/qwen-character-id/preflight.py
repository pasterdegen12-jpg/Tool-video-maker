import sys,json,ctypes,hashlib,importlib.metadata
from pathlib import Path
sys.path.insert(0,'F:/tool-ai-dh/local-ai-gateway')
from ai_gateway.gpu import gpu_snapshot
from ai_gateway.gpu_policy import require_preload
from ai_gateway.errors import GatewayError
from PIL import Image,ImageOps
out=Path('F:/tool-ai-dh/web-ai/docs/qwen-character-id')
s=gpu_snapshot()
try:require_preload(s); gate={'status':'PASS'}
except GatewayError as e:gate={'status':'BLOCKED','code':e.code,'message':str(e)}
class Memory(ctypes.Structure):
 _fields_=[('length',ctypes.c_ulong),('load',ctypes.c_ulong),('total_phys',ctypes.c_ulonglong),('available_phys',ctypes.c_ulonglong),('total_page',ctypes.c_ulonglong),('available_page',ctypes.c_ulonglong),('total_virtual',ctypes.c_ulonglong),('available_virtual',ctypes.c_ulonglong),('extended',ctypes.c_ulonglong)]
m=Memory();m.length=ctypes.sizeof(m);ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(m))
source=Path('C:/Users/Admin/Downloads/Editing_photo_room_background_2K_20260910150656.jpeg_2K_20260912152737.jpeg')
b=source.read_bytes();before=hashlib.sha256(b).hexdigest()
with Image.open(source) as im:
 image=ImageOps.exif_transpose(im).convert('RGB'); image.thumbnail((896,896)); dest=out/'judge-set-id-reference.jpeg';image.save(dest,format='JPEG',quality=95);dimensions=image.size
assert hashlib.sha256(source.read_bytes()).hexdigest()==before
evidence={'gpu':s,'gate':gate,'ram_available_mb':m.available_phys/1e6,'ram_total_mb':m.total_phys/1e6,'model_loaded':False,'source_sha256':before,'reference_copy':str(dest),'reference_sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'reference_size':dest.stat().st_size,'reference_dimensions':dimensions}
(out/'real-gpu-preflight.json').write_text(json.dumps(evidence,indent=2),encoding='utf-8');print(json.dumps(evidence))
