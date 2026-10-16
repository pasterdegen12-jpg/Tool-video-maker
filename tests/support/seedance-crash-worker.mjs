// Mock-only subprocess for real process interruption tests. Never contacts WaveSpeed.
import process from 'node:process';
import {createVideoServer} from '../../scripts/local-video-server.mjs';
import {baseConfig,mockProvider,response,prediction} from './seedance-fixtures.mjs';
const [directory,phase]=process.argv.slice(2);
const mock=mockProvider({override:async url=>{
  if(url.endsWith('/image-to-video')){
    if(phase==='before-id')await new Promise(()=>{});
    return response(prediction('completed','crash_test_id'));
  }
}});
const server=createVideoServer({...baseConfig,jwtKey:process.env.TEST_CLERK_JWT_KEY,journalPath:directory},{...mock,checkUrl:async url=>{
  if(phase==='after-id'&&url.startsWith('https://video.'))await new Promise(()=>{});
  return mock.checkUrl(url);
}});
server.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({port:server.address().port})));
