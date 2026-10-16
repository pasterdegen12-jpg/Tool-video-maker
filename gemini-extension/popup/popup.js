/**
 * popup.js – Gemini Bridge v1.2
 *
 * Phase 1.2 – Job isolation & exact submission:
 *  - jobId per click (crypto.randomUUID)
 *  - FileReader race fixed: Send disabled until all files fully prepared
 *  - pendingFiles complete before JOB_REQUEST dispatched
 *  - Snapshot prompt at click time (immutable)
 *  - promptFingerprint logged for tracing
 *  - currentJobId stored; incoming messages filtered by jobId
 *  - JOB_ALREADY_RUNNING rejection surfaced to user
 *  - Session-storage restore of jobId across popup re-opens
 */

// ── DOM refs ──────────────────────────────────────────────────────────────────
const statusBar       = document.getElementById("statusBar");
const statusText      = document.getElementById("statusText");
const promptInput     = document.getElementById("promptInput");
const fileInput       = document.getElementById("fileInput");
const fileList        = document.getElementById("fileList");
const fileStatus      = document.getElementById("fileStatus");
const useProCheckbox  = document.getElementById("useProCheckbox");
const sendBtn         = document.getElementById("sendBtn");
const cancelBtn       = document.getElementById("cancelBtn");
const clearBtn        = document.getElementById("clearBtn");
const responseSection = document.getElementById("responseSection");
const responseOutput  = document.getElementById("responseOutput");
const copyBtn         = document.getElementById("copyBtn");
const clearResponseBtn = document.getElementById("clearResponseBtn");
const logOutput       = document.getElementById("logOutput");
const logCount        = document.getElementById("logCount");

// ── State ─────────────────────────────────────────────────────────────────────
/** @type {{ name: string, mimeType: string, size: number, dataUrl: string }[]} */
let pendingFiles       = [];
let isPreparingFiles   = false;   // true while FileReader is running
let isRunning          = false;
let currentJobId       = null;
let logEntryCount      = 0;

// ── Prompt fingerprint (FNV-1a 32-bit, hex) ──────────────────────────────────
function fnv1a32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

// ── File selection — fix FileReader race ─────────────────────────────────────
fileInput.addEventListener("change", async () => {
  const rawFiles = Array.from(fileInput.files);
  pendingFiles      = [];
  fileList.innerHTML = "";
  fileList.classList.add("hidden");

  if (rawFiles.length === 0) {
    updateSendReady();
    return;
  }

  // Lock Send while reading
  isPreparingFiles = true;
  updateSendReady();
  setFileStatus(`Reading ${rawFiles.length} file(s)…`, "preparing");

  fileList.classList.remove("hidden");

  try {
    // Read ALL files in parallel, but display items as we go
    const results = await Promise.all(rawFiles.map(async (file) => {
      const dataUrl = await readAsDataUrl(file);
      return { name: file.name, mimeType: file.type || "application/octet-stream", size: file.size, dataUrl };
    }));

    pendingFiles = results;

    // Render file list
    for (const f of pendingFiles) {
      const item = document.createElement("div");
      item.className = "file-item";
      item.innerHTML = `<span class="file-icon">📎</span>
        <span class="file-name">${escapeHtml(f.name)}</span>
        <span class="file-size">${formatSize(f.size)}</span>`;
      fileList.appendChild(item);
    }

    setFileStatus(`${pendingFiles.length} file(s) ready ✓`, "ready");

  } catch (err) {
    pendingFiles = [];
    setFileStatus(`File read error: ${err.message}`, "error");
    log("error", `[FILE_PREPARATION_FAILED] ${err.message}`);
  } finally {
    isPreparingFiles = false;
    updateSendReady();
  }
});

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve(e.target.result);
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function setFileStatus(text, kind) {
  if (!fileStatus) return;
  fileStatus.textContent = text;
  fileStatus.className   = `file-status file-status-${kind}`;
  fileStatus.classList.toggle("hidden", !text);
}

// Send is disabled when: preparing files, or job running
function updateSendReady() {
  const canSend = !isPreparingFiles && !isRunning;
  sendBtn.disabled = !canSend;
  if (isPreparingFiles) {
    sendBtn.title = "Waiting for files to finish loading…";
  } else {
    sendBtn.title = "";
  }
}

// ── Send ──────────────────────────────────────────────────────────────────────
sendBtn.addEventListener("click", async () => {
  // Snapshot prompt at click time — immutable for this job
  const requestedPrompt = promptInput.value.trim();
  if (!requestedPrompt) { setStatus("error", "Please enter a prompt."); return; }
  if (isRunning)         { log("warn", "Job already running"); return; }
  if (isPreparingFiles)  { log("warn", "Files still loading — please wait"); return; }

  // Verify file count matches what we prepared
  const selectedCount = fileInput.files ? fileInput.files.length : 0;
  if (selectedCount !== pendingFiles.length) {
    setStatus("error", "File list mismatch — please re-select files");
    log("error", `[FILE_PREPARATION_INCOMPLETE] selected=${selectedCount} prepared=${pendingFiles.length}`);
    return;
  }

  // Compute fingerprint for tracing
  const fp     = fnv1a32(requestedPrompt);
  const jobId  = crypto.randomUUID();
  currentJobId = jobId;

  clearResponse();
  clearLog();
  setRunning(true);
  setStatus("running", "Sending to Gemini…");

  // Log job metadata (no full prompt by default)
  log("info", `job=${jobId.slice(0, 8)} promptLen=${requestedPrompt.length} fp=${fp} files=${pendingFiles.length}`);
  for (const f of pendingFiles) {
    log("info", `  file: ${f.name} (${formatSize(f.size)}) ${f.mimeType}`);
  }

  // Persist for popup re-open
  chrome.storage.session.set({
    geminiJobRunning: true,
    geminiJobStatus:  "Sending to Gemini…",
    currentJobId:     jobId,
  }).catch(() => {});

  const message = {
    type:    "JOB_REQUEST",
    jobId,
    payload: {
      jobId,
      prompt:    requestedPrompt,
      promptFp:  fp,
      usePro:    useProCheckbox.checked,
      files:     pendingFiles.map(f => ({
        name:     f.name,
        mimeType: f.mimeType,
        size:     f.size,
        dataUrl:  f.dataUrl,
      })),
    },
  };

  try {
    await chrome.runtime.sendMessage(message);
  } catch (err) {
    setStatus("error", `Send error: ${err.message}`);
    log("error", err.message);
    setRunning(false);
    currentJobId = null;
    chrome.storage.session.set({ geminiJobRunning: false, currentJobId: null }).catch(() => {});
  }
});

// ── Cancel ────────────────────────────────────────────────────────────────────
cancelBtn.addEventListener("click", async () => {
  if (!currentJobId) return;
  try {
    await chrome.runtime.sendMessage({ type: "JOB_CANCEL", jobId: currentJobId });
    log("warn", "Cancel requested");
    setStatus("idle", "Cancelling…");
  } catch (_) {}
});

// ── Clear ─────────────────────────────────────────────────────────────────────
clearBtn.addEventListener("click", () => {
  if (isRunning) return;  // don't clear during active job
  promptInput.value  = "";
  fileInput.value    = "";
  pendingFiles       = [];
  fileList.innerHTML = "";
  fileList.classList.add("hidden");
  setFileStatus("", "");
  clearResponse();
  clearLog();
  setStatus("idle", "Idle");
  updateSendReady();
});

// ── Copy / Clear response ─────────────────────────────────────────────────────
copyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(responseOutput.textContent);
    copyBtn.textContent = "✅";
    setTimeout(() => { copyBtn.textContent = "📋"; }, 1500);
  } catch {
    copyBtn.textContent = "❌";
    setTimeout(() => { copyBtn.textContent = "📋"; }, 1500);
  }
});

clearResponseBtn.addEventListener("click", clearResponse);

// ── Incoming messages — filtered by jobId ─────────────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  // Filter: ignore messages not belonging to the current job
  // (except JOB_ALREADY_RUNNING which has no jobId)
  if (msg.type !== "JOB_ALREADY_RUNNING" && msg.jobId && msg.jobId !== currentJobId) {
    console.log(`[GeminiBridge popup] Ignored stale message type=${msg.type} jobId=${msg.jobId}`);
    return;
  }

  if (msg.type === "JOB_LOG") {
    log(msg.level || "info", msg.text);
    if (msg.status) setStatus("running", msg.status);
    return;
  }

  if (msg.type === "JOB_DONE") {
    setRunning(false);
    setStatus("success", "Done ✓");
    log("ok", "Response received");
    showResponse(msg.response || "(empty response)");
    currentJobId = null;
    chrome.storage.session.set({ geminiJobRunning: false, currentJobId: null }).catch(() => {});
    return;
  }

  if (msg.type === "JOB_ERROR") {
    setRunning(false);
    const errObj = msg.error;
    if (errObj && typeof errObj === "object") {
      const code    = errObj.code    || "UNKNOWN_ERROR";
      const message = errObj.message || "Unknown error";
      setStatus("error", `[${code}]`);
      log("error", `[${code}] ${message}`);
      if (errObj.details) log("error", `  Details: ${errObj.details}`);
    } else {
      setStatus("error", "Error");
      log("error", String(errObj || "Unknown error"));
    }
    currentJobId = null;
    chrome.storage.session.set({ geminiJobRunning: false, currentJobId: null }).catch(() => {});
    return;
  }

  if (msg.type === "JOB_ALREADY_RUNNING") {
    setRunning(false);
    setStatus("error", "[JOB_ALREADY_RUNNING]");
    log("error", "[JOB_ALREADY_RUNNING] A job is already active. Use Cancel first.");
    currentJobId = null;
    return;
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function setStatus(kind, text) {
  statusBar.className   = `status-bar status-${kind}`;
  statusText.textContent = text;
}

function setRunning(running) {
  isRunning = running;
  sendBtn.classList.toggle("hidden", running);
  cancelBtn.classList.toggle("hidden", !running);
  updateSendReady();
}

function showResponse(text) {
  responseOutput.textContent = text;
  responseSection.classList.remove("hidden");
}

function clearResponse() {
  responseOutput.textContent = "";
  responseSection.classList.add("hidden");
}

function clearLog() {
  logOutput.innerHTML  = "";
  logEntryCount        = 0;
  logCount.textContent = "";
}

function log(level, text) {
  const ts = new Date().toLocaleTimeString("en-US", { hour12: false });
  const el = document.createElement("div");
  el.className   = `log-entry ${level}`;
  el.textContent = `[${ts}] ${text}`;
  logOutput.appendChild(el);
  logOutput.scrollTop = logOutput.scrollHeight;
  logEntryCount++;
  logCount.textContent = `(${logEntryCount})`;
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatSize(bytes) {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ── Restore mid-job state on popup re-open ────────────────────────────────────
chrome.storage.session.get(["geminiJobRunning", "geminiJobStatus", "currentJobId"], (data) => {
  if (data.geminiJobRunning) {
    currentJobId = data.currentJobId || null;
    setRunning(true);
    setStatus("running", data.geminiJobStatus || "Running…");
    log("info", `Job in progress (id=${currentJobId?.slice(0, 8) || "?"}) — use Cancel to abort`);
  }
  updateSendReady();
});
