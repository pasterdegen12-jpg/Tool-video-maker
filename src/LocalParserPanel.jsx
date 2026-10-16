import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { createLocalParserController, validPreviewResult } from './lib/localParserClient.js';

const statusLabels = {
  idle: 'Sẵn sàng', submitting: 'Đang gửi kịch bản', queued: 'Đang xếp hàng (queued)',
  running: 'Đang phân tích (running)', completed: 'Đã phân tích (completed)', failed: 'Phân tích thất bại (failed)',
  expired: 'Hết hạn chờ (expired)', unavailable: 'Kết nối chưa khả dụng',
  auth_required: 'Cần đăng nhập lại', cancelled: 'Đã dừng chờ', error: 'Cần kiểm tra',
};

function SourceValue({ label, value }) {
  return <div className="min-w-0"><dt className="text-xs font-semibold opacity-70">{label}</dt>
    <dd className="mt-1 whitespace-pre-wrap break-words text-sm" data-source-field={label}>
      {value === '' ? <span className="italic opacity-60">Trống trong kết quả nguồn</span> : value}
    </dd></div>;
}

export function LocalParserPreview({ result }) {
  if (!validPreviewResult(result, result?.projectType)) return <p role="alert">Kết quả không đúng hợp đồng preview.</p>;
  const full = result.projectType === 'full-ai';
  const fields = full ? ['Character', 'Dialogue', 'Translate', 'Tone_of_Voice', 'Context', 'Camera', 'Action']
    : ['Voiceover', 'Footage', 'time_origin', 'Effect', 'Translate', 'Tone_of_Voice', 'Character'];
  return <div className="mt-5 space-y-4" aria-label="Kết quả parser Local">
    <p className="font-semibold">{full ? 'Full AI' : 'Semi-Content'} · {result.web_data.scenes.length} scene · {result.web_data.characters.length} nhân vật</p>
    <p className="text-sm opacity-80">Chỉ xem trước dữ liệu trích xuất từ nguồn, chưa lưu dự án. Không có phần bổ sung bằng AI.</p>
    {full ? <section aria-label="Nhân vật nguồn">
      <h4 className="font-semibold mb-2">Nhân vật</h4>
      <ul className="space-y-2">{result.web_data.characters.map(character => <li key={character.id} className="border border-current/15 rounded-lg p-3">
        <p className="font-semibold">{character.name}</p>
        <dl className="mt-2 grid gap-2 sm:grid-cols-2"><SourceValue label="description" value={character.description} /><SourceValue label="voiceTone" value={character.voiceTone} /></dl>
      </li>)}</ul>
    </section> : <p className="text-sm">Semi giữ danh sách nhân vật rỗng; Voiceover và Footage là hai trường riêng.</p>}
    <div className="max-h-[32rem] overflow-y-auto pr-2" aria-label="Các scene theo thứ tự nguồn">
      <ol className="space-y-3">{result.web_data.scenes.map((scene, index) => <li key={scene.scene_n}>
        <details open={index === 0} className="border border-current/15 rounded-lg p-3">
          <summary className="cursor-pointer font-semibold">Scene {scene.scene_n}{full ? ' · ' + scene.Character : ''}</summary>
          <dl className="grid gap-4 mt-4 sm:grid-cols-2">{fields.map(field => <SourceValue key={field} label={field} value={scene[field]} />)}</dl>
          {!full && <details className="mt-3"><summary className="cursor-pointer text-sm">Metadata nguồn của scene</summary>
            <pre className="text-xs whitespace-pre-wrap break-words mt-2">{JSON.stringify(result.source_metadata.scenes[index], null, 2)}</pre>
          </details>}
        </details>
      </li>)}</ol>
    </div>
    <details className="border border-current/15 rounded-lg p-3"><summary className="cursor-pointer font-semibold">Tất cả metadata nguồn (source_metadata)</summary>
      <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(result.source_metadata, null, 2)}</pre>
    </details>
  </div>;
}

function LocalParserRun({ script, projectType, language, auth, blocked }) {
  const [state, setState] = useState({ status: 'idle', busy: false, result: null, message: '' });
  const [controller] = useState(() => createLocalParserController({ getToken: auth.getToken, onChange: setState }));
  useEffect(() => {
    const onLeave = () => controller.cancel();
    window.addEventListener('pagehide', onLeave);
    return () => { window.removeEventListener('pagehide', onLeave); controller.cancel(false); };
  }, [controller]);
  return <>
    <div className="flex flex-wrap items-center gap-3 mt-4">
      <button type="button" disabled={blocked || state.busy || !auth.isLoaded || !auth.isSignedIn}
        onClick={() => { void controller.submit({ projectType, script, language }); }}
        className="rounded-lg border border-cyan-500/60 px-4 py-3 font-semibold bg-cyan-500/10 hover:bg-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed">
        Phân tích kịch bản có cấu trúc (Local)
      </button>
      {state.busy && <button type="button" onClick={() => controller.cancel()} className="rounded-lg border border-current/25 px-4 py-3">Dừng chờ</button>}
    </div>
    {(!auth.isLoaded || !auth.isSignedIn) && <p className="text-sm mt-2">Cần phiên đăng nhập Clerk hợp lệ để sử dụng parser Local.</p>}
    <p className="mt-3 text-sm font-semibold" role="status" aria-live="polite">{statusLabels[state.status]}</p>
    {state.message && <p className="mt-2 text-sm whitespace-pre-wrap" role={state.busy || state.status === 'cancelled' ? 'status' : 'alert'}>{state.message}</p>}
    {state.result && <LocalParserPreview result={state.result} />}
  </>;
}

export default function LocalParserPanel({ script, projectType, language, onProjectTypeChange, onLanguageChange, darkMode, blocked }) {
  const auth = useAuth();
  // A new input/session gets a new component instance. Old callbacks cannot fill the new preview.
  const snapshotKey = JSON.stringify([script, projectType, language, auth.sessionId, auth.isSignedIn, blocked]);
  const selectClass = 'rounded-lg border border-current/20 p-2 ' + (darkMode ? 'bg-slate-950 text-slate-100' : 'bg-white text-zinc-900');
  return <section className={'relative z-10 mt-8 border-t border-cyan-500/30 pt-6 ' + (darkMode ? 'text-slate-200' : 'text-zinc-800')}
    aria-labelledby="local-parser-title">
    <h2 id="local-parser-title" className="font-bold text-lg">Đọc kịch bản có cấu trúc · Local</h2>
    <p className="text-sm mt-2 leading-relaxed opacity-80">Chỉ trích xuất theo quy tắc từ định dạng scene_N. Không dùng Qwen, không viết kịch bản mới, không suy diễn mô tả nhân vật hay Voice Profile, không tạo video hoặc audio.</p>
    <p className="text-xs mt-2 opacity-70">Kết quả chỉ để xem trước. Đổi kịch bản, workflow hoặc ngôn ngữ sẽ đóng preview và dừng chờ cũ. Dừng chờ không hủy job trên server.</p>
    <div className="mt-4 flex flex-wrap gap-4">
      <label className="flex flex-col gap-1 text-sm">Workflow Local
        <select value={projectType} onChange={event => onProjectTypeChange(event.target.value)} className={selectClass} disabled={blocked}>
          <option value="full-ai">Full AI — Dialogue + Character</option><option value="semi">Semi-Content — Voiceover + Time_origin</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">Ngôn ngữ kịch bản (không dịch)
        <select value={language} onChange={event => onLanguageChange(event.target.value)} className={selectClass} disabled={blocked}>
          <option value="en">English (en)</option><option value="vi">Tiếng Việt (vi)</option>
        </select>
      </label>
    </div>
    <LocalParserRun key={snapshotKey} script={script} projectType={projectType} language={language} auth={auth} blocked={blocked} />
  </section>;
}
