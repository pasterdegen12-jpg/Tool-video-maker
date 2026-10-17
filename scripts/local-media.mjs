import {loadEnv} from 'vite';
import {createHandler as audio} from '../api/audio.js';
import {createHandler as gemini} from '../api/gemini.js';

export const isLoopback=address=>['127.0.0.1','::1','::ffff:127.0.0.1'].includes(address);
// Vite development only. Server-only configuration; never serialized into client code.
export default function localMedia(){
  return {name:'authenticated-local-media',configureServer(server){
    const env=loadEnv('media',server.config.root,'');
    const handlers={'/api/audio':audio(env),'/api/gemini':gemini(env)};
    server.middlewares.use((req,res,next)=>{
      const path=req.url?.split('?')[0];if(!handlers[path])return next();
      if(!isLoopback(req.socket.remoteAddress)||env.LOCAL_MEDIA_ENABLED!=='true'){
        res.statusCode=503;res.setHeader('Content-Type','application/json');
        res.end(JSON.stringify({error:{code:'LOCAL_MEDIA_CONFIGURATION',message:'Cấu hình backend local trong .env.media.local để dùng Gemini/Audio.'}}));return;
      }
      return handlers[path](req,res);
    });
  }};
}
