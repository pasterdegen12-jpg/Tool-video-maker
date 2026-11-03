# Character Set ID — automatic persistence and compact cards

Previously the provider result became a proposal. A separate confirmation call wrote it to the character profile and returned the entire project. Setup displayed the proposal, an editable field, approval and recovery controls, and a duplicate image.

An explicit Set ID click now starts or rejoins a durable prediction. On completion the backend parses the original Molmo2 output, verifies the current image bytes against the submitted hash and commits the validated identity together with the job's terminal state. Firestore rechecks project access, character binding, latest request, polling lease and ID conflicts in the transaction. It updates only the characters field of the project. The existing confirmed identity schema continues to feed scene prompts. Historical review proposals remain in the job history and are not promoted on load.

Setup shows the avatar, display name, one Visual ID and one Set ID button. The button indicates progress and stays disabled during inference. A failed regeneration leaves the saved ID visible. Recovery reads existing jobs after remount. Storyboard displays the character name and a compact Visual ID. A successful response updates the matching character in React without replacing the screenplay. Existing edit, image, voice, delete and Generate controls remain in Setup.

Implementation files: `api/_lib/molmo/service.js`, `src/lib/molmoClient.js`, and `src/Workspace/{VisualProfiles,SetupTab,StoryboardTab,Workspace}.jsx`. Regression files: `tests/{molmo.test,visual-ui.test}.mjs` and `tests/emulator/firestore.test.mjs`.

Web regressions passed 583/583 with mocked inference. Firestore emulator passed 12/12, including concurrent cloud video publication and automatic identity persistence. Tests cover duplicate clicks, changed/deleted characters, replaced image bytes, superseded jobs, malformed or ambiguous results, recovery after a failed write, regeneration and hydration. An initial parallel run timed out in a process recovery test and detected altered line endings in a protected audio block. Restoring the original formatting and running the full suite with bounded parallelism passed the original checksum and recovery tests. Production build passed. A scan of four built assets found zero known provider-secret matches. Existing lint findings in Workspace are tracked separately from this change.

Paid production inference and an actual new production identity write were not run. Production release and read-only acceptance evidence follow below.
