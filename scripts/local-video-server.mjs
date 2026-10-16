import http from 'node:http';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { readVideoConfig } from '../api/lib/seedance/config.js';
import { createVideoHandler } from '../api/lib/seedance/service.js';
import { VideoError,sendVideoError } from '../api/lib/seedance/errors.js';
export function createVideoServer(config=readVideoConfig(),options){
  const handler=createVideoHandler(config,options);
  const server=http.createServer((req,res)=>{
    if(req.headers.host!=='127.0.0.1:'+req.socket.localPort||
      !['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)){
      return sendVideoError(res,new VideoError('FORBIDDEN_ORIGIN'));
    }
    void handler(req,res);
  });
  server.requestTimeout=15000;server.headersTimeout=10000;server.maxHeadersCount=40;
  server.closeJournal=handler.close;
  server.on('close',()=>{void handler.close();});
  return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const server=createVideoServer();
    server.on('error',()=>{console.error('Local video backend could not start.');process.exitCode=1;});
    server.listen(8790,'127.0.0.1',()=>console.log('Local single-scene video backend on 127.0.0.1:8790; paid calls require separate opt-in.'));
    for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.close();server.closeAllConnections();});
  }catch{console.error('Local video backend is disabled or configuration is incomplete.');process.exitCode=1;}
}
