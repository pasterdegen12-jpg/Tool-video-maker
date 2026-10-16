// Browser client: only the Web-owned relative API. No gateway configuration belongs here.
export function localParserVisible(env, location) {
  return env.DEV === true && env.VITE_ENABLE_LOCAL_PARSER === 'true' &&
    location?.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(location.hostname);
}

export function validateLocalInput(input) {
  if (!['full-ai', 'semi'].includes(input.projectType) || !['en', 'vi'].includes(input.language)) return 'Chọn đúng workflow và ngôn ngữ.';
  if (typeof input.script !== 'string' || !input.script.trim()) return 'Nhập kịch bản trước khi phân tích.';
  if ([...input.script].length > 40000 || new TextEncoder().encode(JSON.stringify(input)).length > 262144) return 'Kịch bản vượt giới hạn 40.000 ký tự hoặc kích thước request cho phép.';
  if (!/^[ \t]*scene_[1-9][0-9]*[ \t]*\r?$/m.test(input.script)) return 'Parser Local cần kịch bản có cấu trúc scene_N (ví dụ scene_1). Prompt tự do chưa được gửi.';
  return null;
}

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export function validPreviewResult(result, projectType) {
  if (!isObject(result) || result.projectType !== projectType || result.execution !== 'deterministic_cpu' ||
      !isObject(result.web_data) || !isObject(result.source_metadata)) return false;
  const { characters, scenes } = result.web_data;
  const metadata = result.source_metadata;
  if (!Array.isArray(scenes) || !scenes.length || !Array.isArray(characters) ||
      !Array.isArray(metadata.scenes) || metadata.scenes.length !== scenes.length ||
      typeof metadata.header_raw !== 'string' || !isObject(metadata.header_metadata) ||
      typeof metadata.source_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(metadata.source_sha256)) return false;
  const full = projectType === 'full-ai';
  if (!full && characters.length) return false;
  if (characters.some(c => !isObject(c) || ['id', 'name', 'description', 'voiceTone'].some(k => typeof c[k] !== 'string'))) return false;
  const names = new Set(characters.map(c => c.name));
  const seen = new Set();
  return scenes.every((scene, index) => {
    const fields = full ? ['Character', 'Dialogue', 'Translate', 'Tone_of_Voice', 'Context', 'Camera', 'Action']
      : ['Voiceover', 'Footage', 'time_origin', 'Effect', 'Character', 'Translate', 'Tone_of_Voice'];
    const extra = metadata.scenes[index];
    if (!isObject(scene) || !Number.isSafeInteger(scene.scene_n) || scene.scene_n < 1 || seen.has(scene.scene_n) ||
        fields.some(k => typeof scene[k] !== 'string') || !isObject(extra) || !isObject(extra.metadata) ||
        extra.scene_id !== 'scene_' + scene.scene_n ||
        (full ? 'Voiceover' in scene || 'time_origin' in scene || !names.has(scene.Character) : 'Dialogue' in scene)) return false;
    seen.add(scene.scene_n);
    return true;
  });
}

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

// One controller per immutable editor snapshot. Cancel invalidates late promises as well as fetch.
export function createLocalParserController({ getToken, onChange, fetchImpl = fetch, now = Date.now, sleep = pause,
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
            ...(method === 'POST' ? { body: JSON.stringify({ projectType: input.projectType, script: input.script, language: input.language }) } : {}) });
        } catch {
          if (run.signal.aborted) throw cancelled();
          throw { kind: 'unavailable', ambiguous: method === 'POST' };
        }
        let body;
        try { body = await response.json(); } catch { throw { kind: 'error', ambiguous: method === 'POST' }; }
        return { response, body };
      })()]);
    } finally { clearTimeout(timer); run.signal.removeEventListener('abort', onAbort); }
  }
  function failure(run, kind, message) { emit(run, { status: kind, busy: false, result: null, message }); }
  const messages = {
    auth_required: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Đăng nhập lại trước khi thử.',
    unavailable: 'Chưa kết nối được parser Local. Kiểm tra backend local và cấu hình; không tự gửi lại kịch bản.',
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
      const issue = validateLocalInput(input);
      if (issue) { onChange({ status: 'error', busy: false, result: null, message: issue }); return false; }
      const run = new AbortController(); active = run;
      const submittedAt = now();
      emit(run, { status: 'submitting', busy: true, result: null, message: '' });
      try {
        const admitted = await request('/api/local-ai/analyze', 'POST', input, run, requestTimeoutMs);
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
              emit(run, { status: 'unavailable', busy: true, result: null, message: 'Parser đang bận hoặc mất kết nối. Đang chờ theo Retry-After.' });
              continue;
            }
            throw { kind: [429, 503, 504].includes(polled.status) ? 'unavailable' : 'error' };
          }
          errors = 0;
          if (!isObject(job) || job.job_id !== body.job_id || !['queued', 'running', 'completed', 'failed'].includes(job.state)) throw { kind: 'error' };
          if (job.state === 'completed') {
            if (job.error !== null || !validPreviewResult(job.result, input.projectType)) throw { kind: 'error' };
            emit(run, { status: 'completed', busy: false, result: job.result, message: '' }); return true;
          }
          if (job.state === 'failed') {
            if (job.result !== null || !isObject(job.error)) throw { kind: 'error' };
            const scene = /^scene_[1-9][0-9]*$/.test(job.error.details?.scene_id || '') ? ' (' + job.error.details.scene_id + ')' : '';
            failure(run, 'failed', 'Parser không chấp nhận kịch bản' + scene + '. Kiểm tra cấu trúc và các trường của workflow đã chọn.'); return false;
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
