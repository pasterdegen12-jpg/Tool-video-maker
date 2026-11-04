import {createContext,useCallback,useContext,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {useAuth} from '@clerk/clerk-react';
import {Loader2} from 'lucide-react';
import {characterBinding,resolveSceneCharacterProfile} from '../lib/visualProfile.js';
import {confirmedIdentity} from '../lib/characterIdentity.js';
import {createMolmoController} from '../lib/molmoClient.js';

const Profiles=createContext(null);
const MultiSelect=createContext(null);

export function SetIdGroup({children}){
 const project=useContext(Profiles);
 const auth=useAuth();
 if(!project||project.characters.length<2)return children;
 return <Group key={JSON.stringify([project.projectId,auth.sessionId,auth.userId])}>{children}</Group>;
}
function Group({children}){
 const [selected,setSelected]=useState(()=>new Set());
 const update=useCallback((controller,checked)=>setSelected(previous=>{
  if(previous.has(controller)===checked)return previous;
  const next=new Set(previous);
  if(checked)next.add(controller);else next.delete(controller);
  return next;
 }),[]);
 function startSelected(){
  const batch=[...selected];
  setSelected(new Set());
  for(const controller of batch)void controller.submit();
 }
 return <MultiSelect.Provider value={{selected,update}}>
  <div className="xl:col-span-2 flex items-center justify-end">
   <button type="button" disabled={!selected.size} onClick={startSelected} className="rounded-lg border border-purple-400/40 px-3 py-2 text-sm font-semibold disabled:opacity-50">
    Set ID đã chọn ({selected.size})
   </button>
  </div>
  {children}
 </MultiSelect.Provider>;
}
export function VisualProfilesProvider({projectId,projectType,characters,onConfirmed,children}){
 if(projectType!=='full-ai')return children;
 return <Profiles.Provider value={{projectId,characters,onConfirmed}}>{children}</Profiles.Provider>;
}
export function SetIdPanel({character,disabled}){
 const context=useContext(Profiles);
 const auth=useAuth();
 if(!context)return null;
 return <Detection key={JSON.stringify([context.projectId,characterBinding(character),auth.sessionId,auth.userId])}
   character={character} context={context} auth={auth} disabled={disabled}/>;
}
function Detection({character,context,auth,disabled}){
 const [state,setState]=useState({status:'idle',busy:false});
 const delivered=useRef(null);
 const {onConfirmed}=context;
 useEffect(()=>{
  if(state.identity&&delivered.current!==state.identity.jobId){
   delivered.current=state.identity.jobId;
   onConfirmed?.(state.identity);
  }
 },[state.identity,onConfirmed]);
 const [controller]=useState(()=>createMolmoController({getToken:auth.getToken,projectId:context.projectId,characterId:character.id,onChange:setState}));
 const group=useContext(MultiSelect);
 const update=group?.update;
 const unavailable=disabled||state.busy||!character.imageUrl||!auth.isSignedIn;
 // A selection belongs to this mounted character/image controller. Dropping a
 // card or making it busy invalidates that selection before the next click.
 useLayoutEffect(()=>{
  if(unavailable)update?.(controller,false);
  return ()=>update?.(controller,false);
 },[controller,unavailable,update]);
 useEffect(()=>{
  if(auth.isSignedIn)void controller.resume();
  return ()=>controller.cancel();
 },[auth.isSignedIn,controller]);
 const id=confirmedIdentity(character,context.projectId)?.confirmedId;
 const previous=!id&&character.characterIdentity?.sourceImageUrl&&confirmedIdentity({...character,imageUrl:character.characterIdentity.sourceImageUrl},context.projectId)?.confirmedId;
 const generating=state.busy&&state.status!=='recovering';
 const error=['failed','error','unknown','polling_paused'].includes(state.status);
 return <section aria-label={'Visual ID '+character.name} className="flex flex-wrap items-center gap-2 border-t border-purple-400/20 pt-2 text-xs">
   <p className="min-w-0 flex-1 break-words" aria-live="polite">Visual ID: <span className="font-mono select-text" data-approved-visual-id={id}>{id||(previous?previous+' (ảnh trước)':null)||(generating?'Đang tạo...':'Chưa thiết lập')}</span></p>
   {group&&<label className="inline-flex items-center gap-1"><input type="checkbox" aria-label={'Chọn Set ID cho '+character.name} disabled={unavailable} checked={group.selected.has(controller)} onChange={e=>update(controller,e.target.checked)}/>Chọn</label>}
   <button type="button" className="inline-flex items-center gap-1 rounded-lg border border-purple-400/40 px-2 py-1 font-semibold disabled:opacity-50" disabled={unavailable} onClick={()=>controller.submit()}>
    ✦ Set ID{generating&&<Loader2 className="animate-spin" size={12} aria-label="Đang tạo"/>}
   </button>
   {error&&<p role="alert" className="basis-full text-amber-500">Không thể tạo ID. Vui lòng thử lại.</p>}
 </section>;
}
export function SceneVisualProfile({ scene }) {
  const context = useContext(Profiles);
  if (!context) return null;
  const result = resolveSceneCharacterProfile(scene, context.characters,'full-ai',context.projectId);
  return <p className="text-xs mt-2 break-words text-purple-400" data-visual-status={result.status}>
    {['approved','confirmed'].includes(result.status) ? 'Visual ID: ' + result.profile.visualId
      : 'Visual ID: Chưa thiết lập'}
  </p>;
}

// Read-only access to the existing approved overlay; no approval or persistence change.
export function SceneVisualProfileAccess({ scene, characters, projectId, children }) {
  const context = useContext(Profiles);
  return children(resolveSceneCharacterProfile(scene, context?.characters ?? characters,'full-ai',context?.projectId??projectId));
}
