/**
 * background/sw.js – Gemini Bridge v1.2  Service Worker
 *
 * Phase 1.2 – Job isolation:
 *  - Each job gets a fresh dedicated Gemini tab (never reuses user tabs)
 *  - jobId tracked throughout; all messages carry jobId
 *  - JOB_ALREADY_RUNNING returned if job is active
 *  - GEMINI_PING handshake before sending GEMINI_RUN
 *  - Awaited sendMessage for delivery confirmation
 *  - Job/tab mapping: jobId → tabId
 *  - Content-script messages validated against sender.tab.id + activeJobId
 *  - Cancel forwarded to exact job tab, not random Gemini tab
 */

const GEMINI_URL = "https://gemini.google.com/app";

// ── Active job state ──────────────────────────────────────────────────────────
let activeJobId = null;   // only one job at a time
let activeTabId = null;   // dedicated tab for that job

// ── Message listener ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  // ── From popup: start a new job ──────────────────────────────────────────
  if (msg.type === "JOB_REQUEST") {
    if (activeJobId) {
      // Reject instead of silently replacing the active job
      notifyPopup({
        type:  "JOB_ALREADY_RUNNING",
        jobId: msg.jobId,
      });
      sendResponse({ ok: false, reason: "JOB_ALREADY_RUNNING" });
      return true;
    }

    handleJobRequest(msg.jobId, msg.payload)
      .catch((err) => {
        notifyPopup({
          type:  "JOB_ERROR",
          jobId: msg.jobId,
          error: { code: "UNKNOWN_ERROR", message: err.message || String(err) },
        });
        clearActiveJob();
      });

    sendResponse({ ok: true });
    return true;
  }

  // ── From popup: cancel ───────────────────────────────────────────────────
  if (msg.type === "JOB_CANCEL") {
    const cancelJobId = msg.jobId;
    if (activeJobId && cancelJobId === activeJobId && activeTabId) {
      chrome.tabs.sendMessage(activeTabId, {
        type:  "GEMINI_CANCEL",
        jobId: activeJobId,
      }).catch(() => {});
    }
    clearActiveJob();
    sendResponse({ ok: true });
    return true;
  }

  // ── From content script: relay to popup ─────────────────────────────────
  // Validate sender tab and jobId to block cross-tab/cross-job pollution.
  const fromTabId  = sender?.tab?.id;
  const msgJobId   = msg.jobId;

  if (msg.type === "GEMINI_LOG") {
    // Only relay if from the active job tab
    if (fromTabId !== activeTabId || msgJobId !== activeJobId) return;
    notifyPopup({ type: "JOB_LOG", jobId: msgJobId, level: msg.level || "info", text: msg.text, status: msg.status });
    return;
  }

  if (msg.type === "GEMINI_DONE") {
    if (fromTabId !== activeTabId || msgJobId !== activeJobId) return;
    chrome.storage.session.set({ geminiJobRunning: false }).catch(() => {});
    notifyPopup({ type: "JOB_DONE", jobId: msgJobId, response: msg.response });
    clearActiveJob();
    return;
  }

  if (msg.type === "GEMINI_ERROR") {
    if (fromTabId !== activeTabId || msgJobId !== activeJobId) return;
    chrome.storage.session.set({ geminiJobRunning: false }).catch(() => {});
    notifyPopup({ type: "JOB_ERROR", jobId: msgJobId, error: msg.error });
    clearActiveJob();
    return;
  }
});

// ── Core orchestration ────────────────────────────────────────────────────────
async function handleJobRequest(jobId, payload) {
  activeJobId = jobId;

  await chrome.storage.session.set({
    geminiJobRunning: true,
    geminiJobStatus:  "Opening dedicated Gemini tab…",
    currentJobId:     jobId,
  });

  swLog(jobId, `Job start. promptLen=${payload.prompt?.length} fp=${payload.promptFp} files=${payload.files?.length || 0}`);
  for (const f of (payload.files || [])) {
    swLog(jobId, `  file: ${f.name} size=${f.size}`);
  }

  notifyPopup({ type: "JOB_LOG", jobId, level: "info",
    text: `[${jobId.slice(0,8)}] Creating fresh Gemini tab…`, status: "Opening tab…" });

  // ── Always create a FRESH dedicated tab — never reuse existing tabs ──────
  const tab = await createFreshGeminiTab(jobId);
  activeTabId = tab.id;

  swLog(jobId, `Dedicated tab created: tabId=${tab.id}`);
  notifyPopup({ type: "JOB_LOG", jobId, level: "info",
    text: `[${jobId.slice(0,8)}] Tab ${tab.id} ready — injecting content script…`, status: "Injecting…" });

  // ── Inject content script ────────────────────────────────────────────────
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files:  ["content/gemini.js"],
    });
  } catch (e) {
    // If already injected (e.g. manifest injected it), ignore
    swLog(jobId, `Script inject note: ${e.message}`);
  }

  // ── GEMINI_PING handshake: confirm content script is alive ───────────────
  notifyPopup({ type: "JOB_LOG", jobId, level: "info",
    text: "Waiting for content script handshake…", status: "Handshaking…" });

  const pingOk = await pingContentScript(tab.id, jobId);
  if (!pingOk) {
    clearActiveJob();
    notifyPopup({
      type:  "JOB_ERROR",
      jobId,
      error: { code: "CONTENT_SCRIPT_DELIVERY_FAILED",
               message: "Content script did not respond to GEMINI_PING after injection." },
    });
    return;
  }

  swLog(jobId, "Content script handshake OK");
  notifyPopup({ type: "JOB_LOG", jobId, level: "ok",
    text: "Content script ready ✓ — dispatching job…", status: "Dispatching…" });

  // ── Dispatch the job — await delivery confirmation ───────────────────────
  let deliveryOk = false;
  try {
    const resp = await chrome.tabs.sendMessage(tab.id, {
      type:    "GEMINI_RUN",
      jobId,
      payload,
    });
    deliveryOk = resp && resp.ok;
  } catch (e) {
    swLog(jobId, `GEMINI_RUN delivery error: ${e.message}`);
  }

  if (!deliveryOk) {
    clearActiveJob();
    notifyPopup({
      type:  "JOB_ERROR",
      jobId,
      error: { code: "CONTENT_SCRIPT_DELIVERY_FAILED",
               message: "GEMINI_RUN message was not acknowledged by content script." },
    });
  }
  // From here the content script drives the job and sends GEMINI_DONE/ERROR.
}

// ── Create a brand-new dedicated Gemini tab ───────────────────────────────────
async function createFreshGeminiTab(jobId) {
  const tab = await chrome.tabs.create({ url: GEMINI_URL, active: true });
  await waitForTabComplete(tab.id);
  // Bring window to front
  try { await chrome.windows.update(tab.windowId, { focused: true }); } catch (_) {}
  return chrome.tabs.get(tab.id);
}

function waitForTabComplete(tabId, timeoutMs = 45_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error(`Tab ${tabId} did not reach 'complete' within ${timeoutMs}ms`));
    }, timeoutMs);

    function listener(id, info) {
      if (id === tabId && info.status === "complete") {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

// ── Ping content script with retries ─────────────────────────────────────────
async function pingContentScript(tabId, jobId, maxAttempts = 8, intervalMs = 800) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await sleep(intervalMs);
    try {
      const resp = await chrome.tabs.sendMessage(tabId, { type: "GEMINI_PING", jobId });
      if (resp && resp.ok) return true;
    } catch (_) {
      // Content script not yet ready – retry
    }
    swLog(jobId, `GEMINI_PING attempt ${attempt}/${maxAttempts}…`);
  }
  return false;
}

// ── Cleanup ───────────────────────────────────────────────────────────────────
function clearActiveJob() {
  activeJobId = null;
  activeTabId = null;
  chrome.storage.session.set({ geminiJobRunning: false, currentJobId: null }).catch(() => {});
}

// ── Notify popup ──────────────────────────────────────────────────────────────
function notifyPopup(msg) {
  chrome.runtime.sendMessage(msg).catch(() => {
    // Popup may be closed — acceptable
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function swLog(jobId, text) {
  console.log(`[GeminiBridge SW] [${jobId?.slice(0,8) || "?"}] ${text}`);
}
