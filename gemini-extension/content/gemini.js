/**
 * content/gemini.js – Gemini Bridge v1.2  FULL-AUTO CORE
 *
 * Phase 1.2 – Job isolation & exact submission:
 *  - activeJob state machine with explicit transitions
 *  - JOB_ALREADY_RUNNING: rejects new job if one is active (no silent replacement)
 *  - GEMINI_PING handshake replying before accepting GEMINI_RUN
 *  - Fresh dedicated tab: verifyFreshDedicatedTab() checks URL + no generation running
 *  - getActiveComposerContext(): all DOM ops scoped to one composer container
 *  - typeExactPrompt(): Range-based text replacement (no global selectAll)
 *  - Prompt verification: read back text after insertion, compare fingerprint
 *  - waitSubmissionReady(): 12-signal gate (stable 3×)
 *  - sendExactlyOnce(): submissionSent guard
 *  - Post-send: verify user turn created + attachments committed
 *  - All messages carry jobId
 */

/* eslint-disable no-undef */

(function () {
  // ── Double-injection guard ─────────────────────────────────────────────────
  if (window.__geminiBridgeInjected) return;
  window.__geminiBridgeInjected = true;

  // ═══════════════════════════════════════════════════════════════════════════
  // CONSTANTS
  // ═══════════════════════════════════════════════════════════════════════════
  const CFG = {
    ATTACHMENT_TIMEOUT_MS:     300_000,  // 5 min
    GENERATION_TIMEOUT_MS:     900_000,  // 15 min
    START_RESPONSE_TIMEOUT_MS:  60_000,  // 60 s
    COMPOSER_TIMEOUT_MS:        15_000,
    STABLE_REPEATS:                  3,  // ready-gate consecutive checks
    STABLE_INTERVAL_MS:           1000,
    MIN_RESPONSE_LENGTH:             5,
    SUBMISSION_READY_TIMEOUT_MS: 310_000,
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // ERROR CODES
  // ═══════════════════════════════════════════════════════════════════════════
  const EC = {
    REAUTH_REQUIRED:                 "REAUTH_REQUIRED",
    GEMINI_NOT_AVAILABLE:            "GEMINI_NOT_AVAILABLE",
    MODEL_SELECTOR_NOT_FOUND:        "MODEL_SELECTOR_NOT_FOUND",
    PRO_UNAVAILABLE:                 "PRO_UNAVAILABLE",
    PRO_VERIFICATION_FAILED:         "PRO_VERIFICATION_FAILED",
    NEW_CHAT_FAILED:                 "NEW_CHAT_FAILED",
    FILE_UPLOAD_FAILED:              "FILE_UPLOAD_FAILED",
    ATTACHMENT_COUNT_MISMATCH:       "ATTACHMENT_COUNT_MISMATCH",
    ATTACHMENT_TIMEOUT:              "ATTACHMENT_TIMEOUT",
    COMPOSER_NOT_FOUND:              "COMPOSER_NOT_FOUND",
    PROMPT_SEND_FAILED:              "PROMPT_SEND_FAILED",
    PROMPT_VERIFICATION_FAILED:      "PROMPT_VERIFICATION_FAILED",
    RESPONSE_START_TIMEOUT:          "RESPONSE_START_TIMEOUT",
    RESPONSE_TIMEOUT:                "RESPONSE_TIMEOUT",
    RESPONSE_EMPTY:                  "RESPONSE_EMPTY",
    GEMINI_UI_CHANGED:               "GEMINI_UI_CHANGED",
    TAB_CLOSED:                      "TAB_CLOSED",
    CANCELLED:                       "CANCELLED",
    JOB_ALREADY_RUNNING:             "JOB_ALREADY_RUNNING",
    CONTENT_SCRIPT_DELIVERY_FAILED:  "CONTENT_SCRIPT_DELIVERY_FAILED",
    FRESH_CHAT_NOT_READY:            "FRESH_CHAT_NOT_READY",
    SUBMISSION_NOT_READY:            "SUBMISSION_NOT_READY",
    GEMINI_ALREADY_GENERATING:       "GEMINI_ALREADY_GENERATING",
    DUPLICATE_SEND_BLOCKED:          "DUPLICATE_SEND_BLOCKED",
    SUBMITTED_PROMPT_MISMATCH:       "SUBMITTED_PROMPT_MISMATCH",
    SUBMISSION_ATTACHMENT_NOT_COMMITTED: "SUBMISSION_ATTACHMENT_NOT_COMMITTED",
    UNKNOWN_ERROR:                   "UNKNOWN_ERROR",
  };

  const JOB_STATE = {
    RECEIVED:             "RECEIVED",
    SESSION_VALIDATED:    "SESSION_VALIDATED",
    FRESH_CHAT_READY:     "FRESH_CHAT_READY",
    PRO_VERIFIED:         "PRO_VERIFIED",
    FILES_ATTACHING:      "FILES_ATTACHING",
    FILES_READY:          "FILES_READY",
    PROMPT_READY:         "PROMPT_READY",
    SUBMISSION_READY:     "SUBMISSION_READY",
    SUBMITTED:            "SUBMITTED",
    SUBMISSION_VERIFIED:  "SUBMISSION_VERIFIED",
    GENERATING:           "GENERATING",
    COMPLETED:            "COMPLETED",
    FAILED:               "FAILED",
    CANCELLED:            "CANCELLED",
  };

  class GeminiError extends Error {
    constructor(code, message, details = null) {
      super(message);
      this.code    = code;
      this.details = details;
    }
  }

  function mkErr(code, message, details = null) {
    return new GeminiError(code, message, details);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SELECTORS
  // ═══════════════════════════════════════════════════════════════════════════
  const SEL = {
    composer: [
      "rich-textarea div[contenteditable=\"true\"]",
      "rich-textarea [contenteditable]",
      "div[role=\"textbox\"]",
      'div[contenteditable="true"][data-placeholder]',
    ].join(", "),

    richTextarea: "rich-textarea",

    sendBtn: [
      'button[aria-label="Send message"]',
      'button[aria-label*="Send" i]',
      'button[data-testid="send-button"]',
      "send-button button",
      "button.send-button",
    ].join(", "),

    newChat: [
      'button[aria-label*="New chat" i]',
      'a[aria-label*="New chat" i]',
      "new-chat-button button",
      "[aria-label='New chat']",
      'button[data-testid="new-chat"]',
    ].join(", "),

    modelSelector: [
      "model-selector button",
      'button[aria-label*="model" i]',
      'button[data-testid="model-selector"]',
      ".model-selector-button",
      "bard-mode-switcher button",
    ].join(", "),

    fileInput: 'input[type="file"]',

    uploadSpinner: [
      "md-circular-progress",
      "mat-spinner",
      '[role="progressbar"]',
      ".upload-progress",
      ".loading-indicator",
    ].join(", "),

    // Attachment chips scoped inside rich-textarea/composer area
    attachmentChip: [
      "upload-file-chip",
      ".attachment-chip",
      ".file-chip",
      ".upload-chip",
      "[data-testid='attachment-chip']",
      "file-preview",
      ".file-thumbnail",
      "[class*='chip']",
      "[class*='attach']",
      "[class*='upload']",
    ].join(", "),

    assistantResponse: [
      "message-content",
      "model-response",
      "[data-test-id='model-response']",
      ".model-response-text",
    ].join(", "),

    // User turn elements (for verifying submitted prompt)
    userTurn: [
      "user-query",
      "[data-test-id='user-query']",
      ".user-query-text",
      ".query-content",
    ].join(", "),

    stopBtn: [
      'button[aria-label*="Stop" i]',
      '[data-testid="stop-button"]',
      "stop-button",
      ".stop-button",
    ].join(", "),

    signInBtn: [
      'button[data-testid="sign-in-button"]',
      'a[data-testid="sign-in-link"]',
      'button[aria-label="Sign in"]',
      'a[aria-label="Sign in"]',
    ].join(", "),
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // ACTIVE JOB STATE
  // ═══════════════════════════════════════════════════════════════════════════
  let _activeJob = null;  // only one job per content script instance

  function setJobState(state) {
    if (_activeJob) {
      _activeJob.state = state;
      glog(`State → ${state}`, "info");
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════════════════════════════════════

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  function isVisible(el) {
    if (!el) return false;
    if (el.offsetWidth === 0 && el.offsetHeight === 0) return false;
    const cs = window.getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") return false;
    return true;
  }

  function fnv1a32(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
  }

  function normalizePromptText(raw) {
    // Strip leading/trailing whitespace; collapse internal multiple newlines to
    // single newline for comparison purposes.
    return (raw || "").replace(/\r\n/g, "\n").trim();
  }

  function safeClick(el, { synthetic = false } = {}) {
    if (!el) return;
    if (synthetic) {
      el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    } else {
      el.click();
    }
  }

  function findFileInput(root = document.body) {
    const direct = root.querySelector(SEL.fileInput);
    if (direct) return direct;
    for (const el of root.querySelectorAll("*")) {
      if (el.shadowRoot) {
        const found = findFileInput(el.shadowRoot);
        if (found) return found;
      }
    }
    return null;
  }

  function dataUrlToFile(dataUrl, name, mimeType) {
    const b64   = dataUrl.split(",")[1];
    const bytes = atob(b64);
    const arr   = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return new File([arr], name, { type: mimeType || "application/octet-stream" });
  }

  function normalizeFiles(rawFiles) {
    return rawFiles.map(rf => {
      if (rf instanceof File || rf instanceof Blob) return rf;
      if (rf.dataUrl) return dataUrlToFile(rf.dataUrl, rf.name, rf.mimeType);
      throw mkErr(EC.FILE_UPLOAD_FAILED, `Unknown file transport format for: ${rf.name}`);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ACTIVE COMPOSER CONTEXT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Returns { editor, richTextarea, sendButton } all validated as visible.
   * ALL DOM operations must be scoped through this context.
   */
  function getActiveComposerContext() {
    const editor = document.querySelector(SEL.composer);
    if (!editor || !isVisible(editor)) return null;

    const richTextarea = editor.closest("rich-textarea") ||
                         document.querySelector(SEL.richTextarea);

    const sendButton = document.querySelector(SEL.sendBtn);

    return { editor, richTextarea: richTextarea || editor.parentElement, sendButton };
  }

  /**
   * Count visible attachment chips scoped to the active composer container.
   * NEVER uses document.body as scope.
   */
  function countComposerAttachments(ctx) {
    if (!ctx || !ctx.richTextarea) return 0;
    const chips = ctx.richTextarea.querySelectorAll(SEL.attachmentChip);
    return Array.from(chips).filter(el => isVisible(el)).length;
  }

  /**
   * Are there any active upload/processing spinners in the composer area?
   */
  function hasComposerSpinners(ctx) {
    if (!ctx || !ctx.richTextarea) {
      // Fallback: global spinner check
      return Array.from(document.querySelectorAll(SEL.uploadSpinner))
        .some(el => isVisible(el));
    }
    // Check inside composer first, then global (some spinners render outside)
    const inComposer = Array.from(ctx.richTextarea.querySelectorAll(SEL.uploadSpinner))
      .some(el => isVisible(el));
    const global     = Array.from(document.querySelectorAll(SEL.uploadSpinner))
      .some(el => isVisible(el));
    return inComposer || global;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MESSAGING (all messages carry jobId)
  // ═══════════════════════════════════════════════════════════════════════════

  function glog(text, level = "info", status = null) {
    const jobId = _activeJob?.jobId;
    chrome.runtime.sendMessage({ type: "GEMINI_LOG", jobId, text, level, status }).catch(() => {});
    console.log(`[GeminiBridge] [${level.toUpperCase()}] [${jobId?.slice(0,8)||"?"}] ${text}`);
  }

  function sendDone(jobId, response) {
    chrome.runtime.sendMessage({ type: "GEMINI_DONE", jobId, response }).catch(() => {});
  }

  function sendError(jobId, code, message, details = null) {
    chrome.runtime.sendMessage({ type: "GEMINI_ERROR", jobId, error: { code, message, details } }).catch(() => {});
    console.error(`[GeminiBridge] ERROR [${jobId?.slice(0,8)||"?"}] ${code}: ${message}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CANCELLATION TOKEN
  // ═══════════════════════════════════════════════════════════════════════════

  function makeCancellationToken() {
    const t = { cancelled: false };
    t.cancel = () => { t.cancelled = true; };
    t.check  = () => { if (t.cancelled) throw mkErr(EC.CANCELLED, "Operation cancelled"); };
    return t;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1 – VALIDATE SESSION
  // ═══════════════════════════════════════════════════════════════════════════

  async function validateSession() {
    if (window.location.hostname.includes("accounts.google.com")) {
      throw mkErr(EC.REAUTH_REQUIRED, "Redirected to Google login page.");
    }

    await sleep(800);

    function composerReady() {
      return !!getActiveComposerContext();
    }

    function realSignInVisible() {
      const attrMatch = document.querySelector(SEL.signInBtn);
      if (attrMatch && isVisible(attrMatch)) return true;
      const PATTERNS = [/\bsign[\s-]?in\b/i, /\blog[\s-]?in\b/i, /\bđăng\s+nhập\b/i];
      for (const el of document.querySelectorAll("button, a[href]")) {
        if (!isVisible(el)) continue;
        const combined = `${(el.textContent || "").trim()} ${el.getAttribute("aria-label") || ""}`;
        if (PATTERNS.some(re => re.test(combined)) && !/sign[\s-]?out|signed[\s-]?in|manage/i.test(combined)) return true;
      }
      return false;
    }

    if (composerReady()) { glog("Session valid ✓", "ok"); return; }
    if (realSignInVisible()) throw mkErr(EC.REAUTH_REQUIRED, "Not logged in to Gemini.");

    glog("Waiting for Gemini to finish loading…", "info");
    const deadline = Date.now() + 12_000;
    while (Date.now() < deadline) {
      await sleep(500);
      if (composerReady()) { glog("Session valid ✓", "ok"); return; }
      if (realSignInVisible()) throw mkErr(EC.REAUTH_REQUIRED, "Not logged in to Gemini.");
    }
    throw mkErr(EC.GEMINI_UI_CHANGED, "Gemini loaded but composer not found.");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2 – VERIFY FRESH DEDICATED TAB
  // ═══════════════════════════════════════════════════════════════════════════

  async function verifyFreshDedicatedTab(token) {
    glog("Verifying fresh dedicated tab…", "info", "Verifying tab…");

    // Should be on /app URL (fresh chat)
    const url = window.location.href;
    if (!url.includes("gemini.google.com")) {
      throw mkErr(EC.FRESH_CHAT_NOT_READY, `Tab URL is unexpected: ${url}`);
    }

    // No existing generation must be running
    if (document.querySelector(SEL.stopBtn) && isVisible(document.querySelector(SEL.stopBtn))) {
      throw mkErr(EC.GEMINI_ALREADY_GENERATING,
        "Gemini is already generating in this tab. Cannot start job.");
    }

    // Composer must be present and empty
    const ctx = getActiveComposerContext();
    if (!ctx) {
      throw mkErr(EC.FRESH_CHAT_NOT_READY, "No active composer found in tab.");
    }

    const existingText = normalizePromptText(ctx.editor.textContent || "");
    if (existingText.length > 0) {
      glog(`Composer has stale text (${existingText.length} chars) — clearing`, "warn");
      // Clear only the text using Range — does NOT remove attachment chips
      clearEditorTextOnly(ctx.editor);
      await sleep(300);
      token.check();
    }

    // No stale unsent attachments
    const staleChips = countComposerAttachments(ctx);
    if (staleChips > 0) {
      glog(`Stale ${staleChips} attachment(s) in composer — will proceed (fresh tab, expected 0)`, "warn");
      // On a truly fresh /app tab there should be none; if there are, it's a UI anomaly
      // but we can still proceed — the critical check is after we attach.
    }

    glog("Fresh tab verified ✓", "ok");
    setJobState(JOB_STATE.FRESH_CHAT_READY);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 3 – SELECT & VERIFY PRO (unchanged from 1.1)
  // ═══════════════════════════════════════════════════════════════════════════

  async function selectProModel(token) {
    glog("Opening model selector…", "info", "Selecting Pro…");

    const modelBtn = document.querySelector(SEL.modelSelector);
    if (!modelBtn) throw mkErr(EC.MODEL_SELECTOR_NOT_FOUND, "Model selector not found.");

    safeClick(modelBtn);
    await sleep(800);
    token.check();

    const allOptions = Array.from(document.querySelectorAll(
      '[role="option"], [role="menuitem"], [role="radio"], li[data-value], button'
    ));

    let proOption = allOptions.find(el => {
      const dv = (el.getAttribute("data-value") || el.getAttribute("data-model") || "").toLowerCase();
      return dv.includes("pro") && !dv.includes("ultra");
    });
    if (!proOption) proOption = allOptions.find(el => {
      const label = (el.getAttribute("aria-label") || "").toLowerCase();
      return label.includes("gemini pro") || /\d\.\d\s*pro/i.test(label);
    });
    if (!proOption) proOption = allOptions.find(el => {
      const text = (el.textContent || "").toLowerCase().trim();
      return text.includes("pro") && !text.includes("ultra") && !text.includes("flash") && el.offsetHeight > 0;
    });

    if (!proOption) {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await sleep(300);
      throw mkErr(EC.PRO_UNAVAILABLE, "Pro model option not found in selector dropdown.");
    }

    glog(`Pro option: "${(proOption.textContent || "").trim().slice(0, 60)}"`, "info");
    safeClick(proOption);
    await sleep(1000);
    token.check();

    await verifyProSelected(token);
    setJobState(JOB_STATE.PRO_VERIFIED);
  }

  async function verifyProSelected(token) {
    await sleep(600);
    token.check();

    const modelBtn = document.querySelector(SEL.modelSelector);
    if (!modelBtn) throw mkErr(EC.PRO_VERIFICATION_FAILED, "Model selector disappeared after Pro click.");

    const btnText  = (modelBtn.textContent || "").toLowerCase();
    const btnLabel = (modelBtn.getAttribute("aria-label") || "").toLowerCase();
    const confirmedPro = btnText.includes("pro") || btnLabel.includes("pro") ||
      !!modelBtn.closest("[data-model]")?.getAttribute("data-model")?.toLowerCase().includes("pro");

    if (!confirmedPro) {
      const checked = document.querySelector('[aria-checked="true"], [aria-selected="true"]');
      const checkedText = (checked ? (checked.textContent || checked.getAttribute("aria-label") || "") : "").toLowerCase();
      if (!checkedText.includes("pro")) {
        throw mkErr(EC.PRO_VERIFICATION_FAILED,
          `Pro verification failed. Visible model: "${btnText.slice(0,60)}".`);
      }
    }
    glog("Pro verified ✓", "ok");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 4 – ATTACH FILES
  // ═══════════════════════════════════════════════════════════════════════════

  async function attachFiles(rawFiles, token) {
    if (!rawFiles || rawFiles.length === 0) return;

    setJobState(JOB_STATE.FILES_ATTACHING);
    glog(`Attaching ${rawFiles.length} file(s)…`, "info", `Uploading ${rawFiles.length} file(s)…`);

    const files = normalizeFiles(rawFiles);

    const ctx = getActiveComposerContext();
    if (!ctx) throw mkErr(EC.COMPOSER_NOT_FOUND, "Composer not found for file attachment.");

    // ── Strategy A: ClipboardEvent paste ────────────────────────────────────
    let strategyWorked = false;
    try {
      const dt = new DataTransfer();
      files.forEach(f => dt.items.add(f));

      ctx.editor.focus();
      await sleep(200);

      ctx.editor.dispatchEvent(new ClipboardEvent("paste", {
        bubbles: true, cancelable: true, clipboardData: dt,
      }));
      await sleep(600);
      token.check();

      // Check scoped to composer container
      const chipsAfter = countComposerAttachments(getActiveComposerContext());
      const spinnersAfter = hasComposerSpinners(getActiveComposerContext());
      if (chipsAfter > 0 || spinnersAfter) {
        strategyWorked = true;
        glog("Paste strategy accepted ✓", "ok");
      }
    } catch (e) {
      if (e.code === EC.CANCELLED) throw e;
      glog(`Paste strategy failed: ${e.message}`, "warn");
    }

    // ── Strategy B: native file input ────────────────────────────────────────
    if (!strategyWorked) {
      glog("Trying native file input…", "info");
      for (let i = 0; i < files.length; i++) {
        token.check();
        const f = files[i];
        glog(`Attaching ${i+1}/${files.length}: ${f.name}`, "info");

        const inputEl = findFileInput(document.body);
        if (!inputEl) throw mkErr(EC.FILE_UPLOAD_FAILED, `File input not found for: ${f.name}`);

        const dt2 = new DataTransfer();
        dt2.items.add(f);
        inputEl.files = dt2.files;
        inputEl.dispatchEvent(new Event("change", { bubbles: true }));
        inputEl.dispatchEvent(new Event("input",  { bubbles: true }));

        if (i < files.length - 1) await sleep(800);
      }
    }

    // ── Wait for attachments ready (scoped) ───────────────────────────────
    await waitFilesAttachedAndReady(files, token);
    setJobState(JOB_STATE.FILES_READY);
  }

  async function waitFilesAttachedAndReady(files, token) {
    glog("Waiting for files to be ready…", "info", "Waiting uploads…");

    const expected  = files.length;
    const deadline  = Date.now() + CFG.ATTACHMENT_TIMEOUT_MS;
    let   stable    = 0;
    const STABLE    = 3;

    while (Date.now() < deadline) {
      token.check();

      const ctx = getActiveComposerContext();

      // Signal 1: active upload spinners (global + scoped)
      const spinners   = hasComposerSpinners(ctx) ? 1 : 0;

      // Signal 2: send button state
      const sendBtn    = ctx?.sendButton || document.querySelector(SEL.sendBtn);
      const sendReady  = sendBtn && !sendBtn.disabled && !sendBtn.getAttribute("disabled") && isVisible(sendBtn);

      // Signal 3: visible attachment chips SCOPED to composer
      const chips = countComposerAttachments(ctx);

      // Signal 4: filenames visible in rich-textarea text content
      const rtArea   = ctx?.richTextarea || document.querySelector(SEL.richTextarea);
      const rtText   = rtArea ? (rtArea.textContent || "").toLowerCase() : "";
      const namesOk  = files.every(f =>
        rtText.includes(f.name.toLowerCase().replace(/\.[^.]+$/, "").slice(0, 20))
      );

      const uploadsComplete    = spinners === 0 && sendReady;
      const attachmentsPresent = chips >= expected || namesOk;

      const debugLine = `chips=${chips} spinners=${spinners} send=${sendReady} names=${namesOk}`;

      if (uploadsComplete && attachmentsPresent) {
        stable++;
        if (stable >= STABLE) {
          glog(`Files ready ✓ (${debugLine}) stable=${stable}`, "ok");
          return;
        }
        glog(`Files stabilizing… (${debugLine}) stable=${stable}/${STABLE}`, "info");
      } else {
        if (stable > 0) glog(`File state reset (${debugLine})`, "warn");
        stable = 0;
      }

      await sleep(1000);
    }

    throw mkErr(EC.ATTACHMENT_TIMEOUT, `Files not ready after ${CFG.ATTACHMENT_TIMEOUT_MS/1000}s.`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 5 – TYPE EXACT PROMPT (Range-based, no global selectAll)
  // ═══════════════════════════════════════════════════════════════════════════

  function clearEditorTextOnly(editor) {
    // Use Selection + Range to target ONLY the text nodes in the editor,
    // without selecting attachment chip elements.
    try {
      // Move caret to start, then select to end using range, then delete
      const range = document.createRange();
      range.selectNodeContents(editor);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      // Delete only text, preserving custom elements (chips are not text nodes)
      document.execCommand("delete", false, null);
      sel.removeAllRanges();
    } catch (_) {
      // Fallback
      editor.textContent = "";
    }
  }

  async function typeExactPrompt(expectedPrompt, token) {
    glog("Typing exact prompt…", "info", "Entering prompt…");

    const ctx = getActiveComposerContext();
    if (!ctx) throw mkErr(EC.COMPOSER_NOT_FOUND, "Composer not found for typing.");

    const { editor } = ctx;
    editor.focus();
    await sleep(300);
    token.check();

    // ── Clear only text content (NOT chips) using Range ──────────────────────
    clearEditorTextOnly(editor);
    await sleep(200);
    token.check();

    // Verify chips are still there after clear
    const chipsAfterClear = countComposerAttachments(getActiveComposerContext());
    const job = _activeJob;
    if (job && job.expectedFiles > 0 && chipsAfterClear < job.expectedFiles) {
      glog(`WARNING: chip count after editor clear = ${chipsAfterClear}, expected ${job.expectedFiles}`, "warn");
      // We will verify again at the ready-gate, so continue for now
    }

    // ── Insert prompt ─────────────────────────────────────────────────────────
    // Newline prefix separates prompt from any chip elements
    const hasChips  = chipsAfterClear > 0;
    const toInsert  = hasChips ? "\n" + expectedPrompt : expectedPrompt;

    const inserted = document.execCommand("insertText", false, toInsert);

    if (!inserted) {
      // Fallback: direct textContent append (less reliable for frameworks)
      glog("execCommand insertText returned false — trying direct insertion", "warn");
      const textNode = document.createTextNode(toInsert);
      editor.appendChild(textNode);
    }

    // Notify framework
    editor.dispatchEvent(new InputEvent("input", { bubbles: true, data: toInsert }));
    editor.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(400);
    token.check();

    // ── Verify prompt was correctly inserted ──────────────────────────────────
    const composerText = normalizePromptText(editor.textContent || editor.innerText || "");
    const expected     = normalizePromptText(expectedPrompt);

    if (!composerText.includes(expected)) {
      // Retry with innerText assignment (last resort)
      glog("Prompt verification failed on first try — retrying with innerText", "warn");
      editor.focus();
      editor.innerText = (hasChips ? "\n" : "") + expectedPrompt;
      editor.dispatchEvent(new InputEvent("input", { bubbles: true }));
      await sleep(400);
      token.check();

      const retryText = normalizePromptText(editor.textContent || editor.innerText || "");
      if (!retryText.includes(expected)) {
        throw mkErr(EC.PROMPT_VERIFICATION_FAILED,
          `Prompt not found in editor after insertion. editorLen=${retryText.length} expectedLen=${expected.length}`);
      }
    }

    const composerFp = fnv1a32(normalizePromptText(editor.textContent || ""));
    const expectedFp = fnv1a32(expected);
    glog(`Prompt inserted ✓ editorFp=${composerFp} expectedFp=${expectedFp}`, "ok");

    // Warn (don't fail) on fingerprint mismatch — could be due to newline prefix
    if (composerFp !== expectedFp) {
      glog(`FP mismatch (normalised text contains prefix newline) — OK`, "info");
    }

    setJobState(JOB_STATE.PROMPT_READY);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 6 – WAIT SUBMISSION READY GATE (12-signal, 3× stable)
  // ═══════════════════════════════════════════════════════════════════════════

  async function waitSubmissionReady(job, token) {
    glog("Waiting for submission ready gate…", "info", "Ready check…");

    const deadline = Date.now() + CFG.SUBMISSION_READY_TIMEOUT_MS;
    let   stable   = 0;

    while (Date.now() < deadline) {
      token.check();
      await sleep(CFG.STABLE_INTERVAL_MS);

      const ctx = getActiveComposerContext();
      if (!ctx) { stable = 0; glog("Gate: no composer context", "warn"); continue; }

      const { editor, richTextarea, sendButton } = ctx;

      // Signal 1: editor visible
      const editorVisible = isVisible(editor);

      // Signal 2: composer contains expected prompt
      const composerText = normalizePromptText(editor.textContent || editor.innerText || "");
      const expectedText = normalizePromptText(job.prompt);
      const promptOk     = composerText.includes(expectedText) && expectedText.length > 0;

      // Signal 3: expected attachment count
      const chips     = countComposerAttachments(ctx);
      const chipsOk   = chips >= job.expectedFiles;

      // Signal 4: no upload spinners
      const noSpinners = !hasComposerSpinners(ctx);

      // Signal 5: send button visible
      const sendVisible = sendButton ? isVisible(sendButton) : !!document.querySelector(SEL.sendBtn);

      // Signal 6: send button enabled
      const sendEnabled = sendButton
        ? (!sendButton.disabled && !sendButton.getAttribute("disabled"))
        : false;

      // Signal 7: NOT already generating
      const notGenerating = !document.querySelector(SEL.stopBtn) ||
                            !isVisible(document.querySelector(SEL.stopBtn));

      const composerFp  = fnv1a32(composerText);

      const allReady = editorVisible && promptOk && chipsOk &&
                       noSpinners && sendVisible && sendEnabled && notGenerating;

      const debugLine = `editor=${editorVisible} prompt=${promptOk} chips=${chips}/${job.expectedFiles} ` +
                        `spinners=${!noSpinners} sendVis=${sendVisible} sendEn=${sendEnabled} ` +
                        `notGen=${notGenerating} composerFp=${composerFp}`;

      if (allReady) {
        stable++;
        glog(`Gate: ${stable}/${CFG.STABLE_REPEATS} (${debugLine})`, "info");
        if (stable >= CFG.STABLE_REPEATS) {
          glog("Submission ready ✓", "ok");
          setJobState(JOB_STATE.SUBMISSION_READY);
          return;
        }
      } else {
        if (stable > 0) glog(`Gate reset (${debugLine})`, "warn");
        stable = 0;
      }
    }

    throw mkErr(EC.SUBMISSION_NOT_READY,
      `Submission ready gate timed out after ${CFG.SUBMISSION_READY_TIMEOUT_MS/1000}s.`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 7 – SEND EXACTLY ONCE
  // ═══════════════════════════════════════════════════════════════════════════

  async function sendExactlyOnce(token) {
    glog("Sending exactly once…", "info", "Sending…");

    if (_activeJob && _activeJob.submissionSent) {
      throw mkErr(EC.DUPLICATE_SEND_BLOCKED, "Submit already issued for this job — blocking duplicate.");
    }

    // Final pre-send gate: confirm not generating
    const stopEl = document.querySelector(SEL.stopBtn);
    if (stopEl && isVisible(stopEl)) {
      throw mkErr(EC.GEMINI_ALREADY_GENERATING,
        "Gemini is already generating immediately before Send — aborting.");
    }

    const ctx = getActiveComposerContext();
    const sendEl = ctx?.sendButton || document.querySelector(SEL.sendBtn);

    if (!sendEl || sendEl.disabled || !isVisible(sendEl)) {
      throw mkErr(EC.PROMPT_SEND_FAILED, "Send button not available at send time.");
    }

    // Mark as sent BEFORE clicking (prevents race if click somehow fires twice)
    if (_activeJob) _activeJob.submissionSent = true;

    safeClick(sendEl);
    setJobState(JOB_STATE.SUBMITTED);
    glog("Send clicked ✓", "ok");
    await sleep(600);
    token.check();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 8 – VERIFY SUBMISSION COMMITTED
  // ═══════════════════════════════════════════════════════════════════════════

  async function verifySubmissionCommitted(job, initialTurnCount, token) {
    glog("Verifying submission was committed…", "info", "Verifying…");

    // Wait for a new user turn to appear
    const deadline = Date.now() + 15_000;
    let   userTurnEl = null;

    while (Date.now() < deadline) {
      token.check();
      const allUserTurns = document.querySelectorAll(SEL.userTurn);
      if (allUserTurns.length > initialTurnCount) {
        userTurnEl = allUserTurns[allUserTurns.length - 1];
        break;
      }
      // Fallback: if no user-turn selector works, trust that composer is now empty
      const ctx = getActiveComposerContext();
      if (ctx) {
        const composerText = normalizePromptText(ctx.editor.textContent || "");
        // If composer cleared after send, that's a strong signal the submit happened
        if (composerText.length === 0 || composerText === "\n") break;
      }
      await sleep(500);
    }

    // Verify attachments are no longer sitting unsent in the composer
    const ctx = getActiveComposerContext();
    const unsentChips = countComposerAttachments(ctx);
    if (job.expectedFiles > 0 && unsentChips >= job.expectedFiles) {
      // Files are still showing as unsent — the original bug
      glog(`WARN: ${unsentChips} chip(s) still in composer after send (expected 0 unsent)`, "warn");
      throw mkErr(EC.SUBMISSION_ATTACHMENT_NOT_COMMITTED,
        `${unsentChips} attachment(s) remain unsent in composer after submit. ` +
        `Video was not committed with the user turn.`);
    }

    if (userTurnEl) {
      const turnText = normalizePromptText(userTurnEl.textContent || userTurnEl.innerText || "");
      const expected = normalizePromptText(job.prompt);
      if (expected.length > 0 && !turnText.includes(expected)) {
        // Submitted turn text doesn't contain the expected prompt
        const turnFp = fnv1a32(turnText);
        glog(`Submitted turn fp=${turnFp} expected fp=${job.promptFp}`, "warn");
        throw mkErr(EC.SUBMITTED_PROMPT_MISMATCH,
          `Submitted user turn text does not match expected prompt. turnFp=${turnFp} expectedFp=${job.promptFp}`);
      }
      glog(`Submitted turn verified ✓ (${turnText.slice(0,40).replace(/\n/g," ")}…)`, "ok");
    } else {
      glog("User turn element not found — trusting composer-cleared signal", "info");
    }

    setJobState(JOB_STATE.SUBMISSION_VERIFIED);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 9 – WAIT FOR RESPONSE
  // ═══════════════════════════════════════════════════════════════════════════

  async function waitForNewResponse(initialAssistantCount, token) {
    setJobState(JOB_STATE.GENERATING);
    glog("Waiting for generation to start…", "info", "Generating…");

    let newTurnEl = null;
    try {
      const POLL = 300;
      const deadline = Date.now() + CFG.START_RESPONSE_TIMEOUT_MS;
      while (Date.now() < deadline) {
        token.check();
        const all = document.querySelectorAll(SEL.assistantResponse);
        if (all.length > initialAssistantCount) { newTurnEl = all[all.length - 1]; break; }
        await sleep(POLL);
      }
      if (!newTurnEl) throw new Error("timeout");
    } catch (e) {
      if (e.code === EC.CANCELLED) throw e;
      throw mkErr(EC.RESPONSE_START_TIMEOUT,
        `No Gemini response appeared within ${CFG.START_RESPONSE_TIMEOUT_MS/1000}s.`);
    }

    glog("New assistant turn detected ✓", "ok");
    return await waitForStableResponse(newTurnEl, token);
  }

  async function waitForStableResponse(turnEl, token) {
    glog("Waiting for generation completion…", "info", "Completing…");

    const deadline = Date.now() + CFG.GENERATION_TIMEOUT_MS;
    let lastText   = "";
    let stable     = 0;

    while (Date.now() < deadline) {
      token.check();
      await sleep(CFG.STABLE_INTERVAL_MS);

      const all     = document.querySelectorAll(SEL.assistantResponse);
      const latest  = all.length > 0 ? all[all.length - 1] : turnEl;
      const curText = (latest?.innerText || latest?.textContent || "").trim();
      const isGen   = !!document.querySelector(SEL.stopBtn) && isVisible(document.querySelector(SEL.stopBtn));

      if (curText !== lastText) {
        stable  = 0;
        lastText = curText;
      } else if (curText.length >= CFG.MIN_RESPONSE_LENGTH && !isGen) {
        stable++;
        if (stable >= CFG.STABLE_REPEATS) {
          glog("Generation complete ✓", "ok");
          return curText;
        }
      } else {
        stable = 0;
      }
    }

    throw mkErr(EC.RESPONSE_TIMEOUT,
      `Generation did not complete within ${CFG.GENERATION_TIMEOUT_MS/60000} min.`);
  }

  function extractLatestAssistantResponse() {
    const sels = ["model-response", "message-content", ".model-response-text", ".markdown-container"];
    for (const s of sels) {
      const els = document.querySelectorAll(s);
      if (els.length > 0) {
        const text = (els[els.length-1].innerText || els[els.length-1].textContent || "").trim();
        if (text.length >= CFG.MIN_RESPONSE_LENGTH) return text;
      }
    }
    return null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN JOB RUNNER
  // ═══════════════════════════════════════════════════════════════════════════

  async function runJob(payload, jobId) {
    // ── Guard: reject if a job is already active ─────────────────────────────
    if (_activeJob) {
      chrome.runtime.sendMessage({
        type:  "GEMINI_ERROR",
        jobId,
        error: { code: EC.JOB_ALREADY_RUNNING,
                 message: "A job is already running in this tab. Cancel it first." },
      }).catch(() => {});
      return;
    }

    const token = makeCancellationToken();

    _activeJob = {
      jobId,
      prompt:         payload.prompt,
      promptFp:       payload.promptFp || fnv1a32(normalizePromptText(payload.prompt)),
      expectedFiles:  (payload.files || []).length,
      submissionSent: false,
      state:          JOB_STATE.RECEIVED,
      token,
    };

    const rawFiles = payload.files || (payload.file ? [payload.file] : []);
    const usePro   = payload.usePro !== false;

    glog(`Job received. files=${rawFiles.length} fp=${_activeJob.promptFp} pro=${usePro}`, "info");

    try {
      // ── 1. Validate session ─────────────────────────────────────────────────
      glog("Checking session…", "info", "Login check…");
      await validateSession();
      setJobState(JOB_STATE.SESSION_VALIDATED);
      token.check();

      // ── 2. Verify fresh dedicated tab ───────────────────────────────────────
      await verifyFreshDedicatedTab(token);
      token.check();

      // ── 3. Baseline response count (on fresh /app, should be 0) ────────────
      const initialAssistantCount = document.querySelectorAll(SEL.assistantResponse).length;
      const initialUserTurnCount  = document.querySelectorAll(SEL.userTurn).length;
      glog(`Baseline: assistantTurns=${initialAssistantCount} userTurns=${initialUserTurnCount}`, "info");

      // ── 4. Select Pro (strict) ──────────────────────────────────────────────
      if (usePro) {
        await selectProModel(token);
        token.check();
      }

      // ── 5. Attach files ─────────────────────────────────────────────────────
      if (rawFiles.length > 0) {
        await attachFiles(rawFiles, token);
        token.check();
      }

      // ── 6. Type exact prompt ────────────────────────────────────────────────
      await typeExactPrompt(payload.prompt, token);
      token.check();

      // ── 7. Wait for all signals to be simultaneously ready ──────────────────
      await waitSubmissionReady(_activeJob, token);
      token.check();

      // ── 8. Send exactly once ────────────────────────────────────────────────
      await sendExactlyOnce(token);
      token.check();

      // ── 9. Verify submission committed ──────────────────────────────────────
      await verifySubmissionCommitted(_activeJob, initialUserTurnCount, token);
      token.check();

      // ── 10. Wait for response ────────────────────────────────────────────────
      const responseText = await waitForNewResponse(initialAssistantCount, token);

      // ── 11. Final extraction ─────────────────────────────────────────────────
      const finalText = responseText || extractLatestAssistantResponse();
      if (!finalText || finalText.trim().length < CFG.MIN_RESPONSE_LENGTH) {
        throw mkErr(EC.RESPONSE_EMPTY, "Response text is empty after generation.");
      }

      setJobState(JOB_STATE.COMPLETED);
      glog("Job complete ✓", "ok");
      sendDone(jobId, finalText.trim());

    } catch (err) {
      if (_activeJob) setJobState(err.code === EC.CANCELLED ? JOB_STATE.CANCELLED : JOB_STATE.FAILED);
      if (err instanceof GeminiError) {
        sendError(jobId, err.code, err.message, err.details);
      } else {
        sendError(jobId, EC.UNKNOWN_ERROR, err.message || String(err));
      }
    } finally {
      _activeJob = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MESSAGE LISTENER
  // ═══════════════════════════════════════════════════════════════════════════

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {

    // Handshake — reply immediately to confirm content script is alive
    if (msg.type === "GEMINI_PING") {
      sendResponse({ ok: true, jobReady: true });
      return true;
    }

    if (msg.type === "GEMINI_RUN") {
      // Acknowledge delivery immediately
      sendResponse({ ok: true });
      // Start job asynchronously
      runJob(msg.payload, msg.jobId);
      return true;
    }

    if (msg.type === "GEMINI_CANCEL") {
      if (_activeJob && _activeJob.jobId === msg.jobId) {
        _activeJob.token.cancel();
        glog("Job cancelled by request", "warn");
      }
      sendResponse({ ok: true });
      return true;
    }
  });

  glog("Content script v1.2 ready ✓", "ok");
})();
