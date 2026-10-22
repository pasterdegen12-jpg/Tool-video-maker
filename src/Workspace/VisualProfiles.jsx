import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { characterBinding, resolveSceneCharacterProfile, visualProfilesVisible } from '../lib/visualProfile.js';
import { createVisualProfileController, readReferenceFile } from '../lib/visualProfileClient.js';
import {characterProjectRequest} from '../lib/characterIdentityClient.js';
import {confirmedIdentity,validCharacterId} from '../lib/characterIdentity.js';

const Profiles = createContext(null);
const button = 'px-3 py-2 rounded-lg border border-purple-400/40 text-xs font-semibold disabled:opacity-40 cursor-pointer';

export function VisualProfilesProvider({ projectId, projectType, characters, onConfirmed, children }) {
  if(projectType!=='full-ai')return children;
  if(!visualProfilesVisible({DEV:import.meta.env.DEV,VITE_ENABLE_LOCAL_VISUAL_ID:import.meta.env.VITE_ENABLE_LOCAL_VISUAL_ID},globalThis.location))return <Profiles.Provider value={{projectId,characters,unavailable:true}}>{children}</Profiles.Provider>;
  return <AuthenticatedProfiles projectId={projectId} characters={characters} onConfirmed={onConfirmed}>{children}</AuthenticatedProfiles>;
}
function AuthenticatedProfiles({ projectId, characters, onConfirmed, children }) {
  const auth = useAuth();
  return <SessionProfiles key={JSON.stringify([projectId, auth.sessionId, auth.userId, auth.isSignedIn])}
    projectId={projectId} characters={characters} onConfirmed={onConfirmed} auth={auth}>{children}</SessionProfiles>;
}
function SessionProfiles({ projectId, characters, onConfirmed, auth, children }) {
  async function prepare(){return characterProjectRequest(auth.getToken,projectId);}
  async function confirm(character, proposedId, image, jobId, snapshot) {
    const matches = characters.filter(c => c.id === character.id);
    if (!auth.isSignedIn || matches.length !== 1 || characterBinding(matches[0]) !== characterBinding(character)||!snapshot||!onConfirmed) throw Error('Nhân vật/project đã thay đổi hoặc chưa nối lưu.');
    const old=snapshot.project.characters.find(c=>c.id===character.id);
    const saved=await characterProjectRequest(auth.getToken,projectId,{characterId:character.id,confirmedId:proposedId,
      image:{dataUrl:image.dataUrl,sha256:image.image_sha256},jobId,confirm:true,fingerprint:snapshot.fingerprint,
      expectedPreviousId:confirmedIdentity(old,projectId)?.confirmedId||null});
    onConfirmed(saved.project);
    return saved.changed;
  }
  return <Profiles.Provider value={{ projectId,characters,prepare,confirm,auth }}>{children}</Profiles.Provider>;
}
export function SetIdPanel({ character, disabled = false }) {
  const context = useContext(Profiles);
  if (!context) return null;
  const matches = context.characters.filter(c => c.id === character.id);
  if (matches.length !== 1 || typeof character.id !== 'string' || !character.id) return <p role="alert">Set ID: character ID thiếu hoặc trùng.</p>;
  return <section aria-label={'Visual ID '+character.name} className="space-y-3 border-t border-purple-400/20 pt-4 text-sm">
    <SavedIdentity character={character} projectId={context.projectId} />
    {context.unavailable ? <div className="flex items-center gap-2 text-xs"><button className={button} disabled title="Dịch vụ Qwen chưa được kết nối với website">✦ Set ID</button><span className="text-slate-400">Qwen Local chưa kết nối</span></div>
      : <Detection key={characterBinding(character)} context={context} character={character} disabled={disabled} />}
  </section>;
}
function SavedIdentity({character,projectId}) {
  const identity=confirmedIdentity(character,projectId);
  if(!identity)return <p className="text-xs text-slate-400">Chưa Set ID</p>;
  return <div data-approved-visual-id={identity.confirmedId} className="text-xs space-y-2">
    <p>Character ID: <span className="font-mono break-all">{identity.confirmedId}</span></p>
    <p className="text-emerald-400">Đã xác nhận</p>
    {identity.referenceImage.dataUrl && <img src={identity.referenceImage.dataUrl} alt={'Ảnh đã duyệt '+character.name} className="h-20 rounded object-contain" />}
  </div>;
}
function Detection({ context, character, disabled }) {
  const [image, setImage] = useState(null);
  const [state, setState] = useState({ status: 'idle', busy: false });
  const [reading, setReading] = useState(false);
  const [editedId,setEditedId]=useState(''),[snapshot,setSnapshot]=useState(null),[saving,setSaving]=useState(false);
  const selection = useRef({ revision: 0 });
  const [controller] = useState(() => createVisualProfileController({ getToken: context.auth.getToken, onChange: setState }));
  useEffect(() => {
    const ticket = selection.current;
    const leave = () => { ticket.revision++; controller.cancel(); };
    globalThis.addEventListener('pagehide', leave);
    return () => { ticket.revision++; controller.cancel(false); globalThis.removeEventListener('pagehide', leave); };
  }, [controller]);
  useEffect(() => { if (disabled) controller.cancel(); }, [disabled, controller]);
  async function choose(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    const revision = ++selection.current.revision;
    controller.cancel(false);
    setImage(null); setState({ status: 'idle', busy: false });
    setSnapshot(null);setEditedId('');
    if (!file) { setReading(false); return; }
    setReading(true);
    try {
      const selected = await readReferenceFile(file);
      if (selection.current.revision === revision) setImage(selected);
    } catch {
      if (selection.current.revision === revision) setState({ status: 'error', message: 'Chọn PNG, JPEG hoặc WebP tối đa 1 MiB, 32–4096 px và 4 MP.' });
    } finally { if (selection.current.revision === revision) setReading(false); }
  }
  function cancel() {
    selection.current.revision++;
    controller.cancel(false);
    setReading(false);
    setState({ status: 'cancelled', busy: false, message: 'Đã bỏ đề xuất/dừng chờ; job trên server có thể vẫn chạy.' });
  }
  const resolved = resolveSceneCharacterProfile({ Character: character.id }, context.characters,'full-ai',context.projectId);
  async function detect(){
    const revision=selection.current.revision;setReading(true);
    try{const before=await context.prepare();if(revision!==selection.current.revision)return;setSnapshot(before);setEditedId('');await controller.submit(image);}
    catch(error){setState({status:'error',busy:false,message:error.message});}
    finally{if(revision===selection.current.revision)setReading(false);}
  }
  return <div data-detection-status={state.status} className="space-y-3">
    <p className="text-xs opacity-80">Qwen đề xuất ID từ ảnh. Chỉ khi xác nhận, ID mới được lưu và thay Character trong các scene liên kết chính xác; các nội dung khác giữ nguyên.</p>
    <label className="block text-xs">Ảnh tham chiếu cho {character.name}
      <input type="file" accept="image/png,image/jpeg,image/webp" onChange={choose} disabled={disabled || saving || !context.auth.isSignedIn} className="block mt-2 text-xs" />
    </label>
    {image && <img src={image.dataUrl} alt={'Ảnh tham chiếu ' + character.name} className="max-h-48 max-w-full rounded-lg object-contain" />}
    <div className="flex flex-wrap gap-2">
      <button className={button} disabled={disabled || saving || !context.auth.isSignedIn || !image || reading || state.busy}
        onClick={detect}>✦ Set ID</button>
      {(state.busy || state.status === 'detected' || reading) && <button className={button} onClick={cancel}>Hủy đề xuất / dừng chờ</button>}
    </div>
    {!context.auth.isSignedIn && <p>Đăng nhập để dùng Set ID.</p>}
    <p role="status" aria-live="polite">{reading ? 'Đang đọc ảnh…' : state.busy ? 'Đang chờ Qwen Vision…' : state.message}</p>
    {state.status === 'detected' && state.result && <div className="rounded-lg border border-purple-400/40 p-3 space-y-2">
      <p>Qwen đề xuất: <span className="font-mono break-all">{state.result.visual_id}</span></p><p>{state.result.visual_description}</p>
      <label>Character ID cuối cùng<input aria-label="Character ID cuối cùng" value={editedId||state.result.visual_id} disabled={saving} onChange={e=>setEditedId(e.target.value)} className="block w-full bg-slate-800 p-2"/></label>
      {resolved.status==='confirmed'&&<p>Thay ID đã lưu {resolved.identity.confirmedId} cần xác nhận mới bên dưới.</p>}
      <button className={button} disabled={disabled||saving||!validCharacterId(editedId||state.result.visual_id)} onClick={async () => {
        setSaving(true);
        try{const changed=await context.confirm(character,editedId||state.result.visual_id,image,state.jobId,snapshot);setState({ status: 'approved', message: 'Đã lưu Character ID. Cập nhật '+changed.length+' scene.' });}
        catch(error){setState(previous=>({...previous,message:error.message+' Không tự gửi lại; tải lại project để kiểm tra.'}));}
        finally{setSaving(false);}
      }}>{saving?'Đang lưu…':'Xác nhận Character ID và lưu'}</button>
    </div>}
    <p className="text-xs opacity-60">Giữ ảnh tham chiếu cùng profile. Visual ID dạng chữ không bảo đảm khuôn mặt nhất quán khi tạo video.</p>
  </div>;
}
export function SceneVisualProfile({ scene }) {
  const context = useContext(Profiles);
  if (!context) return null;
  const result = resolveSceneCharacterProfile(scene, context.characters,'full-ai',context.projectId);
  return <p className="text-xs mt-2 break-words text-purple-400" data-visual-status={result.status}>
    {['approved','confirmed'].includes(result.status) ? 'Character ID: ' + result.profile.visualId
      : result.status === 'ambiguous' ? 'Visual ID: tham chiếu nhân vật không rõ ràng.' : 'Visual ID: chưa có profile được duyệt.'}
  </p>;
}

// Read-only access to the existing approved overlay; no approval or persistence change.
export function SceneVisualProfileAccess({ scene, characters, projectId, children }) {
  const context = useContext(Profiles);
  return children(resolveSceneCharacterProfile(scene, context?.characters ?? characters,'full-ai',context?.projectId??projectId));
}
