# Gemini Bridge – Chrome Extension

A minimal Chrome Extension (MV3) that automates Gemini via your **existing browser session** — no API keys required.

## Features

- ✅ Uses your logged-in Google / Gemini session
- ✅ Opens Gemini in a new or existing tab
- ✅ Starts a **New Chat** automatically
- ✅ Optionally selects **Gemini Pro** model
- ✅ Optionally **attaches a file** before sending
- ✅ Types and sends your prompt
- ✅ Waits for generation to complete
- ✅ Extracts and displays the **response text** in the popup

---

## Installation (Developer Mode)

1. Open Chrome → `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **"Load unpacked"**
4. Select the `gemini-extension/` folder
5. The **Gemini Bridge** extension will appear in your toolbar

---

## Usage

1. Make sure you are **logged in to Gemini** at [gemini.google.com](https://gemini.google.com)
2. Click the **Gemini Bridge** toolbar icon
3. Type your prompt in the text area
4. *(Optional)* Check **"Use Gemini Pro model"**
5. *(Optional)* Attach a file
6. Click **"Send to Gemini"**
7. Watch the log panel for live progress
8. The response appears in the **Response** panel when complete

---

## Architecture

```
gemini-extension/
├── manifest.json          # MV3 manifest (permissions, host_permissions)
├── background/
│   └── sw.js              # Service worker – orchestrates tab & messaging
├── content/
│   └── gemini.js          # Content script – DOM automation on gemini.google.com
├── popup/
│   ├── popup.html         # Extension popup UI
│   ├── popup.css          # Dark-theme styles
│   └── popup.js           # Popup controller
├── icons/
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
└── scripts/
    ├── make-icons.cjs     # Zero-dependency icon generator (run once)
    └── generate-icons.js  # Alternative (requires 'canvas' npm package)
```

### Message Flow

```
Popup (popup.js)
  │  JOB_REQUEST
  ▼
Background SW (sw.js)
  │  Find / open gemini.google.com tab
  │  Inject content script
  │  GEMINI_RUN
  ▼
Content Script (gemini.js)
  │  Check login → New Chat → Pro model → File → Prompt → Send → Wait
  │  GEMINI_LOG / GEMINI_DONE / GEMINI_ERROR
  ▼
Background SW
  │  JOB_LOG / JOB_DONE / JOB_ERROR
  ▼
Popup (rendered to user)
```

---

## Permissions Explained

| Permission | Reason |
|------------|--------|
| `activeTab` | Interact with the current Gemini tab |
| `scripting` | Programmatically inject content script |
| `tabs` | Open and query Gemini tabs |
| `storage` | Persist job state across popup re-opens |
| `host_permissions: gemini.google.com` | Content script and scripting access |

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Not logged in" error | Open [gemini.google.com](https://gemini.google.com) and sign in, then retry |
| Response extraction fails | Open the Gemini tab manually and verify it loaded correctly |
| Pro model not selected | Gemini may not offer Pro in your region/account – the extension will fall back to the default model |
| File upload skipped | Gemini's file input may have changed — the extension logs a warning and continues without the file |

---

## Notes

- The content script uses **multiple CSS selector fallbacks** to survive minor Gemini DOM updates.
- Generation timeout is **2 minutes** (configurable in `content/gemini.js` → `MAX_WAIT`).
- The extension does **not** store your prompts, responses, or files anywhere outside Chrome storage session (which is cleared when you close the browser).
