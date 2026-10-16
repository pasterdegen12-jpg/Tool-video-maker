import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { approveVisualProfile, characterBinding, resolveSceneCharacterProfile, visualProfilesVisible } from '../lib/visualProfile.js';
import { createVisualProfileController, readReferenceFile } from '../lib/visualProfileClient.js';

const Profiles = createContext(null);
const button = 'px-3 py-2 rounded-lg border border-purple-400/40 text-xs font-semibold disabled:opacity-40 cursor-pointer';

export function VisualProfilesProvider({ projectId, projectType, characters, children }) {
  if (!visualProfilesVisible(import.meta.env, globalThis.location) || projectType !== 'full-ai') return children;
  return <AuthenticatedProfiles projectId={projectId} characters={characters}>{children}</AuthenticatedProfiles>;
}
function AuthenticatedProfiles({ projectId, characters, children }) {
  const auth = useAuth();
  return <SessionProfiles key={JSON.stringify([projectId, auth.sessionId, auth.userId, auth.isSignedIn])}
    characters={characters} auth={auth}>{children}</SessionProfiles>;
}
function SessionProfiles({ characters, auth, children }) {
  // Deliberately separate from projectCharacters: existing cloud/media save handlers never see this overlay.
  const [approved, setApproved] = useState({});
  const effective = characters.map(c => ({ ...c, visualProfile: approved[c.id] ?? c.visualProfile }));
  function confirm(character, proposal, image) {
    const matches = characters.filter(c => c.id === character.id);
    if (!auth.isSignedIn || matches.length !== 1 || characterBinding(matches[0]) !== characterBinding(character)) return false;
    const profile = approveVisualProfile(character, proposal, { dataUrl: image.dataUrl, sha256: image.image_sha256 });
    setApproved(previous => ({ ...previous, [character.id]: profile }));
    return true;
  }
  return <Profiles.Provider value={{ characters: effective, confirm, auth }}>{children}</Profiles.Provider>;
}
export function SetIdPanel({ character, disabled = false }) {
  const context = useContext(Profiles);
  if (!context) return null;
  const matches = context.characters.filter(c => c.id === character.id);
  if (matches.length !== 1 || typeof character.id !== 'string' || !character.id) return <p role="alert">Set ID: character ID thiếu hoặc trùng.</p>;
  return <Detection key={characterBinding(character)} context={context} character={character} disabled={disabled} />;
}
function Detection({ context, character, disabled }) {
  const [image, setImage] = useState(null);
  const [state, setState] = useState({ status: 'idle', busy: false });
  const [reading, setReading] = useState(false);
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
  const resolved = resolveSceneCharacterProfile({ Character: character.id }, context.characters);
  return <section data-detection-status={state.status} aria-label={'Visual ID ' + character.name} className="space-y-3 border-t border-purple-400/20 pt-4 text-sm">
    <p className="text-xs opacity-80">Chọn bản ảnh tham chiếu/OpenFrame từ máy. Profile chỉ giữ trong phiên này; chưa lưu Cloud.</p>
    <label className="block text-xs">Ảnh tham chiếu cho {character.name}
      <input type="file" accept="image/png,image/jpeg,image/webp" onChange={choose} disabled={disabled || !context.auth.isSignedIn} className="block mt-2 text-xs" />
    </label>
    {image && <img src={image.dataUrl} alt={'Ảnh tham chiếu ' + character.name} className="max-h-48 max-w-full rounded-lg object-contain" />}
    <div className="flex flex-wrap gap-2">
      <button className={button} disabled={disabled || !context.auth.isSignedIn || !image || reading || state.busy}
        onClick={() => controller.submit(image)}>✦ Set ID</button>
      {(state.busy || state.status === 'detected' || reading) && <button className={button} onClick={cancel}>Hủy đề xuất / dừng chờ</button>}
    </div>
    {!context.auth.isSignedIn && <p>Đăng nhập để dùng Set ID.</p>}
    <p role="status" aria-live="polite">{reading ? 'Đang đọc ảnh…' : state.busy ? 'Đang chờ Qwen Vision…' : state.message}</p>
    {state.status === 'detected' && state.result && <div className="rounded-lg border border-purple-400/40 p-3 space-y-2">
      <p className="font-mono break-all">{state.result.visual_id}</p><p>{state.result.visual_description}</p>
      <button className={button} disabled={disabled} onClick={() => {
        if (context.confirm(character, state.result, image)) setState({ status: 'approved', message: 'Đã duyệt trong phiên này. Các scene liên quan dùng chung profile.' });
        else setState({ status: 'error', message: 'Nhân vật đã thay đổi. Chọn ảnh và nhận diện lại.' });
      }}>Xác nhận Visual ID</button>
    </div>}
    {resolved.status === 'approved' && <div data-approved-visual-id={resolved.profile.visualId} className="text-xs space-y-2">
      <p>Đã duyệt: <span className="font-mono">{resolved.profile.visualId}</span></p>
      <img src={resolved.profile.referenceImage.dataUrl} alt="Ảnh đã duyệt" className="h-20 rounded object-contain" />
    </div>}
    <p className="text-xs opacity-60">Giữ ảnh tham chiếu cùng profile. Visual ID dạng chữ không bảo đảm khuôn mặt nhất quán khi tạo video.</p>
  </section>;
}
export function SceneVisualProfile({ scene }) {
  const context = useContext(Profiles);
  if (!context) return null;
  const result = resolveSceneCharacterProfile(scene, context.characters);
  return <p className="text-xs mt-2 break-words text-purple-400" data-visual-status={result.status}>
    {result.status === 'approved' ? 'Visual ID: ' + result.profile.visualId
      : result.status === 'ambiguous' ? 'Visual ID: tham chiếu nhân vật không rõ ràng.' : 'Visual ID: chưa có profile được duyệt.'}
  </p>;
}
