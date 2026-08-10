/**
 * GOHA Studio — Stealth Core (MAIN world, document_start trên labs.google/flow).
 */
(function () {
  "use strict";
  if (window.__goha_stealth__) return;
  window.__goha_stealth__ = true;

  function profileSeed() {
    try {
      let s = localStorage.getItem("__goha_fp_seed__");
      if (!s) {
        s = String((Date.now() ^ (Math.random() * 1e9)) >>> 0);
        localStorage.setItem("__goha_fp_seed__", s);
      }
      return parseInt(s, 10) >>> 0;
    } catch (_) {
      return 1234567;
    }
  }
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const seed = profileSeed();
  const rand = rng(seed);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];

  const GPU = pick([
    { v: "Google Inc. (Intel)", r: "ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)" },
    { v: "Google Inc. (NVIDIA)", r: "ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 Direct3D11 vs_5_0 ps_5_0, D3D11)" },
    { v: "Google Inc. (AMD)", r: "ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)" },
    { v: "Google Inc. (Intel)", r: "ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)" },
  ]);
  const CORES = pick([4, 6, 8, 8, 12, 16]);
  const MEM = pick([8, 8, 16, 16, 32]);
  const canvasNoise = Math.floor(rand() * 1e6);

  const def = (obj, prop, getter) => {
    try { Object.defineProperty(obj, prop, { get: getter, configurable: true }); } catch (_) {}
  };

  def(navigator, "webdriver", () => undefined);

  const patchGL = (proto) => {
    if (!proto) return;
    const orig = proto.getParameter;
    proto.getParameter = function (p) {
      if (p === 37445) return GPU.v;
      if (p === 37446) return GPU.r;
      return orig.apply(this, arguments);
    };
  };
  patchGL(window.WebGLRenderingContext && WebGLRenderingContext.prototype);
  patchGL(window.WebGL2RenderingContext && WebGL2RenderingContext.prototype);

  function noisify(canvas) {
    try {
      if (!canvas || canvas.width <= 16 || canvas.height <= 16) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        if (((i / 4) % 97) === (canvasNoise % 97)) {
          d[i] = (d[i] + (canvasNoise % 8)) % 256;
          d[i + 1] = (d[i + 1] + (canvasNoise % 5)) % 256;
          d[i + 2] = (d[i + 2] + (canvasNoise % 3)) % 256;
        }
      }
      ctx.putImageData(img, 0, 0);
    } catch (_) {}
  }
  const cproto = window.HTMLCanvasElement && HTMLCanvasElement.prototype;
  if (cproto) {
    const oToDataURL = cproto.toDataURL;
    cproto.toDataURL = function () { noisify(this); return oToDataURL.apply(this, arguments); };
    const oToBlob = cproto.toBlob;
    if (oToBlob) cproto.toBlob = function () { noisify(this); return oToBlob.apply(this, arguments); };
  }

  const AC = window.AudioContext || window.webkitAudioContext;
  if (AC && AC.prototype.createOscillator) {
    const oCreate = AC.prototype.createOscillator;
    AC.prototype.createOscillator = function () {
      const osc = oCreate.apply(this, arguments);
      const oStart = osc.start;
      osc.start = function (when) {
        const j = (rand() - 0.5) * 1e-4;
        return oStart.apply(this, [when ? when + j : Math.max(0, j)]);
      };
      return osc;
    };
  }

  def(navigator, "hardwareConcurrency", () => CORES);
  def(navigator, "deviceMemory", () => MEM);

  def(navigator, "plugins", () => [
    { name: "Chrome PDF Plugin", filename: "internal-pdf-viewer" },
    { name: "Chrome PDF Viewer", filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai" },
    { name: "Native Client", filename: "internal-nacl-plugin" },
  ]);

  const RTC = window.RTCPeerConnection || window.webkitRTCPeerConnection;
  if (RTC && RTC.prototype.createOffer) {
    const oOffer = RTC.prototype.createOffer;
    RTC.prototype.createOffer = function () {
      return oOffer.apply(this, arguments).then((offer) => {
        try { if (offer && offer.sdp) offer.sdp = offer.sdp.replace(/a=candidate:.*\r\n/g, ""); } catch (_) {}
        return offer;
      });
    };
  }
})();