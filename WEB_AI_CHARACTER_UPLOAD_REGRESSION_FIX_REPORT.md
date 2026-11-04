# Character profile upload and display

## Root cause

Comparing commit 424ed73 with its parent showed that SetupTab's new Avatar removed the anonymous CORS attribute from the original image. Production sets Cross-Origin-Embedder-Policy to require-corp. The three saved R2 images in project proj_1793714681734 (Sterling, Carter and Judge) all returned HTTP 200 with Access-Control-Allow-Origin * and no Cross-Origin-Resource-Policy header. Without a CORS request the browser replaced all three images with the camera fallback. The same symptom was reproduced in the older Judge/Lawyer/Defendant project. The image picker, upload callback and Firestore imageUrl field had survived the UI cleanup.

## Repair and preservation

SetupTab again requests avatars with anonymous CORS. Both the avatar and the named character image button target the original hidden picker. A failure to render an image leaves its saved reference intact.

Workspace's former avatar handler also published a temporary blob before upload and launched an unawaited project write inside a React state updater. The replacement keeps the original signed R2 PUT path, validates PNG/JPEG/WebP content and size, and awaits a Firestore transaction before updating React. The transaction compares the expected previous URL and merges only the selected character's image into the current character array. Each upload uses a unique key. The input can select the same file again after failure. Concurrent selection for the same character is disabled, operations have a time limit, and leaving the project aborts unfinished work.

The old visual identity remains on the profile after replacement and is labelled as belonging to the previous photo. Older screenplay references to its ID continue to resolve the stable character. The existing Set ID operation reads the currently saved profile URL. Upload does not start inference. Scene inputs, outputs, audio and dialogue are outside the avatar write.

## Verification

587/587 Web tests and 13/13 Firestore emulator tests passed. The UI test exercises both entry points and checks the target character and CORS attribute. Upload tests use a mocked R2 transport and real Firestore emulator transactions to verify separate character uploads, replacement, fresh reads, concurrent conflicts and preservation on errors. Image validation, unmount cancellation, stale aliases, Molmo2 image changes and existing editing/video regressions are covered. Production build and scoped lint on the avatar helpers and Setup/VisualProfiles passed. Built assets contained zero matches in the existing provider secret scan.

Production testing uses the existing photos. No production image replacement or paid provider submission is part of this acceptance.
