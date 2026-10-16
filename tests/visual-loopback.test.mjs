import test from 'node:test';
import assert from 'node:assert/strict';
import { localAiLoopbackGuard } from '../scripts/local-ai-loopback.mjs';
function check(url,remoteAddress){let passed=false;const res={setHeader(){},end(b){this.body=JSON.parse(b);}};
  localAiLoopbackGuard({url,socket:{remoteAddress},headers:{origin:'http://localhost:5173','x-forwarded-for':'127.0.0.1'}},res,()=>{passed=true;});return{res,passed};}
test('Vite local AI proxy accepts only actual loopback peers, not forged origin/forwarded headers',()=>{
  for(const peer of ['127.0.0.1','::1','::ffff:127.0.0.1'])assert.equal(check('/api/local-ai/visual-profile',peer).passed,true);
  for(const peer of ['192.168.1.2','10.0.0.1','::ffff:192.168.1.2',undefined])for(const route of ['/api/local-ai/visual-profile','/api/local-ai/jobs/abc','/api/local-ai/analyze']){
    const {res,passed}=check(route,peer);assert.equal(passed,false);assert.equal(res.statusCode,403);assert.equal(res.body.error.code,'LOCAL_ONLY');
  }
  assert.equal(check('/other-existing-route','192.168.1.2').passed,true);
});
