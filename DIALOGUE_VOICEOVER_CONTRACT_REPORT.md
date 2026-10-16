# DIALOGUE / VOICEOVER CONTRACT REPORT — Phase 2A.1

Ngày thực hiện: 2026-10-11. Phạm vi: sửa hợp đồng dữ liệu và tương thích ngược bằng CPU; dừng trước Phase 2B.

**Kết quả: PASS cho implementation và các kiểm thử đã chạy.** Gateway: **134/134 PASS** (đủ 131 test Phase 2A + 3 case mới). Web: **37/37 PASS** (12 test/subtest có sẵn + 25 case tương thích mới). Production build: **PASS**. Real inference, kiểm thử Firestore thật và phát media trong trình duyệt: **NOT RUN**.

## 1. Nguyên nhân đã xác minh từ source

Đã kiểm tra toàn bộ tham chiếu Dialogue/Voiceover trong `src`, cùng adapter Python. Đây là các hành vi trước khi sửa, đối chiếu với snapshot đầu task; không suy đoán từ tên field.

| Consumer | Hành vi trước Phase 2A.1 | Sửa trong Phase 2A.1 |
|---|---|---|
| [MainEditor](F:/tool-ai-dh/web-ai/src/MainEditor.jsx:40) | Prompt Full AI yêu cầu rõ “Dialogue phải được chuyển thành Voiceover”; ví dụ JSON cũng dùng Voiceover. | Prompt và ví dụ Full AI dùng Dialogue nguyên văn. Prompt Semi giữ nguyên. |
| [Adapter Full AI](F:/tool-ai-dh/local-ai-gateway/ai_gateway/web_adapters.py:27) | Parser nội bộ đã có `dialogue`, nhưng adapter xuất `Voiceover: s.dialogue` để khớp định dạng Web cũ. Tài liệu Phase 2A ghi rõ mục đích này. | Chỉ đổi key đầu ra thành `Dialogue`. Source validator và parser giữ nguyên. |
| [Workspace](F:/tool-ai-dh/web-ai/src/Workspace/Workspace.jsx:724) | Đọc Full bằng `Dialogue \|\| Voiceover`, không nhận diện xung đột. Editor ghi cùng nội dung vào cả hai field. | Dùng quy tắc đọc chung; sửa lời thoại Full chỉ ghi Dialogue, bỏ alias Voiceover trên scene được sửa. |
| [StoryboardTab](F:/tool-ai-dh/web-ai/src/Workspace/StoryboardTab.jsx:37) | Hiển thị và chọn text Full bằng fallback; số từ dựa trên Word_count hoặc chỉ Voiceover. | Đọc cùng quy tắc theo workflow, đếm từ từ text đã xác định, hiện lỗi xung đột và cho mở Sửa. |
| [Firebase create helper](F:/tool-ai-dh/web-ai/src/firebase.js:31) | Lưu dữ liệu nhận vào; ước tính số scene có lời nói chỉ dựa trên Voiceover. | Chuẩn hóa dữ liệu **project mới** trước upload/save; tính số scene theo workflow. |
| [Firebase progress helper](F:/tool-ai-dh/web-ai/src/firebase.js:145) | Ghi updates với merge; không chuẩn hóa alias. | Giữ nguyên. Không có migration tại đây hoặc khi đọc project. |

Kết luận: mapping cũ là quyết định tương thích với hợp đồng Web đang tồn tại, không phải yêu cầu của Qwen hay giới hạn parser. Sửa riêng adapter sẽ để sót consumer, đặc biệt việc tính chi phí và editor tiếp tục tạo hai field.

Diff riêng của task, so với working tree đầu phiên: [task-changes.patch](F:/tool-ai-dh/web-ai/docs/phase2a1/task-changes.patch). Các thay đổi có sẵn trong StoryboardTab/firebase được giữ lại.

## 2. Hợp đồng sau sửa

### Full AI mới

Adapter trả `characters` và `scenes` như trước. Scene có:

`scene_n, Context, Camera, Action, Character, Dialogue, Translate, Tone_of_Voice, Word_count, status`.

- `Dialogue` là lời thoại canonical, giữ nguyên text do parser đã xác minh.
- Không xuất `Voiceover` trong scene Full mới; không thêm `time_origin` để cắt footage.
- Character vẫn là tên tương ứng với character_id của parser. Không đổi nhận diện nhân vật, translation hoặc metadata sidecar.
- MainEditor vẫn gọi Gemini theo workflow hiện tại. Nếu response mới còn mang shape cũ chỉ có Voiceover, create helper chuyển sang Dialogue trước khi lưu project mới, không tạo bản sao cạnh tranh.
- Source integrity validation của gateway không bị thay đổi hoặc nới lỏng.

### Semi

`Voiceover` vẫn là narration canonical. `Footage` và `time_origin` độc lập; không fallback sang Dialogue, không suy diễn Character entity. Adapter Semi không đổi. Các field thiếu trong kịch bản thật vẫn là chuỗi rỗng theo hợp đồng hiện có.

### Đọc legacy và xung đột

Quy tắc dùng chung nằm tại [spokenText.js](F:/tool-ai-dh/web-ai/src/lib/spokenText.js:2). Đọc không sửa object và không gọi database.

| Dữ liệu Full AI | Kết quả đọc | Ghi dữ liệu |
|---|---|---|
| Chỉ Dialogue | Đọc Dialogue, kể cả chuỗi rỗng | Giữ canonical |
| Không có Dialogue, có Voiceover | Đọc Voiceover legacy nguyên văn | Không tự ghi lại khi mở project |
| Cả hai giống hệt nhau | Đọc Dialogue | Giữ dữ liệu cũ cho tới khi có thao tác sửa lời thoại; project mới chỉ giữ Dialogue |
| Hai giá trị khác nhau | `DIALOGUE_VOICEOVER_CONFLICT`, không tự chọn | Bắt buộc lựa chọn rõ ràng trước khi lưu scene |
| Một field rỗng, field kia không rỗng | Vẫn là xung đột | Không dùng phép `\|\|` để âm thầm lấy giá trị còn lại |
| Chỉ khác whitespace/Unicode/text | So sánh chính xác, không tự trim/normalize nội dung | Không tự hòa giải |
| Field có mặt nhưng null/không phải string | `INVALID_SPOKEN_TEXT` | Báo lỗi; không ép kiểu thành lời thoại |
| Cả hai không có hoặc canonical rỗng | Không có lời nói để chọn | Không phục hồi lời thoại từ field khác |

[FullDialogueField](F:/tool-ai-dh/web-ai/src/Workspace/FullDialogueField.jsx:3) hiển thị cả hai giá trị xung đột trong textarea chỉ đọc, có lựa chọn “Giữ Dialogue”, “Giữ Voiceover” hoặc nhập Dialogue mới. Chọn Voiceover có nghĩa giữ **nội dung** đó trong Dialogue, rồi bỏ key Voiceover. Chỉ khi bấm “Lưu thay đổi” thì scene mới được lưu; hủy modal không đổi scene gốc.

Khi chưa giải quyết, nút lưu scene và thao tác chọn text để Gen Audio bị chặn. Danh sách batch chỉ chứa scene có lời nói xác định; có kiểm tra bổ sung nếu lựa chọn batch cũ còn trỏ vào scene xung đột. Cảnh báo trên Storyboard cho phép mở phần sửa.

## 3. Tương thích dữ liệu và media

- **Không migration Firestore**, không quét hoặc cập nhật project cũ hàng loạt. Không thêm schema version, field migration hoặc sidecar vào Firebase.
- Luồng fetch project và `updateProjectProgress` giữ nguyên. Chỉ đọc project không canonicalize và không tự lưu lại.
- Sửa Context/Character/camera trên scene legacy không tự chuyển alias lời thoại. Chỉ thao tác sửa/chọn lời thoại mới dùng `writeFullDialogue`.
- Khi sửa lời thoại, helper spread toàn bộ scene rồi chỉ thay Dialogue, Word_count và bỏ Voiceover. Các URL, status, metadata và field khác được giữ.
- Không xóa, thay thế hoặc tái tạo generatedAudios, mergedVideos, videoUrl, startFrameUrl hay character media.
- Body `handleGenAudio` giữ nguyên từng ký tự: không đổi provider, request, voice, polling hoặc cách sinh audio. Thay đổi ở ranh giới chọn text đầu vào và báo xung đột.
- Không chỉnh Cooking-AI-review, cấu hình GPU, GPU safety gate, inference worker hoặc tích hợp WaveSpeed mới.
- Không thay dependency hay package scripts.

Bằng chứng đối chiếu source: [unchanged-boundaries.json](F:/tool-ai-dh/web-ai/docs/phase2a1/unchanged-boundaries.json). Hash gateway xác nhận toàn bộ 14 module Python còn lại không thay đổi, bao gồm config, gpu, inference, worker, workflow_parser và workflow_schemas.

## 4. Kiểm thử đã thực thi

| Nhóm | Actual | Kết quả |
|---|---:|---|
| 131 test gateway Phase 2A | 131 test ID cũ đều có mặt, không skip hoặc xóa | PASS |
| Test gateway mới: canonical key, exact JSON round-trip, Unicode/CRLF, không mutate parser result | 3 case | PASS |
| Tổng gateway trên source đã cài tại local-ai-gateway | 134 case; 0 fail/error/skip | PASS |
| Test Web có sẵn | 12 test/subtest | PASS |
| Test tương thích Web mới | 25 case | PASS |
| Tổng Web | 37 test/subtest; 0 fail/skip | PASS |
| Production build | 1 build thành công | PASS |
| Kiểm tra whitespace diff trên file Web đã sửa | Exit code 0 sau dọn 4 dòng | PASS |

Các assertion cũ vốn mong Full AI có Voiceover được đổi sang mong Dialogue và **Voiceover vắng mặt**. Vẫn giữ nguyên kiểm tra text chính xác, nhân vật, translation, scene coverage và validation rejection; không chỉ giữ con số test.

Test Web mới tại [spoken-text-contract.test.mjs](F:/tool-ai-dh/web-ai/tests/spoken-text-contract.test.mjs) kiểm tra:

- Đọc Full canonical, Full legacy, hai alias bằng nhau, xung đột, rỗng, whitespace, kiểu dữ liệu sai.
- Semi chỉ dùng Voiceover, không dùng Dialogue làm narration.
- Tạo project Full từ shape mới/cũ chỉ có một field canonical; xung đột bị từ chối.
- Sửa/xóa text không làm Voiceover cũ xuất hiện trở lại và giữ media/metadata.
- Chạy component JSX thật trên CPU: nội dung hiển thị, callback chọn field, callback mở modal text, nút bị chặn khi xung đột, các phần tử audio/video vẫn hiện.
- Chạy Firebase helper thật trong VM với SDK/network **được cô lập bằng mock**: canonical data và estCost đúng; xung đột bị từ chối trước upload/ghi; progress update giữ nguyên dữ liệu legacy.

Đây là kiểm thử synthetic và component/SSR CPU, **không phải kiểm thử tương tác trình duyệt hay dữ liệu Firestore thật**.

### Hai file kịch bản thật

Không dùng kịch bản thay thế. Regression đọc byte trực tiếp từ hai đường dẫn gốc và xác minh SHA-256:

| File | SHA-256 | Actual |
|---|---|---|
| `C:/Users/Admin/Downloads/kịch bản gen video AI.txt` | `e24725a239b5084dfa4dfd57192cf636e2ebf423ee953ada760bce29d15ca74b` | 23 scene_1…scene_23, 23 Dialogue nguyên văn; không Voiceover; Judge 10, Defendant 8, Plaintiff 5; Dịch → Translate; đúng Character; không time_origin |
| `C:/Users/Admin/Downloads/kịch bản semi-content.txt` | `600431973c83c7c74603fcc1d347a0231c19a310a2a902669d3d8c99f12f9050` | 22 scene_1…scene_22; 22 Voiceover và time_origin; không Dialogue; Footage độc lập; characters=[]; các field thiếu giữ rỗng |

**PASS** cho parser, source validator và adapter đã thực thi trên hai file thật. Expected và actual theo từng scene được lưu đầy đủ:

- [Full AI: 23 scene](F:/tool-ai-dh/web-ai/docs/phase2a1/full-ai.regression.json).
- [Semi: 22 scene](F:/tool-ai-dh/web-ai/docs/phase2a1/semi.regression.json).

Mẫu Semi thật vẫn có Time = Time_origin ở cả 22 scene. Test hai giá trị khác nhau thuộc unit synthetic từ Phase 2A, không được coi là đã xác minh trên script thật.

### Lệnh thực sự đã chạy

Working directory Web: `F:\tool-ai-dh\web-ai`.

~~~text
F:\tool-ai-dh\local-ai-gateway\.venv\Scripts\python.exe -I -B C:\Users\Admin\AppData\Local\Temp\qwen-phase2a1-MLY42X\install.py
F:\tool-ai-dh\local-ai-gateway\.venv\Scripts\python.exe -I -B C:\Users\Admin\AppData\Local\Temp\qwen-phase2a1-MLY42X\verify.py
node --experimental-vm-modules --test --test-reporter=tap tests\*.test.mjs
npm run build
git diff --check -- src\MainEditor.jsx src\Workspace\Workspace.jsx src\Workspace\StoryboardTab.jsx src\firebase.js
~~~

Installer kiểm tra hash trước khi thay đúng adapter, hai file test cũ, tài liệu hợp đồng và thêm test gateway mới. Verification runner gọi pytest toàn thư mục gateway/tests với cache tắt, thư mục fixture tạm riêng và JUnit. Không overlay module staged: parser/adapter import từ gateway thực tế.

Lần chạy Node/Vite đầu trong sandbox không chạy được vì Windows `spawn EPERM`; Vite còn báo lỗi phụ khi resolve native dependency. Chạy lại cùng lệnh với quyền thực thi đã được công cụ phê duyệt thì test và build đều PASS. Không sửa dependency để vượt lỗi. Diff check đầu phát hiện whitespace trên 4 dòng được sửa, đã dọn và kiểm tra lại PASS.

Cảnh báo không chặn: Starlette/httpx deprecation, Node VM experimental, Vite plugin timing/chunk lớn hơn 500 kB; Git thông báo quy tắc chuyển LF/CRLF.

Bằng chứng:

- [Gateway verification](F:/tool-ai-dh/web-ai/docs/phase2a1/verification.json): đường dẫn import, 134 case, 131 ID cũ, module hash và thời gian.
- [JUnit gateway](F:/tool-ai-dh/web-ai/docs/phase2a1/gateway.junit.xml).
- [Web test/build output](F:/tool-ai-dh/web-ai/docs/phase2a1/web-checks.json).
- [Manifest thay đổi gateway](F:/tool-ai-dh/web-ai/docs/phase2a1/manifest.json).

## 5. Phần chưa xác minh và điểm dừng

| Hạng mục | Trạng thái / giới hạn |
|---|---|
| Qwen thật, latency, tokens/s, VRAM, Voice Profile quality | **NOT RUN**. Không load torch/transformers/bitsandbytes trong runner. Không có kết luận chất lượng inference. |
| Gemini response mới từ MainEditor | **NOT RUN**. Prompt và ranh giới lưu đã sửa, không gọi dịch vụ thật để kiểm chứng model tuân thủ. |
| Mở/sửa/lưu project trên Firestore thật | **NOT RUN**. Legacy/conflict/media được kiểm thử bằng fixture synthetic và helper cô lập; không khẳng định đã khảo sát toàn bộ project cũ. |
| Tương tác UI, phát/tải media trên trình duyệt thật | **NOT RUN**. Component output/callback và preservation được kiểm thử CPU; chưa chứng minh URL media thật còn truy cập được. |
| HTTP projectType, job dispatch nối workflow parser, Qwen → Web AI end-to-end | **NOT IMPLEMENTED trong phase này**. Giữ ranh giới Phase 2B. |
| Migration Firestore hoặc tái tạo media | Không thực hiện, không có cơ chế tự chạy được thêm vào. |

Phase 2A.1 hoàn tất trong phạm vi đã yêu cầu. Hợp đồng mới và tương thích legacy đã có test hồi quy. **Dừng tại đây, không tự triển khai Phase 2B.**
