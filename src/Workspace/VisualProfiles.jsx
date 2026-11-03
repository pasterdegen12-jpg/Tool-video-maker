import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { characterBinding, resolveSceneCharacterProfile } from '../lib/visualProfile.js';
import {confirmedIdentity,validVisualId} from '../lib/characterIdentity.js';
import {createMolmoController,molmoRequest} from '../lib/molmoClient.js';

const Profiles = createContext(null);
const button = 'px-3 py-2 rounded-lg border border-purple-400/40 text-xs font-semibold disabled:opacity-40 cursor-pointer';

export function VisualProfilesProvider({ projectId, projectType, characters, onConfirmed, children }) {
  if(projectType!=='full-ai')return children;
  return <AuthenticatedProfiles projectId={projectId} characters={characters} onConfirmed={onConfirmed} remote>{children}</AuthenticatedProfiles>;
}
function AuthenticatedProfiles({projectId,characters,onConfirmed,children}) {
 const auth=useAuth();
 return <SessionProfiles key={JSON.stringify([projectId,auth.sessionId,auth.userId,auth.isSignedIn])} projectId={projectId} characters={characters} onConfirmed={onConfirmed} auth={auth}>{children}</SessionProfiles>;
}
function SessionProfiles({projectId,characters,onConfirmed,auth,children}) {
 async function confirm(character,proposedId,_image,jobId){
  if(!auth.isSignedIn||!onConfirmed)throw Error('Đăng nhập để xác nhận.');
  const saved=await molmoRequest(auth.getToken,'confirm',{projectId,characterId:character.id,jobId,confirmedId:proposedId,confirm:true});
  onConfirmed(saved.project);return saved.changed;
 }
 return <Profiles.Provider value={{projectId,characters,confirm,auth}}>{children}</Profiles.Provider>;
}
export function SetIdPanel({ character, disabled = false }) {
  const context = useContext(Profiles);
  if (!context) return null;
  const matches = context.characters.filter(c => c.id === character.id);
  if (matches.length !== 1 || typeof character.id !== 'string' || !character.id) return <p role="alert">Set ID: character ID thiếu hoặc trùng.</p>;
  return <section aria-label={'Visual ID '+character.name} className="space-y-3 border-t border-purple-400/20 pt-4 text-sm">
    <SavedIdentity character={character} projectId={context.projectId} />
    <Detection key={characterBinding(character)} context={context} character={character} disabled={disabled} />
  </section>;
}
function SavedIdentity({character,projectId}) {
  const identity=confirmedIdentity(character,projectId);
  if(!identity)return <p className="text-xs text-slate-400">Chưa Set ID</p>;
  return <div data-approved-visual-id={identity.confirmedId} className="text-xs space-y-2">
    <p>Visual ID: <span className="font-mono break-all">{identity.confirmedId}</span></p>
    <p className="text-emerald-400">Đã xác nhận</p>
    {(identity.referenceImage.dataUrl || identity.referenceImage.url) && <img src={identity.referenceImage.dataUrl||identity.referenceImage.url} alt={'Ảnh đã duyệt '+character.name} className="h-20 rounded object-contain" />}
  </div>;
}
function Detection({ context, character, disabled }) {
  const [state, setState] = useState({ status: 'idle', busy: false });
  const [reading, setReading] = useState(false);
  const [editedId,setEditedId]=useState(''),[saving,setSaving]=useState(false);
  const selection = useRef({ revision: 0 });
  const [controller] = useState(() => createMolmoController({getToken:context.auth.getToken,onChange:setState,projectId:context.projectId,characterId:character.id}));
  useEffect(()=>{if(context.auth.isSignedIn)controller.resume();},[controller,context.auth.isSignedIn]);
  useEffect(() => {
    const ticket = selection.current;
    const leave = () => { ticket.revision++; controller.cancel(); };
    globalThis.addEventListener('pagehide', leave);
    return () => { ticket.revision++; controller.cancel(false); globalThis.removeEventListener('pagehide', leave); };
  }, [controller]);
  useEffect(() => { if (disabled) controller.cancel(); }, [disabled, controller]);
  function cancel() {
    selection.current.revision++;
    controller.cancel();
    setReading(false);
    setState({ status: 'cancelled', busy: false, message: 'Đã bỏ đề xuất/dừng chờ; job trên server có thể vẫn chạy.' });
  }
  const resolved = resolveSceneCharacterProfile({ Character: character.id }, context.characters,'full-ai',context.projectId);
  async function detect(){
    const revision=selection.current.revision;setReading(true);
    try{setEditedId('');await controller.submit();}
    catch(error){setState({status:'error',busy:false,message:error.message});}
    finally{if(revision===selection.current.revision)setReading(false);}
  }
  return <div data-detection-status={state.status} className="space-y-3">
    <p className="text-xs opacity-80">Molmo2 đề xuất Visual ID từ ảnh. Chỉ lưu sau khi bạn duyệt; tên, Character ID và kịch bản giữ nguyên.</p>
    {<p className="text-xs opacity-80">Phân tích đúng ảnh nhân vật đang lưu trong dự án.</p>}
    <div className="flex flex-wrap gap-2">
      <button className={button} disabled={disabled || saving || !context.auth.isSignedIn || !character.imageUrl || reading || state.busy}
        onClick={detect}>✦ Set ID</button>
      {(state.busy || state.status === 'detected' || reading) && <button className={button} onClick={cancel}>Hủy đề xuất / dừng chờ</button>}
      {!state.busy&&<button className={button} disabled={saving||!context.auth.isSignedIn} onClick={()=>controller.resume()}>Khôi phục trạng thái</button>}
    </div>
    {!context.auth.isSignedIn && <p>Đăng nhập để dùng Set ID.</p>}
    <p role="status" aria-live="polite">{reading||state.busy?'Đang phân tích ảnh…':state.message}</p>
    {state.status === 'detected' && state.result && <div className="rounded-lg border border-purple-400/40 p-3 space-y-2">
      <p>Molmo2 đề xuất: <span className="font-mono break-all">{state.result.visual_id}</span></p><p>{state.result.visual_description}</p>
      <label>Visual ID cuối cùng<input aria-label="Visual ID cuối cùng" value={editedId||state.result.visual_id} disabled={saving} onChange={e=>setEditedId(e.target.value)} className="block w-full bg-slate-800 p-2"/></label>
      {resolved.status==='confirmed'&&<p>Thay ID đã lưu {resolved.identity.confirmedId} cần xác nhận mới bên dưới.</p>}
      <button className={button} disabled={disabled||saving||!validVisualId(editedId||state.result.visual_id)} onClick={async () => {
        setSaving(true);
        try{await context.confirm(character,editedId||state.result.visual_id,null,state.jobId);setState({ status: 'approved', message: 'Đã lưu Visual ID. Kịch bản và media giữ nguyên.' });}
        catch(error){setState(previous=>({...previous,message:error.message+' Không tự gửi lại; tải lại project để kiểm tra.'}));}
        finally{setSaving(false);}
      }}>{saving?'Đang lưu…':'Xác nhận Visual ID và lưu'}</button>
    </div>}
    <p className="text-xs opacity-60">Giữ ảnh tham chiếu cùng profile. Visual ID dạng chữ không bảo đảm khuôn mặt nhất quán khi tạo video.</p>
  </div>;
}
export function SceneVisualProfile({ scene }) {
  const context = useContext(Profiles);
  if (!context) return null;
  const result = resolveSceneCharacterProfile(scene, context.characters,'full-ai',context.projectId);
  return <p className="text-xs mt-2 break-words text-purple-400" data-visual-status={result.status}>
    {['approved','confirmed'].includes(result.status) ? 'Visual ID: ' + result.profile.visualId
      : result.status === 'ambiguous' ? 'Visual ID: tham chiếu nhân vật không rõ ràng.' : 'Visual ID: chưa có profile được duyệt.'}
  </p>;
}

// Read-only access to the existing approved overlay; no approval or persistence change.
export function SceneVisualProfileAccess({ scene, characters, projectId, children }) {
  const context = useContext(Profiles);
  return children(resolveSceneCharacterProfile(scene, context?.characters ?? characters,'full-ai',context?.projectId??projectId));
}
