import {sceneCameraFixed} from '../lib/sceneCamera.js';
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {X,Film,Upload,Scissors,Loader2} from 'lucide-react';
import {VIDEO_MODES,VIDEO_RESOLUTIONS,ASPECTS,videoMode,validateCloudSettings,composeVideoPrompt} from '../lib/cloudVideoOptions.js';
import {readSceneDuration,SPEECH_ASSUMPTIONS} from '../lib/sceneDuration.js';
import {readVideoImage} from '../lib/seedanceImageClient.js';
import VideoTrimEditor from './VideoTrimEditor.jsx';

const field='w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500';
const secondary='inline-flex items-center justify-center gap-2 rounded-lg border border-slate-600 px-3 py-2 text-xs font-semibold hover:bg-slate-800 disabled:opacity-40';
export default function VideoOptionsModal({scene,outputUrl,busy,blocked,message,onGenerate,onClose,onSaveVideo,savedOptions}){
  const [mode,setMode]=useState(savedOptions?.mode||'start_frame_to_video');
  const [options,setSettings]=useState(()=>Object.fromEntries(Object.entries({resolution:'480p',aspect_ratio:'9:16',generate_audio:true,camera_fixed:false,seed:-1}).map(([key,value])=>[key,savedOptions?.settings?.[key]??value])));
  const [additional,setAdditional]=useState(savedOptions?.additional_prompt||'');
  const [image,setImage]=useState(null),[references,setReferences]=useState([]),[reading,setReading]=useState(false),[error,setError]=useState('');
  const [inputVideo,setInputVideo]=useState(null),[outputDraft,setOutputDraft]=useState(null),[editor,setEditor]=useState(null),[saving,setSaving]=useState(false);
  const dialog=useRef(null),revision=useRef(0),urls=useRef(new Set());
  useEffect(()=>{
    const previous=document.activeElement,overflow=document.body.style.overflow;
    const owned=urls.current,version=revision;document.body.style.overflow='hidden';dialog.current?.focus({preventScroll:true});
    return()=>{version.current++;for(const url of owned)URL.revokeObjectURL(url);document.body.style.overflow=overflow;previous?.focus?.({preventScroll:true});};
  },[]);
  const locked=busy||reading||saving;
  const sourceImage=image?.dataUrl||scene.startFrameUrl||scene.imageUrl;
  const cap=videoMode(mode);
  let issue='',duration,warnings=[];
  try{duration=readSceneDuration(scene,mode);}catch(e){issue=e.message;}
  const settings={...options,duration,camera_fixed:sceneCameraFixed(scene,mode,options.camera_fixed)};
  try{if(!issue)validateCloudSettings(settings,mode);const prompt=composeVideoPrompt(scene,additional);
    warnings=prompt.warnings;
    if(!prompt.prompt)issue='Scene không có prompt.';
  }catch(e){issue=e.message;}
  if(mode==='start_frame_to_video'&&!sourceImage)issue||='Chọn ảnh Start Frame trước khi tạo video.';
  if(mode==='references_to_video'&&!references.length)issue||='Chọn ít nhất một ảnh tham chiếu.';
  async function chooseImages(event,reference=false){
    const files=[...event.target.files];event.target.value='';if(!files.length)return;
    const rev=++revision.current;setReading(true);setError('');
    try{
      if(reference&&files.length>cap.maxImages)throw Error('Tối đa '+cap.maxImages+' ảnh tham chiếu.');
      const selected=[];for(const file of files)selected.push(await readVideoImage(file));
      if(rev!==revision.current)return;
      if(reference)setReferences(selected);else {setImage(selected[0]);setInputVideo(null);}
    }catch(e){if(rev===revision.current)setError(e.message);}
    finally{if(rev===revision.current)setReading(false);}
  }
  async function chooseVideo(event,target){
    const file=event.target.files?.[0];event.target.value='';if(!file)return;
    const rev=++revision.current;setReading(true);
    try{const {readEditVideo}=await import('../lib/videoEditing.js');await readEditVideo(file);if(rev!==revision.current)return;
      const url=URL.createObjectURL(file);urls.current.add(url);const selected={file,url};
      if(target==='input')setInputVideo(selected);else setOutputDraft(selected);setError('');
    }catch(e){if(rev===revision.current)setError(e.message);}finally{if(rev===revision.current)setReading(false);}
  }
  async function saveOutput(file){
    if(saving||busy||!onSaveVideo)return;setSaving(true);setError('');
    try{await onSaveVideo(scene.scene_n,file,scene.videoUrl||null);onClose();return true;}catch(e){setError(e.message);return false;}finally{setSaving(false);}
  }
  function keyboard(e){
    if(e.key==='Escape'&&!saving&&!editor){e.preventDefault();onClose();}
    if(e.key==='Tab'){
      const items=[...dialog.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]')];
      const first=items[0],last=items.at(-1);
      if(e.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){e.preventDefault();last?.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
    }
  }
  return createPortal(<div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-3 sm:p-6" data-video-options-overlay>
    <section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={'gen-video-title-'+scene.scene_n} onKeyDown={keyboard}
      className="relative flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl">
      <header className="flex shrink-0 items-center justify-between border-b border-slate-800 px-5 py-4">
        <div><h2 id={'gen-video-title-'+scene.scene_n} className="flex items-center gap-2 text-lg font-bold"><Film size={19} className="text-emerald-400"/>Gen Video — Scene {scene.scene_n}</h2><p className="mt-1 text-xs text-slate-400">Thiết lập cho scene này. Kịch bản gốc được giữ nguyên.</p></div>
        <button type="button" aria-label="Đóng tùy chọn video" onClick={onClose} disabled={saving} className="rounded-lg p-2 hover:bg-slate-800"><X size={20}/></button>
      </header>
      <div className="min-h-0 space-y-5 overflow-y-auto p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2"><h3 className="text-xs font-semibold tracking-wider text-blue-400">INPUT</h3>
            <div className="flex h-40 items-center justify-center overflow-hidden rounded-xl border border-slate-800 bg-black">
              {inputVideo?<video crossOrigin="anonymous" src={inputVideo.url} controls className="h-full w-full object-contain" aria-label="Input video để chỉnh sửa"/>:sourceImage?<img crossOrigin="anonymous" src={sourceImage} alt="Start Frame hiện tại" className="h-full w-full object-contain"/>:<span className="text-xs text-slate-500">Chưa chọn ảnh / video</span>}
            </div>
            <div className="flex flex-wrap gap-2"><label className={secondary}><Upload size={13}/>Thay ảnh<input type="file" aria-label="Ảnh Start Frame" accept="image/png,image/jpeg" disabled={locked} onChange={e=>chooseImages(e)} className="hidden"/></label>
              <label className={secondary}>Tải video để chỉnh sửa<input type="file" aria-label="Input video" accept="video/mp4,video/webm" disabled={locked} onChange={e=>chooseVideo(e,'input')} className="hidden"/></label></div>
            {inputVideo&&<><p className="text-xs text-slate-400">Video này dùng trong Edit Video; không gửi vào chế độ tạo từ ảnh.</p><button type="button" className={secondary} onClick={()=>setInputVideo(null)}>Hiện lại Start Frame</button></>}
          </div>
          <div className="space-y-2"><h3 className="text-xs font-semibold tracking-wider text-emerald-400">OUTPUT</h3>
            <div className="flex h-40 items-center justify-center overflow-hidden rounded-xl border border-slate-800 bg-black">
              {outputDraft||outputUrl?<video crossOrigin="anonymous" src={outputDraft?.url||outputUrl} preload="metadata" controls className="h-full w-full object-contain" aria-label="Output preview trong modal"/>:<span className="text-xs text-slate-500">Video hoàn tất sẽ xuất hiện ở ô OUTPUT</span>}
            </div>
            <label className={secondary}>Tải output thủ công<input type="file" aria-label="Output video thủ công" accept="video/mp4,video/webm" disabled={locked} onChange={e=>chooseVideo(e,'output')} className="hidden"/></label>
            {outputDraft&&<button type="button" className={secondary} disabled={locked||!onSaveVideo} onClick={()=>saveOutput(outputDraft.file)}>Lưu output vào scene</button>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2"><Scissors size={15} className="text-blue-400"/><span className="text-sm font-medium">Edit Video</span>
          <button type="button" className={secondary} disabled={locked||!inputVideo} onClick={()=>setEditor(inputVideo)}>Sửa Input video</button>
          <button type="button" className={secondary} disabled={locked||!(outputDraft||outputUrl)} onClick={()=>setEditor(outputDraft||{url:outputUrl})}>Sửa Output video</button>
          {!inputVideo&&!outputDraft&&!outputUrl&&<span className="text-xs text-slate-400">Chọn video để cắt và lưu bản sao.</span>}
        </div>
        <fieldset disabled={locked} className="space-y-3"><legend className="mb-2 text-sm font-semibold">Generation mode</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">{Object.entries(VIDEO_MODES).map(([id,v])=><label key={id} className={'cursor-pointer rounded-xl border px-3 py-3 text-center text-xs font-semibold '+(mode===id?'border-emerald-500 bg-emerald-500/10 text-emerald-300':'border-slate-700 bg-slate-950 text-slate-400')}>
            <input className="sr-only" type="radio" name={'mode-'+scene.scene_n} value={id} checked={mode===id} onChange={()=>{setMode(id);if(id==='references_to_video')setSettings(current=>({...current,camera_fixed:false,seed:-1}));setError('');}}/>{v.label}</label>)}</div>
          <p className="text-xs text-slate-400">{cap.name}{mode==='text_to_video'?' · không cần ảnh đầu vào':mode==='references_to_video'?' · 1–9 ảnh, không phải khung hình bắt đầu':''}</p>
          {mode==='references_to_video'&&<p className="text-xs text-slate-400">Model này không nhận khóa camera hoặc seed; chỉ dẫn Camera gốc vẫn nằm trong prompt.</p>}
          {mode==='references_to_video'&&<div className="space-y-2"><label className={secondary}>Chọn ảnh tham chiếu<input type="file" aria-label="Ảnh tham chiếu" multiple accept="image/png,image/jpeg" className="hidden" onChange={e=>chooseImages(e,true)}/></label><div className="flex flex-wrap gap-2">{references.map((img,i)=><figure key={i}><img crossOrigin="anonymous" src={img.dataUrl} alt={'Reference '+(i+1)} className="h-20 w-20 rounded-lg object-contain bg-black"/><figcaption className="text-xs text-slate-400">@Image {i+1}</figcaption></figure>)}</div></div>}
          <div className="grid grid-cols-2 gap-3"><label className="space-y-1 text-xs text-slate-400">Aspect Ratio<select aria-label="Aspect Ratio" className={field} value={settings.aspect_ratio} onChange={e=>setSettings({...options,aspect_ratio:e.target.value})}>{ASPECTS.map(v=><option key={v}>{v}</option>)}</select></label>
            <label className="space-y-1 text-xs text-slate-400">Resolution<select aria-label="Resolution" className={field} value={settings.resolution} onChange={e=>setSettings({...options,resolution:e.target.value})}>{VIDEO_RESOLUTIONS.map(v=><option key={v}>{v}</option>)}</select></label></div>
          <label className="block space-y-2 text-sm font-semibold">Custom prompt (tùy chọn)<textarea aria-label="Custom prompt (tùy chọn)" value={additional} onChange={e=>setAdditional(e.target.value)} maxLength={1000} rows={3} className={field+' resize-y'} placeholder="Bổ sung phong cách hoặc chi tiết. Không thay lời thoại, nhân vật hay chỉ dẫn gốc."/></label>
          {warnings.map(warning=><p key={warning} role="status" className="text-xs text-amber-300">{warning}</p>)}
        </fieldset>
        <p className="text-xs text-slate-500">Ảnh PNG/JPEG: tối đa 25 MiB, 24 MP. Video MP4/WebM: tối đa 100 MiB; editor cắt video tối đa 10 phút. Đóng modal bỏ các lựa chọn chưa gửi.</p>
        {(error||issue||message)&&<p role="status" className="rounded-lg bg-slate-950 p-3 text-xs text-amber-300">{error||issue||message}</p>}
      </div>
      <footer className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-800 bg-slate-900 px-5 py-4">
        <button type="button" className={secondary} onClick={onClose} disabled={saving}>{busy?'Đóng · tiếp tục xử lý':'Hủy'}</button>
        <button type="button" disabled={locked||blocked||!!issue} onClick={()=>onGenerate({mode,settings,additional_prompt:additional,assumptions:{...SPEECH_ASSUMPTIONS},...(mode==='references_to_video'?{references}:mode==='start_frame_to_video'?image?{image_base64:image.image_base64,mime_type:image.mime_type}:{stored_image:true}:{})})} className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-40">{locked?<Loader2 size={16} className="animate-spin"/>:<Film size={16}/>}Generate Video</button>
      </footer>
      {editor&&<VideoTrimEditor source={editor} onClose={()=>setEditor(null)} onSave={file=>saveOutput(file)}/>}</section>
  </div>,document.body);
}
