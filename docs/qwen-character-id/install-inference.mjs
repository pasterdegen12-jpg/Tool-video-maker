import fs from 'node:fs';
import {spawn} from 'node:child_process';
const gateway='F:/tool-ai-dh/local-ai-gateway';
async function run(exe,args){await new Promise((resolve,reject)=>{const p=spawn(exe,args,{cwd:gateway,windowsHide:true,stdio:'inherit'});p.on('error',reject);p.on('exit',c=>c===0?resolve():reject(Error('Installer exit '+c)));});}
const base='C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
if(!fs.existsSync(gateway+'/.venv-inference/Scripts/python.exe'))await run(base,['-m','venv',gateway+'/.venv-inference']);
const py=gateway+'/.venv-inference/Scripts/python.exe';
await run(py,['-m','pip','install','--disable-pip-version-check','-r','requirements-inference-torch.txt']);
await run(py,['-m','pip','install','--disable-pip-version-check','-r','requirements-inference.txt']);
