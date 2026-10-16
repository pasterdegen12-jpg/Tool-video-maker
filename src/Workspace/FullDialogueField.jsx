import { readSpokenText, writeFullDialogue } from '../lib/spokenText.js';

export default function FullDialogueField({ scene, onChange, inputClassName }) {
  const spoken = readSpokenText(scene, 'full-ai');
  const choose = text => onChange(writeFullDialogue(scene, text));
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-bold">Dialogue (Thoại)</label>
      {spoken.issue && (
        <div role="alert" className="border border-amber-500/50 rounded-xl p-3 space-y-3 text-sm">
          <p>{spoken.message} Chỉ lưu lựa chọn khi bấm Lưu thay đổi.</p>
          {['Dialogue', 'Voiceover'].filter(field => Object.hasOwn(scene, field)).map(field => (
            <div key={field} className="space-y-1">
              <p className="font-bold">{field}{field === 'Voiceover' ? ' (dữ liệu cũ)' : ''}</p>
              <textarea aria-label={field + ' hiện có'} readOnly value={typeof scene[field] === 'string' ? scene[field] : JSON.stringify(scene[field]) ?? 'undefined'} className={inputClassName} />
              {typeof scene[field] === 'string' && (
                <button type="button" onClick={() => choose(scene[field])} className="underline font-bold cursor-pointer">
                  Giữ {field}
                </button>
              )}
            </div>
          ))}
          <button type="button" onClick={() => choose('')} className="underline font-bold cursor-pointer">Nhập Dialogue mới</button>
        </div>
      )}
      <textarea
        aria-label="Dialogue (Thoại)"
        value={spoken.text}
        readOnly={!!spoken.issue}
        onChange={event => choose(event.target.value)}
        className={inputClassName}
      />
    </div>
  );
}
