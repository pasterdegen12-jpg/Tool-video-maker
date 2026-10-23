# Seedance unwanted subtitles — diagnosis and outbound prompt correction

2026-10-23. Investigation uses existing completed videos only. No paid prediction, image upload, project mutation, GPU or Qwen operation.

## Actual evidence

Fresh read found **42 completed prediction records across four projects**, not merely the two historical videos. Known project proj_1792167327214 still has its two historical outputs; newer records belong to proj_1792426312622, proj_1792506066745 and proj_1792591144210. Team-ledger reservation mirrors without prediction/project data are excluded from the count.

All 42 recorded prompt hashes match. Comparing against current scene dialogue found zero duplicated exact speech and zero included Translate values. Six records contain the previous VISUAL PRESENTATION guidance; all six latest records were visually sampled at one frame per second. None has a Custom Prompt. Their exact recorded prompts remain in local private evidence; historical prompts were not regenerated or overwritten.

| Sample | Project suffix / scene | Prediction | Seconds requested / actual | Visible result in sampled frames |
|---|---|---|---|---|
| 0 | 1792591144210 / 4 | 81947019b674454a9c8fa19e0c68ff81 | 8 / 8 | White dialogue captions across torso, multiple times |
| 1 | 1792591144210 / 4 | 0331bf709d854e1ca24768efab9dc8ea | 8 / 8 | Top captions with green word highlights |
| 2 | 1792591144210 / 3 | d698da808366496fbc98ceafa4dfd762 | 8 / 8 | No dialogue captions observed in 8 sampled frames; not proof for every frame |
| 3 | 1792591144210 / 3 | 2d4fd1dcaced479ba53b8610870df031 | 8 / 8 | White captions across torso, multiple times |
| 4 | 1792591144210 / 2 | f8d072b9e70c4e15af901f78925d4d6b | 10 / 10.125 | No dialogue captions observed in 10 sampled frames; not proof for every frame |
| 5 | 1792506066745 / 15 | ea7d76cae1474c5b8a6c47cfd392bfb4 | 12 / 12.25 | Large white/yellow captions above character |

All six: Seedance 1.5 Pro image-to-video, Start Frame mode, requested 9:16, 480p, generate_audio=true, camera_fixed=true, seed=-1. Actual encoded dimensions 480×864. No format or timing correction was applied.

**Proven:** R2 output bytes equal provider output bytes for all six samples. Each MP4 contains video and audio streams, no subtitle stream. Text is present in decoded raster frames without a browser/player. Therefore the visible captions in samples 0/1/3/5 are baked into the provider output, not introduced by the HTML player, R2 archive, or later app export. `archive.js` copies provider bytes; separate editing/merge paths are not involved in these archived files.

Exact uploaded references were fetched from the recorded downloadUrl and SHA-256 verified against the job image declaration for all six. Visual inspection found physical documents and a small four-point corner mark, but no subtitle bands, captions or speech bubbles. The mark also appears in generated media; it is distinct from the newly generated dialogue captions. No original or reference asset was edited/replaced. Input caption contamination is not supported by this sample.

Scene 3's two runs have identical prompt/settings/image yet different caption observations. This supports stochastic provider behavior; it does not prove an internal model mechanism or that all portrait scenes are affected. There is no controlled landscape comparison.

## Prompt diagnosis and correction

Trace: MainEditor structured parsing maps Dialogue and auxiliary Dịch/Translate separately → saved scene/confirmed Character → composeScene validates spoken-text contract → composeVideoPrompt → server prepareQuote uses saved scene → durable prompt/hash → service.submit/providerVideoPayload → createProvider JSON serialization. No downstream prompt append is present. Historical attempts continue using their stored prompt.

The six affected/recent prompts include their dialogue only once and exclude Vietnamese translation. Their previous no-caption guidance was present, under 2000 characters, not truncated. Translation leakage, duplicated dialogue and Custom Prompt are **not proven causes** of these incidents.

Confirmed composition weaknesses: visual, speech and performance information used a screenplay-style collection of ORIGINAL headings; no explicit synchronized-lip speech section; the visual suppression paragraph was optional and could silently disappear near the application cap. The cap omission is reproduced in regression but did not cause these six short prompts. Reformatting is a targeted mitigation, not proof that formatting caused the model's behavior.

Production changes:

- `src/lib/cloudVideoOptions.js`: constructs separate VISUAL and single SPOKEN AUDIO sections from validated canonical fields. Speech remains byte-for-byte unchanged, in its original language (including explicitly bilingual speech). Translation metadata stays in the project and is not added to outbound instructions. Tone/action/camera/confirmed ID are preserved.
- A compact PICTURE constraint is mandatory in every accepted new prompt. Optional pace detail may be omitted near the existing cap; the critical picture constraint and authored content are not truncated. No new cap/default/duration/rate/model/audio change.
- `src/Workspace/VideoOptionsModal.jsx`: shows a nonblocking inline conflict for recognized explicit English/Vietnamese requests to add captions. Custom Prompt remains intact and additive; no popup, new confirmation or generation gate. This narrow phrase check is not a universal language/intent classifier.
- Existing composeScene and sceneSnapshot stay unchanged for durable history compatibility; no migration or stored project edits.

Physical writing and explicitly authored visual text remain allowed. Silent scenes get no spoken-audio or performance section. There is no English-only instruction, subtitle API parameter, cleanup operation, blur, crop or automatic regeneration.

## Provider contract checked 2026-10-23

The configured [1.5 Pro I2V](https://wavespeed.ai/docs/docs-api/bytedance/bytedance-seedance-v1.5-pro-image-to-video), [1.5 Pro T2V](https://wavespeed.ai/docs/docs-api/bytedance/bytedance-seedance-v1.5-pro-text-to-video), and [2.0 Mini references endpoint](https://wavespeed.ai/docs/docs-api/bytedance/bytedance-seedance-2.0-mini-text-to-video) do not list a dedicated subtitle-disable or negative_prompt request field. Existing supported payload keys remain unchanged. The 2000-character maximum is the application's conservative cap, not a published numeric provider maximum.

## Verification and release

Pending final release checks. Focused prompt/service tests passed. Real saved 21-scene project tested across all three modes through actual quote/payload/provider serializer with an injected **mock HTTP transport**: 63/63 PASS, one exact speech occurrence, original ID, no translation leakage, max new prompt 972 characters, no mutation. This is not live Clerk generation or a video-quality test.

Private diagnostic evidence stays local under docs/subtitle-root-cause-20261023; project dumps, media, URLs and credentials are not committed. Commands executed include inspect.mjs (read-only Firestore), media.cjs and verify-media.cjs (existing media GET, ffmpeg/ffprobe), real-prompts.mjs (CPU + mock HTTP), node test suites, scoped ESLint and production build with frontend provider keys empty.

New paid before/after comparison: **NOT RUN**. Actual subtitle-free quality after this correction remains unverified. Existing burned-in captions cannot be removed retroactively by changing prompts. Preserve these files/history; the existing editor's trimming capability cannot reconstruct obscured pixels. A separately approved regeneration or dedicated cleanup workflow would need an explicit cost/quality review; neither was initiated.
