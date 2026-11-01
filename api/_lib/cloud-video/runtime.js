import process from 'node:process';
import {cloudDatabase,createCloudStore} from './store.js';
import {createCloudUpload} from './upload.js';
import {createCloudVideoService} from './service.js';
import {createProvider} from '../seedance/provider.js';
import {createVideoArchive} from './archive.js';
import {createSourceImageReader} from './source-image.js';
import {createVideoBatchService} from './batch.js';
export function videoRuntime(config){
 const deps={config,store:createCloudStore(cloudDatabase(process.env)),upload:createCloudUpload(config.apiKey),provider:createProvider(config),archive:createVideoArchive(process.env),sourceImage:createSourceImageReader(process.env.R2_PUBLIC_ORIGIN)};
 const video=createCloudVideoService(deps);return {...deps,service:{...video,...createVideoBatchService({...deps,video})}};
}
