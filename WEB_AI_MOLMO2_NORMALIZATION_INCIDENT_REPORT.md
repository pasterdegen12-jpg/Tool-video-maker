# Set ID production incident correction — 2026-11-05

## Confirmed failures

1. `descriptionVisualId` rejected all occurrences of `no`/`without`. The actual completed prediction `c5f4ede2c467490ba0098680daf2f7b3` said: "Short gray hair, no facial hair, no glasses, wearing a burgundy jacket over a white shirt." The previous backend recorded `VISUAL_OUTPUT_UNSUPPORTED` rather than saving an ID.
2. `molmoService.user` allowed only 100 characters for internal Character IDs. The real imported Plaintiff/Defendant IDs in `proj_1793026193256` exceed that bound. They were rejected before a provider request or job existed. This is unrelated to the separate 100-character Visual ID contract.
3. Grammar words `in`, `over`, `under` leaked into IDs. Failed parser jobs required another paid request to try again.

## Narrow correction

- Allow existing internal IDs up to 2048 ASCII identifier characters; still require an exact character match in the authorized saved project. No internal IDs or names are rewritten.
- Keep the exact short Molmo prompt. Final app output remains lowercase_snake_case, never the raw sentence. Preserve original description separately.
- Map explicit `no facial hair` to `clean_shaven`; omit explicitly absent glasses. Reject unhandled negations rather than reversing their meaning. Remove grammar prepositions; never add age/gender/features absent from the response or truncate attributes.
- Latest unchanged-image jobs that failed old output parsing can recover the existing prediction through GET once per decoder revision. No new provider POST. Changed images, manual edits, superseded jobs and current-revision invalid output cannot be revived by this path. Existing identity transaction safeguards remain.
- Invalid request errors now have an actionable message. Existing multi-selection, edit, upload, audio and video flows preserved.

## Real existing output replay (no new inference)

Read-only GET of the two latest previously charged predictions succeeded:

- `c5f4ede2c467490ba0098680daf2f7b3` → `short_gray_hair_clean_shaven_burgundy_jacket_white_shirt`.
- `84c3ddf5387946139b8d02f389578b7d` → `balding_man_short_hair_gray_beard_gray_button_down_shirt_white_undershirt`.

Both were `completed`. This verifies parsing of real provider results, not independent accuracy of the model's visual observations. No invented replacement response, no new inference charge, no video request.

## Validation

Web suite: 608 PASS; Firestore emulator: 13 PASS; targeted lint and production build: PASS. Tests include the exact screenshot description, negative-feature handling, long imported Character IDs, bounded old-result recovery, unchanged manual edits and image guards inherited from existing tests.

Files: `src/lib/visualIdText.js`, `src/lib/molmoClient.js`, `api/_lib/molmo/service.js`, `tests/molmo.test.mjs`.
