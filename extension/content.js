/**
 * Content script — cầu background ↔ MAIN world (CAPTCHA).
 */
(function () {
  const s = document.createElement("script");
  s.src = chrome.runtime.getURL("injected.js");
  s.onload = () => s.remove();
  (document.documentElement || document.head).appendChild(s);

  const pending = new Map();

  window.addEventListener("CAPTCHA_RESULT", (ev) => {
    const d = ev.detail || {};
    const p = pending.get(d.requestId);
    if (!p) return;
    pending.delete(d.requestId);
    p(d);
  });

  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg?.type !== "GET_CAPTCHA") return;
    const requestId = msg.requestId || crypto.randomUUID();
    pending.set(requestId, (detail) => reply(detail));
    window.dispatchEvent(new CustomEvent("GET_CAPTCHA", {
      detail: { requestId, pageAction: msg.pageAction || "IMAGE_GENERATION" },
    }));
    return true; // async reply
  });
})();