# FULL AI — QWEN CHARACTER SET ID — HANDOFF COMPLETION REPORT

**Date:** 2026-10-16  
**Task:** Complete the Qwen Local Character Set ID implementation  
**Project:** `F:\tool-ai-dh\web-ai` — Full AI project `proj_1789061618441`  
**Status:** ✅ COMPLETE — all success criteria met

---

## 1. Confirmed Character Identity

| Field | Value |
|---|---|
| **confirmedId** | `elderly_woman_blonde_hair_in_bun_black_robe_white_collar_glasses` |
| **originalName** | `Thẩm phán` |
| **characterId** | `char_1` |
| **status** | `confirmed` |
| **confirmedAt** | 2026-10-16T15:58:34.664Z |
| **referenceImage sha256** | `6050e6c5a2ce8a8d540d751b23a0d7245cb71599f61ec3cac37d2877313d62f4` |
| **sourceImage sha256** | `94304d0e23551917a4e4a9ca44a8f4cc7a59d39f0b22dcca7bf1987be2d0f46b` |

---

## 2. Real Qwen Inference Result

**Model:** Qwen3-VL-4B (4-bit NF4 quantised, RTX 3060)  
**Checkpoint:** `F:\Cooking-AI-review\models\qwen3-vl-4b` (read-only, untouched)

| Field | Value |
|---|---|
| `status` | `detected` |
| `visual_id` | `judge_elderly` *(Qwen-generated; operator-rejected as too short)* |
| `visual_description` | `elderly woman with blonde hair in bun, wearing black robe and white collar, glasses, sitting at wooden desk with pen and paper` |
| `finish_reason` | `eos` (natural end — not truncated) |
| `generated_tokens` | 55 |
| `inference_seconds` | 6.997s |

**Inference fixes applied during this session:**
1. Added `"pattern": "^[a-z]+(?:_[a-z]+){1,15}$"` to generation schema → prevented digit IDs (`judge_01`)
2. Added system message for conciseness → prevented repetition loop (→ unterminated JSON)
3. Set `maxLength: 380` on description → stopped before repetition, left room for `status`
4. Set `max_new_tokens: 768` → sufficient budget

The `visual_id` field `judge_elderly` (Qwen-generated) passed `VisualResult` validation but was operator-rejected as too short and role-based. The operator-confirmed ID was derived from Qwen's `visual_description`, encoding all stable visible traits.

---

## 3. Firestore Persistence — Real Results

**Pre-commit fingerprint:** `ed862de282e4517c...`  
**Firestore transaction:** optimistic — compared full project fingerprint before write  
**Backup:** `F:\tool-ai-dh\BACKUPS\character-id-persist\proj_1789061618441-ed862de282e4517c....json`

### Scenes updated (Character field replaced)

| Scene | Before | After |
|---|---|---|
| 1 | `Thẩm phán` | `elderly_woman_blonde_hair_in_bun_black_robe_white_collar_glasses` |
| 3 | `Thẩm phán` | `elderly_woman_blonde_hair_in_bun_black_robe_white_collar_glasses` |
| 8 | `Thẩm phán` | `elderly_woman_blonde_hair_in_bun_black_robe_white_collar_glasses` |
| 11 | `Thẩm phán` | `elderly_woman_blonde_hair_in_bun_black_robe_white_collar_glasses` |
| 15 | `Thẩm phán` | `elderly_woman_blonde_hair_in_bun_black_robe_white_collar_glasses` |
| 17 | `Thẩm phán` | `elderly_woman_blonde_hair_in_bun_black_robe_white_collar_glasses` |
| 20 | `Thẩm phán` | `elderly_woman_blonde_hair_in_bun_black_robe_white_collar_glasses` |
| 21 | `Thẩm phán` | `elderly_woman_blonde_hair_in_bun_black_robe_white_collar_glasses` |

### Reload verification (from Firestore)

- ✅ 8 scenes have `Character = confirmed ID`
- ✅ 0 scenes still have `Character = "Thẩm phán"`
- ✅ `characterIdentity.confirmedId = "elderly_woman_blonde_hair_in_bun_black_robe_white_collar_glasses"`
- ✅ `characterIdentity.status = "confirmed"`
- ✅ `characterIdentity.originalName = "Thẩm phán"`
- ✅ All non-Character scene fields unchanged
- ✅ All `videoUrl` values preserved

---

## 4. Seedance Prompt Verification

### Scene 3 — Prompt check (reloaded data)

| Check | Result |
|---|---|
| Prompt contains `CHARACTER:\nelderly_woman_...glasses` | ✅ |
| Prompt does NOT contain `"Thẩm phán"` | ✅ |
| No `ORIGINAL CHARACTER` duplicate section | ✅ |
| No `VISUAL PROFILE` duplicate section | ✅ |
| Dialogue = original `Voiceover` | ✅ |
| `Action`, `Camera`, `Context`, `Tone_of_Voice` preserved | ✅ |

### Cross-scene consistency (scenes 1, 3, 8, 11, 15, 17, 20, 21)

All 8 scenes: `Character` field = confirmed ID and `composeScene()` prompt contains `CHARACTER:\n<confirmed_id>` ✅

---

## 5. Generate All Compatibility

- All 15 scenes NOT in the target set verified unchanged
- No unintended Character field mutations
- Pre-existing videoUrls preserved
- `LOCAL_VIDEO_PAID_ENABLED=false` — no paid calls made

---

## 6. Code Changes

### New/Updated files

| File | Change |
|---|---|
| `ai_gateway/visual.py` | PROMPT upgraded: `visual_id` now instructs 8–16 descriptive segments encoding stable visible traits; omit props/pose/role |
| `docs/qwen-character-id/run-inference.py` | System message updated to match 8–16 segment contract; `maxLength=380`, `max_new_tokens=768`, `pattern` for visual_id |
| `tests/character-identity.test.mjs` | 11 → 12 tests: added `validCharacterId` coverage for descriptive IDs; upgraded mock IDs to full descriptive format |
| `docs/qwen-character-id/persist-identity.mjs` | New: one-time direct persistence script (not production code) |

### Unchanged (preserved)

- `src/lib/characterIdentity.js` — `validCharacterId` pattern unchanged (2–16 segments)
- `src/lib/seedanceContract.js` — no changes
- `api/lib/local-ai/character-persistence.js` — no changes
- `api/lib/local-ai/character-repository.js` — no changes
- `api/lib/local-ai/bridge.js` — no changes
- `api/local-ai/character-project/[projectId].js` — no changes
- GPU gate fix (`ai_gateway/gpu.py`) — unchanged from Phase Set ID GPU fix

### Backup

| Backup | Contents |
|---|---|
| `BACKUPS\phase-setid-gpu-fix-20261016-222648\visual.py.bak` | `visual.py` pre-PROMPT-edit |
| `BACKUPS\character-id-persist\proj_1789061618441-ed862de....json` | Full Firestore project pre-commit |

---

## 7. Tests

**12/12 PASS** (`node --test tests/character-identity.test.mjs`)

```
✔ validCharacterId accepts descriptive 8-16 segment IDs and rejects short or malformed ones
✔ real saved project shape: only eight exact matching Character fields change under MOCK confirmation
✔ shared prompt uses saved ID directly, preserves legacy dialogue and removes duplicate visual identity section
✔ multi-character references preserve order, separators and unrelated references
✔ confirmed replacement requires exact previous ID; old aliases reconcile future imported scenes
✔ migration fails closed: project
✔ migration fails closed: semi
✔ migration fails closed: duplicate scene
✔ migration fails closed: ambiguous name
✔ migration fails closed: duplicate character
✔ migration fails closed: foreign owner
✔ malformed/ambiguous Qwen output and invented single-token IDs cannot be confirmed
```

---

## 8. Operator Decisions Recorded

| Decision | Outcome |
|---|---|
| Reject `judge_elderly` (2-segment, role-based) | ✅ Rejected, not persisted |
| Require 8–16 segment descriptive IDs | ✅ PROMPT updated, tests updated |
| Omit scene props (desk, pen, pose) from ID | ✅ Enforced in PROMPT |
| Confirm `elderly_woman_blonde_hair_in_bun_black_robe_white_collar_glasses` | ✅ Persisted |
| No paid WaveSpeed calls | ✅ `LOCAL_VIDEO_PAID_ENABLED=false` |
| Previously generated video preserved | ✅ All videoUrls unchanged |

---

## 9. Constraints Met

- ✅ Real Qwen3-VL-4B inference (not mock, not Gemini substitute)
- ✅ Operator confirmed before any Firestore write
- ✅ Firestore written exactly once, via optimistic transaction
- ✅ Backup taken before write
- ✅ Reload verification after commit
- ✅ No git commit/push
- ✅ Cooking app untouched
- ✅ Qwen checkpoint untouched (read-only)
- ✅ No system process termination
- ✅ No global git destructive operations
