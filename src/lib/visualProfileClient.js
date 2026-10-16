import { validVisualProposal, MAX_REFERENCE_BYTES } from './visualProfile.js';

export async function readReferenceFile(file, maxBytes = MAX_REFERENCE_BYTES) {
  if (!file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || !file.size || file.size > maxBytes) {
    throw new Error('Chọn ảnh PNG, JPEG hoặc WebP tối đa ' + (maxBytes === MAX_REFERENCE_BYTES ? '1' : Math.round(maxBytes / 1048576)) + ' MiB.');
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sha = await crypto.subtle.digest('SHA-256', bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const image_base64 = btoa(binary);
  return { image_base64, mime_type: file.type,
    image_sha256: Array.from(new Uint8Array(sha), b => b.toString(16).padStart(2, '0')).join(''),
    dataUrl: 'data:' + file.type + ';base64,' + image_base64 };
}
function validateVisualInput(input) {
  return !input || typeof input.image_base64 !== 'string' || !input.image_base64.length ||
    input.image_base64.length > 1398104 || !['image/png','image/jpeg','image/webp'].includes(input.mime_type) ||
    !/^[a-f0-9]{64}$/.test(input.image_sha256) ? 'Chọn ảnh tham chiếu hợp lệ trước khi Set ID.' : null;
}
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function cancelled() { return new DOMException('Cancelled', 'AbortError'); }
function pause(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(cancelled());
    const onAbort = () => { clearTimeout(timer); reject(cancelled()); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve(); }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
function retryDelay(response, now) {
  const value = response.headers.get('Retry-After');
  if (!value) return 1000;
  const ms = /^\d+$/.test(value) ? Number(value) * 1000 : Date.parse(value) - now;
  return Number.isFinite(ms) ? Math.max(1000, ms) : 1000;
}

// One controller per selected character/image snapshot. Cancel invalidates late promises as well as fetch.
export function createVisualProfileController({ getToken, onChange, fetchImpl = fetch, now = Date.now, sleep = pause,
  requestTimeoutMs = 15000 } ) {
  let active = null;
  const emit = (run, update) => { if (active === run && !run.signal.aborted) onChange(update); };
  async function request(path, method, input, run, timeoutMs) {
    const controller = new AbortController();
    let sent = false, timer, onAbort;
    const interrupted = new Promise((_, reject) => {
      onAbort = () => { controller.abort(); reject(cancelled()); };
      run.signal.addEventListener('abort', onAbort, { once: true });
      timer = setTimeout(() => { controller.abort(); reject({ kind: 'unavailable', ambiguous: sent && method === 'POST' }); }, timeoutMs);
    });
    try {
      return await Promise.race([interrupted, (async () => {
        let token;
        try { token = await getToken(); } catch { throw { kind: 'auth_required' }; }
        if (run.signal.aborted || controller.signal.aborted || active !== run) throw cancelled();
        if (typeof token !== 'string' || !token) throw { kind: 'auth_required' };
        let response;
        try {
          sent = true;
          response = await fetchImpl(path, { method, redirect: 'error', mode: 'same-origin', credentials: 'omit',
            referrerPolicy: 'same-origin', signal: controller.signal,
            headers: { Authorization: 'Bearer ' + token, ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
            ...(method === 'POST' ? { body: JSON.stringify({ image_base64: input.image_base64, mime_type: input.mime_type }) } : {}) });
        } catch {
          if (run.signal.aborted) throw cancelled();
          throw { kind: 'unavailable', ambiguous: method === 'POST' };
        }
        let body;
        try {
          if (!response.headers.get('Content-Type')?.startsWith('application/json') || !response.body) throw new Error();
          const reader = response.body.getReader();
          let size = 0, raw = '';
          const decoder = new TextDecoder();
          try {
            while (true) {
              const chunk = await reader.read();
              if (chunk.done) break;
              size += chunk.value.byteLength;
              if (size > 8192) throw new Error();
              raw += decoder.decode(chunk.value, { stream: true });
            }
            body = JSON.parse(raw + decoder.decode());
          } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
        } catch { throw { kind: 'error', ambiguous: method === 'POST' }; }
        return { response, body };
      })()]);
    } finally { clearTimeout(timer); run.signal.removeEventListener('abort', onAbort); }
  }
  function failure(run, kind, message) { emit(run, { status: kind, busy: false, result: null, message }); }
  const messages = {
    auth_required: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Đăng nhập lại trước khi thử.',
    unavailable: 'Chưa kết nối được Qwen Vision Local. Kiểm tra backend local và cấu hình; không tự gửi lại ảnh.',
    expired: 'Job không còn khả dụng hoặc đã hết thời gian/số lần chờ. Đã dừng polling.',
    error: 'Phản hồi không đúng hợp đồng hoặc cấu hình không phù hợp. Đã dừng để kiểm tra.',
  };
  return {
    cancel(notify = true) {
      if (!active) return;
      const previous = active; active = null; previous.abort();
      if (notify) onChange({ status: 'cancelled', busy: false, result: null,
        message: 'Đã dừng chờ trên giao diện. Job trên server có thể vẫn đang chạy.' });
    },
    async submit(input) {
      if (active) return false;
      const issue = validateVisualInput(input);
      if (issue) { onChange({ status: 'error', busy: false, result: null, message: issue }); return false; }
      const run = new AbortController(); active = run;
      const submittedAt = now();
      emit(run, { status: 'submitting', busy: true, result: null, message: '' });
      try {
        const admitted = await request('/api/local-ai/visual-profile', 'POST', input, run, requestTimeoutMs);
        if (active !== run || run.signal.aborted) return false;
        const { response, body } = admitted;
        if (response.status !== 202) {
          const kind = response.status === 401 ? 'auth_required' : [404, 429, 503, 504].includes(response.status) ? 'unavailable' : 'error';
          let message = response.status === 429 ? 'Hàng đợi đang đầy. Không tự gửi lại; chờ ít nhất ' + Math.ceil(retryDelay(response, now()) / 1000) + ' giây trước khi thử thủ công.' : messages[kind];
          if (body?.error?.submission === 'unknown') message += ' Request có thể đã tạo job; tránh gửi lặp.';
          failure(run, kind, message); return false;
        }
        if (!isObject(body) || typeof body.job_id !== 'string' || !/^[a-f0-9]{48}$/.test(body.job_id) ||
            body.state !== 'queued' || body.status_url !== '/api/local-ai/jobs/' + body.job_id ||
            !Number.isInteger(body.max_polls) || body.max_polls < 1 || !Number.isFinite(Date.parse(body.expires_at))) {
          throw { kind: 'error', ambiguous: true };
        }
        const deadline = Math.min(Date.parse(body.expires_at), submittedAt + 300000);
        const maxPolls = Math.min(body.max_polls, 120);
        const path = '/api/local-ai/jobs/' + body.job_id;
        let delay = retryDelay(response, now()), errors = 0;
        emit(run, { status: 'queued', busy: true, result: null, message: '' });
        for (let polls = 0; polls < maxPolls; polls++) {
          if (now() >= deadline) break;
          await sleep(Math.min(delay, deadline - now()), run.signal);
          if (active !== run || run.signal.aborted) return false;
          if (now() >= deadline) break;
          let checked;
          try { checked = await request(path, 'GET', null, run, Math.min(requestTimeoutMs, deadline - now())); }
          catch (error) {
            if (error.kind !== 'unavailable') throw error;
            errors++;
            if (errors >= 3) throw error;
            delay = Math.min(1000 * 2 ** errors, 60000);
            emit(run, { status: 'unavailable', busy: true, result: null, message: 'Kết nối tạm gián đoạn. Sẽ kiểm tra lại trong giới hạn chờ.' });
            continue;
          }
          if (active !== run || run.signal.aborted) return false;
          if (now() >= deadline) break;
          const { response: polled, body: job } = checked;
          delay = retryDelay(polled, now());
          if (polled.status !== 200) {
            if (polled.status === 401) throw { kind: 'auth_required' };
            if ([404, 410].includes(polled.status)) break;
            if ([429, 503, 504].includes(polled.status) && job?.error?.retryable === true && ++errors < 3) {
              emit(run, { status: 'unavailable', busy: true, result: null, message: 'Qwen Vision đang bận hoặc mất kết nối. Đang chờ theo Retry-After.' });
              continue;
            }
            throw { kind: [429, 503, 504].includes(polled.status) ? 'unavailable' : 'error' };
          }
          errors = 0;
          if (!isObject(job) || job.job_id !== body.job_id || !['queued', 'running', 'completed', 'failed'].includes(job.state)) throw { kind: 'error' };
          if (job.state === 'completed') {
            if (job.error !== null || (job.result?.operation !== 'visual_profile' || job.result?.image_sha256 !== input.image_sha256 || !validVisualProposal(job.result?.profile))) throw { kind: 'error' };
            const proposal = job.result.profile;
            emit(run, { status: proposal.status, busy: false, result: proposal, jobId: body.job_id,
              message: proposal.status === 'ambiguous' ? 'Có nhiều người hoặc chưa rõ đối tượng. Chọn ảnh/crop chỉ có một người.'
                : proposal.status === 'no_human' ? 'Không thấy người rõ ràng. Chọn ảnh khác.' : '' }); return true;
          }
          if (job.state === 'failed') {
            if (job.result !== null || !isObject(job.error)) throw { kind: 'error' };
            failure(run, 'failed', 'Không thể nhận diện ảnh. Profile đã duyệt được giữ nguyên.'); return false;
          }
          if (job.result !== null || job.error !== null) throw { kind: 'error' };
          emit(run, { status: job.state, busy: true, result: null, message: '' });
        }
        failure(run, 'expired', messages.expired); return false;
      } catch (error) {
        if (active !== run || run.signal.aborted) return false;
        const kind = Object.hasOwn(messages, error.kind) ? error.kind : 'error';
        failure(run, kind, messages[kind] + (error.ambiguous ? ' Request có thể đã tạo job; không tự gửi lại POST.' : ''));
        return false;
      } finally { if (active === run) active = null; }
    },
  };
}
