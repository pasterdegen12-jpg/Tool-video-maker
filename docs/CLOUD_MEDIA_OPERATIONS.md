# Cloud media operations

Production uses the existing Vercel project, Clerk instance, Firestore and R2. No local inference service is required. Provider secrets are server-only.

## Required server configuration

- `VIDEO_WEB_ORIGIN=https://www.aivideomaker.live`, `CLERK_ISSUER`, `CLERK_JWT_KEY` (public verification key).
- `MEDIA_ALLOWED_OWNER_HASHES`: comma-separated verified team member hashes.
- `VIDEO_FIREBASE_SERVICE_ACCOUNT_JSON`, `VIDEO_FIREBASE_PROJECT_ID`.
- `WAVESPEED_VIDEO_API_KEY`, `WAVESPEED_AUDIO_API_KEY`.
- `GEMINI_API_KEY_1`, optional `_2` and `_3`, in original fallback order.
- `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_ORIGIN`.
- `CLOUD_VIDEO_ENABLED`, `CLOUD_VIDEO_PAID_ENABLED`, `CLOUD_AUDIO_ENABLED`, `CLOUD_GEMINI_ENABLED`: explicit `true`/`false` switches.
- `VIDEO_MAX_CONCURRENT`, `VIDEO_DAILY_MICRO_USD`, `VIDEO_MAX_REQUEST_MICRO_USD`, `VIDEO_TEAM_MAX_CONCURRENT`, `VIDEO_TEAM_DAILY_MICRO_USD`: positive bounded integers.

Only `VITE_CLOUD_VIDEO_ENABLED=true` is needed for the video UI. Firebase web configuration and Clerk publishable keys are intentionally public. Never configure provider credentials with a `VITE_` prefix. Environment changes require a new Vercel deployment.

## Authorizing a member/project

1. The operator identifies the exact existing Clerk user ID in the approved Clerk instance and approves a specific saved project. Do not accept a browser-submitted owner or infer ownership from legacy project fields.
2. A trusted administrator computes `ownerOf({subject: verifiedClerkUserId}, configuredIssuer)` from `api/_lib/cloud-video/core.js` and adds that hash to `MEDIA_ALLOWED_OWNER_HASHES` using secure server configuration.
3. Read the complete existing project with Admin SDK, verify the operator-selected source, then write only `_video_projects/<projectId>` with `{owner, enabled:true, sourceDigest:sourceDigest(project), approvedAt, basis}`. Preserve the original `projects` document. Refuse to replace an existing grant for a different owner without explicit operator approval.
4. Deploy the configuration, then verify real Clerk access and a non-billable quote. Test that another account is denied. Each current grant has one owner; this release does not implement shared ownership or blanket access to all projects.

The protected grant establishes owner access independently of mutable project data. Existing grants remain valid without migration; their sourceDigest is retained as approval evidence. New quotes pin the selected scene prompt and INPUT URL (snapshotVersion 2), image bytes hash, settings and price. Changes to those inputs invalidate that attempt; unrelated scene/media edits do not revoke access. Pre-v2 unfinished quotes still use their original whole-project digest. Existing jobs remain recoverable by their original authorized owner.

## Safe operation and recovery

The user’s intentional Gen Video action on a scene authorizes its internal quote/upload/submit flow under the existing budget. No provider request is triggered by render, image selection or refresh; refresh uses GET recovery only. Saved INPUT images resolve from the canonical project/scene in the configured R2 origin and project namespace. Original bytes are validated server-side and browser-side, then uploaded directly through an immutable signed ticket. Missing/unreadable INPUT offers an inline picker. Quotes expire after two minutes; selected scene/image changes invalidate them. Cloud duration follows the actual spoken-text estimate within the provider’s verified 4–12 second range; longer dialogue is rejected with an actionable edit message. Local 4–9 second behavior remains unchanged.

Each paid request requires the server paid flag and the explicit per-scene Gen Video click. A committed `SUBMITTING` record precedes the only provider POST. An unknown POST result must be investigated, never automatically retried. Recover known IDs with GET. Do not delete ledger records to bypass limits or unknown submissions.

Video output is archived at `_video_results/<owner>/<attempt>.mp4` with conditional creation and identity checks. Legacy media is not overwritten. Monitor R2 retention and public playback availability. Current document caps are 80 video records and 200 audio records per user; there is no automatic history cleanup. Reservations for failed/unknown paid attempts remain conservative.

The protected Firestore collections are `_video_projects` and `_video_ledgers`. Legacy collections retain their pre-existing access policy. Do not add an overlapping broad allow rule. Service-account credentials bypass rules and must stay backend-only.

## Development and tests

Local video retains its original loopback server. Local Gemini/audio use the Vite server middleware with ignored `.env.media.local`: the same backend settings, `LOCAL_MEDIA_ENABLED=true`, and an exact loopback `VIDEO_WEB_ORIGIN`. Never expose the middleware to LAN clients or put secrets in client environment variables.

Run `npm test`. For Firestore security tests, use Java 21 and Firebase CLI:

```text
firebase emulators:exec --project demo-webai-production --only firestore --config tests/emulator/firebase.json "node --test tests/emulator/firestore.test.mjs"
```

The rules fixture must be compared against the complete effective production ruleset before claiming live enforcement. Emulator data and mock provider results are not production acceptance. No automated test should make a billable provider call.

## Output persistence and structured script fast path (2026-10-18)

Completed cloud jobs publish videoUrl and videoJob to the canonical scene using an owner-checked Firestore transaction. Existing video is retained in videoHistory; authored fields remain unchanged. Only matching source snapshots may publish and a newer result cannot be replaced by an older attempt. Refresh reads the saved media with the project; one project-level GET checks pending jobs, never one request per card or a prediction POST. The existing OUTPUT player, counter and merge input all consume the scene result.

VIDEO_DAILY_MICRO_USD=0 and VIDEO_TEAM_DAILY_MICRO_USD=0 explicitly mean no daily ceiling, as requested by the operator. Spend accounting, per-request maximum, concurrency, duplicate protection and Clerk verification remain. No new admin accounts or credentials are created.

MainEditor first reads labelled scene_N scripts locally without network/model calls. Full AI preserves Dialogue and Character; Semi preserves Voiceover and time_origin without creating character entities. Unsupported unstructured scripts retain the existing authenticated Gemini route/model. Invalid structured input stops with a field error rather than silently falling back to rewriting. Set ID remains a local Qwen capability: production shows its disconnected state and does not pretend inference is available.
