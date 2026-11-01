import process from 'node:process';
import {QueueClient} from '@vercel/queue';
import {cloudConfig} from './_lib/cloud-video/config.js';
import {videoRuntime} from './_lib/cloud-video/runtime.js';
import {createVideoContinuation} from './_lib/cloud-video/continuation.js';
const queue=new QueueClient();
// Vercel queue/v2beta exposes no public consumer URL. No Clerk token is stored.
export default queue.handleNodeCallback(async(message,metadata)=>{
 const runtime=videoRuntime(cloudConfig(process.env));
 await createVideoContinuation({...runtime,send:queue.send}).consume(message,metadata);
});
