import { useEffect, useRef, useState } from 'react';

export default function GeminiRequestTest() {
  const sessionInput = useRef(null);
  const inFlight = useRef(null);
  const [showSession, setShowSession] = useState(false);
  const [prompt, setPrompt] = useState('Chỉ trả lời chính xác:\nDIRECT_REQUEST_TEST_92831');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => () => { inFlight.current?.abort(); }, []);

  async function testText(event) {
    event.preventDefault();
    if (inFlight.current) return;
    setResult(null);
    if (!sessionInput.current.value.trim() || !prompt.trim()) {
      setResult({ code: 'INVALID_REQUEST', message: 'Nhập session và prompt.' });
      sessionInput.current.value = '';
      setShowSession(false);
      return;
    }
    const controller = new AbortController();
    inFlight.current = controller;
    setBusy(true);
    let body = JSON.stringify({ session: sessionInput.current.value, prompt, experiment: 'omit-botguard' });
    sessionInput.current.value = '';
    setShowSession(false);
    const timeout = setTimeout(() => controller.abort(), 140000);
    try {
      const pending = fetch('/api/gemini-test/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        signal: controller.signal,
      });
      body = undefined;
      const response = await pending;
      const data = await response.json();
      if (response.ok && data.ok === true && data.code === 'DIRECT_GEMINI_SUCCESS' && typeof data.text === 'string' && data.text.trim()) {
        setResult({ code: data.code, text: data.text, markerMatch: data.markerMatch, debug: data.debug });
      } else if (!response.ok && typeof data.code === 'string') {
        setResult({ code: data.code, message: data.message, debug: data.debug });
      } else {
        // A successful HTTP status alone is not a Gemini answer.
        setResult({ code: 'GEMINI_RESPONSE_PARSE_FAILED', message: 'Chưa có response Gemini đã được xác minh.' });
      }
    } catch {
      setResult({ code: 'NETWORK_ERROR', message: 'Không nhận được JSON từ backend local. Kiểm tra server test ở cổng 8788.' });
    } finally {
      clearTimeout(timeout);
      inFlight.current = null;
      setBusy(false);
    }
  }

  const fieldClass = 'w-full rounded border border-slate-500 bg-transparent p-3';
  return (
    <main className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-3xl space-y-5">
        <h2 className="text-2xl font-bold">Gemini Direct Request Test</h2>
        <p>Development only · Phase 1A</p>
        <p role="note" className="rounded border border-amber-500 p-3">
          Thử nghiệm không gửi BotGuard: mỗi lần bấm gửi một prompt đến Gemini, không tự retry. Chưa xác minh server có chấp nhận chế độ này.
        </p>
        <form onSubmit={testText} className="space-y-4" autoComplete="off">
          <label className="block space-y-2">
            <span>Gemini Session / Cookies (Cookie header value)</span>
            <input ref={sessionInput} type={showSession ? 'text' : 'password'}
              className={fieldClass} maxLength={16384} autoComplete="off"
              spellCheck={false} autoCapitalize="none" disabled={busy} />
          </label>
          <button type="button" onClick={() => setShowSession(!showSession)}
            aria-pressed={showSession} disabled={busy} className="rounded border px-3 py-1">
            {showSession ? 'Ẩn session' : 'Hiện session'}
          </button>
          <p className="text-sm">Session bị xóa khỏi ô nhập khi submit; không lưu vào storage hay database. Không gửi session vào chat.</p>
          <label className="block space-y-2">
            <span>Prompt</span>
            <textarea className={fieldClass} rows={4} maxLength={16000}
              value={prompt} onChange={(event) => setPrompt(event.target.value)} disabled={busy} />
          </label>
          <label className="block space-y-2">
            <span>Video — chỉ bật sau khi text test chạy thật</span>
            <input className="block" type="file" accept="video/*" disabled />
          </label>
          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={busy} className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50">TEST TEXT REQUEST</button>
            <button type="button" disabled className="rounded border px-4 py-2 opacity-50">TEST VIDEO REQUEST</button>
          </div>
        </form>
        <section aria-live="polite" className="space-y-3">
          <h3 className="font-bold">Status: {busy ? 'Đang chờ Gemini, tối đa khoảng 140 giây…' : result?.code || 'Sẵn sàng thử nghiệm'}</h3>
          <p>{result?.message}</p>
          <h3 className="font-bold">Debug</h3>
          <p>Backend: local · Bỏ BotGuard · Video: chưa triển khai</p>
          <pre className="whitespace-pre-wrap text-sm">{result?.debug ? JSON.stringify(result.debug, null, 2) : ''}</pre>
          <h3 className="font-bold">Response</h3>
          <pre className="whitespace-pre-wrap break-words">{result?.text || 'Chưa nhận response thật từ Gemini.'}</pre>
          {result?.text && <p>Marker test: {result.markerMatch ? 'khớp' : 'không khớp'}</p>}
        </section>
      </div>
    </main>
  );
}
