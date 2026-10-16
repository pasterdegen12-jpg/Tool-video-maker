import importlib.metadata,json,sys
from pathlib import Path
pins={'torch':'2.5.1+cu121','torchvision':'0.20.1+cu121','transformers':'4.57.1','bitsandbytes':'0.50.2','accelerate':'1.11.0','lm-format-enforcer':'0.11.3','pydantic':'2.11.7','Pillow':'12.3.0'}
versions={k:importlib.metadata.version(k) for k in pins};assert versions==pins
result={'interpreter':sys.executable,'base':sys._base_executable,'versions':versions,'model_loaded':False,'cuda_initialized':False}
Path('docs/qwen-character-id/inference-environment.json').write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps(result))
