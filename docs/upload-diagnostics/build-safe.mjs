import process from 'node:process';
import {build} from 'vite';
process.env.VITE_WAVESPEED_API_KEY='';
process.env.WAVESPEED_API_KEY='';
process.env.LOCAL_VIDEO_PAID_ENABLED='false';
process.env.NODE_ENV='production';
await build({mode:'production',build:{outDir:'docs/upload-diagnostics/build',emptyOutDir:false}});
