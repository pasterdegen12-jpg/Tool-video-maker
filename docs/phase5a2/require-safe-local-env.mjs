import process from 'node:process';
for (const [name,expected] of Object.entries({NODE_ENV:'development',LOCAL_VIDEO_ENABLED:'true',LOCAL_VIDEO_PAID_ENABLED:'false',LOCAL_AI_WEB_ORIGIN:'http://localhost:5173',WAVESPEED_API_KEY:'',VITE_WAVESPEED_API_KEY:''})) {
  if(process.env[name]!==expected) throw new Error('Unsafe or missing local acceptance setting: '+name);
}
process.env.CHOKIDAR_USEPOLLING='true';
