/**
 * Injected MAIN world trên labs.google/flow — grecaptcha.enterprise.
 */
const SITE_KEY = "6LdsFiUsAAAAAIjVDZcuLhaHiDn5nnHVXVRQGeMV";

window.addEventListener("GET_CAPTCHA", async ({ detail }) => {
  const { requestId, pageAction } = detail || {};
  try {
    await waitForGrecaptcha();
    const token = await window.grecaptcha.enterprise.execute(SITE_KEY, { action: pageAction });
    window.dispatchEvent(new CustomEvent("CAPTCHA_RESULT", { detail: { requestId, token } }));
  } catch (e) {
    window.dispatchEvent(new CustomEvent("CAPTCHA_RESULT", {
      detail: { requestId, error: e.message || String(e) },
    }));
  }
});

function waitForGrecaptcha(timeout = 12000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (window.grecaptcha?.enterprise?.execute) return resolve();
      if (Date.now() - start > timeout) return reject(new Error("grecaptcha not available — mở tab Flow"));
      setTimeout(check, 200);
    };
    check();
  });
}