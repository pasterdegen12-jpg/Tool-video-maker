# WEB AI — REMOVAL OF PER-ACCOUNT VIDEO GENERATION RESTRICTIONS REPORT

## 1. Executive Summary

As instructed by the operator, all per-account allowlist gates and manual `_video_projects` permission restrictions for video generation have been completely removed from Web AI (`https://www.aivideomaker.live`).

Web AI is an internal team tool. Any user who has successfully logged in via existing Clerk authentication and has normal access to a project can now quote, generate, poll, and publish AI videos without requiring operator manual approval, server environment-variable allowlist registration, or manual Firestore grant documents.

---

## 2. Changes Implemented

### Gate 1: `api/video.js`
- **Removed**: `authorizeTeam(session, settings)` invocation and import.
- **Rule**: Any authenticated Clerk session (valid JWT, issuer, audience, active session) is permitted to access video actions (`source`, `quote`, `ticket`, `verify`, `submit`, `list`, `job`, `health`). Unauthenticated requests still return `401 UNAUTHORIZED`.

### Gate 2: `api/_lib/cloud-video/config.js`
- **Extracted**: `mediaBaseConfig(env)` for core origin, issuer, and JWT key validation.
- **Preserved**: `mediaAuthConfig(env)` and `authorizeTeam(session, config)` continue to enforce `MEDIA_ALLOWED_OWNER_HASHES` for Audio and Gemini services, ensuring zero regressions for those services.
- **Updated**: `cloudConfig(env)` uses `mediaBaseConfig(env)`. It optionally reads `MEDIA_ALLOWED_OWNER_HASHES` if provided, but does not throw `TEAM_CONFIGURATION` if it is omitted or empty.

### Gate 3: `api/_lib/cloud-video/store.js`
- **Removed**: Mandatory requirement for `_video_projects/{projectId}` grant document.
- **Removed**: `grant?.owner === owner` check that prevented team members from generating videos on projects created or approved by other accounts.
- **Updated `project(owner, projectId)`**:
  - Validates `projectId` format.
  - Fetches canonical project from `projects/{projectId}` (returns 404 if not found).
  - If `_video_projects/{projectId}` exists and has `enabled: false`, rejects with `403 PROJECT_FORBIDDEN` (administrative killswitch).
  - If `project.owner`, `project.userId`, or `project.ownerId` is set, enforces project isolation (returns `403 PROJECT_FORBIDDEN` if accessing another user's private project).
  - Unowned/shared projects (the standard Web AI project format) are accessible to all authenticated team members.
- **Updated `publishVideo(owner, record)`**:
  - Updates `projects/{record.projectId}` with completed video data transactionally without requiring a `_video_projects` document.
  - Enforces the same project-level ownership and `grant.enabled !== false` checks.

---

## 3. Test & Verification Results

1. **Unit & Integration Tests (`npm test`)**:
   - Total tests: 433 (all PASS, 0 fail).
   - Added regression test `authenticated user not on allowlist can access video handler without TEAM_FORBIDDEN` (PASS).
   - Added regression test `cloudConfig does not require MEDIA_ALLOWED_OWNER_HASHES to be present` (PASS).

2. **Firestore Emulator Tests (`tests/emulator/firestore.test.mjs`)**:
   - Total tests: 7 (all PASS, 0 fail).
   - Verified that unowned shared projects can be read and updated without a `_video_projects` document.
   - Verified that legacy grants with other owner hashes do not block team members.
   - Verified that `enabled: false` grants continue to reject with `403 PROJECT_FORBIDDEN`.
   - Verified that explicit project owner isolation is maintained.

3. **Code Quality & Linting**:
   - `npx eslint` passed on all modified files with 0 errors and 0 warnings.

4. **Production Build & Function Count**:
   - `vite build` completed successfully in 1.31s.
   - Local Vercel production build completed successfully.
   - Emitted Serverless Functions: exactly 11 functions (below the 12-function limit for Vercel Hobby plan):
     1. `api/audio.func`
     2. `api/gemini.func`
     3. `api/get-upload-url.func`
     4. `api/proxy-audio.func`
     5. `api/proxy-media.func`
     6. `api/video.func`
     7. `api/gemini-test/text.func`
     8. `api/local-ai/analyze.func`
     9. `api/local-ai/visual-profile.func`
     10. `api/local-ai/character-project/[projectId].func`
     11. `api/local-ai/jobs/[jobId].func`
