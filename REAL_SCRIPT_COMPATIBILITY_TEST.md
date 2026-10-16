# REAL_SCRIPT_COMPATIBILITY_TEST

Ngày: 2026-10-09 · Baseline CPU trên hai file người dùng cung cấp · **Full AI: FAIL · Semi: FAIL**

Đã thực thi parser/source extractor và các validator CPU hiện có, không thay thế bằng static audit. **Không chạy inference, không load Qwen, không gọi backend giả.** FAIL là kết quả tương thích format ở tầng CPU; kiểm thử toàn tuyến HTTP → model → Web AI là **NOT RUN**.

## 1. Input files verified

| Workflow | File thực tế | Bytes | SHA-256 | Xác minh |
|---|---|---:|---|---|
| Full AI | [kịch bản gen video AI.txt](<C:/Users/Admin/Downloads/kịch bản gen video AI.txt>) | 17406 | `e24725a239b5084dfa4dfd57192cf636e2ebf423ee953ada760bce29d15ca74b` | PASS |
| Semi | [kịch bản semi-content.txt](<C:/Users/Admin/Downloads/kịch bản semi-content.txt>) | 13164 | `600431973c83c7c74603fcc1d347a0231c19a310a2a902669d3d8c99f12f9050` | PASS |

Đọc trực tiếp bằng UTF-8 strict, giữ nguyên CRLF (Full: 213; Semi: 562). Hash trước/sau test trùng nhau. Không đổi nội dung, không tạo kịch bản thay thế. Các chỉ dẫn trong kịch bản được coi là dữ liệu, không được thực thi như lệnh.

Kiểm kê độc lập từ source xác nhận:

- Full: đúng `scene_1` đến `scene_23`, 23 Character/Dialogue/Dịch; Judge 10, Defendant 8, Plaintiff 5. Không có Time_origin.
- Semi: đúng `scene_1` đến `scene_22`, 22 Voiceover, 22 Time_origin, 22 Footage, 22 Effect. Có 13 metadata header. Không có Character, Translate hoặc Tone_of_Voice.
- Semi: **Time và Time_origin bằng nhau trong cả 22 scene**. Trường hợp khác nhau là NOT RUN.

Kiểm kê này là oracle của harness (chuẩn đối chiếu từ file thật), **không phải khả năng trích xuất scene/field của gateway**.

## 2. Commands actually executed

Runtime thực tế: `F:\tool-ai-dh\local-ai-gateway\.venv\Scripts\python.exe`, Python 3.12.14. Import trực tiếp production module `F:\tool-ai-dh\local-ai-gateway\ai_gateway\schemas.py`. Không copy/thay thế hàm cần kiểm thử.

Lệnh CPU thực tế, working directory `F:\tool-ai-dh\web-ai`:

~~~bat
F:\tool-ai-dh\local-ai-gateway\.venv\Scripts\python.exe -I -B C:\Users\Admin\AppData\Local\Temp\qwen-real-script-baseline-XLU7tw\run_baseline.py
~~~

Lệnh chạy hai lần, đều exit code 0. Lần hai chỉ đổi tên nhãn kết luận trong harness từ `end_to_end_compatibility` thành `cpu_format_compatibility` để tránh hiểu nhầm; input/hàm production/phép so sánh không đổi. Exit code 0 nghĩa là harness hoàn tất và đã lưu các lỗi tương thích, **không có nghĩa parser PASS**.

Lần cuối: 2026-10-09T15:30:34.258310+00:00 → 2026-10-09T15:30:34.282310+00:00 (UTC). Log lệnh/stdout/exit code thực tế: [cpu-command-result.json](C:/Users/Admin/AppData/Local/Temp/qwen-real-script-baseline-XLU7tw/cpu-command-result.json). Thời gian chạy harness không phải độ trễ inference.

Các lệnh kiểm tra phụ đã chạy:

~~~text
[Web AI] git status --short
[Gateway] rg -n -e projectType -e source_dialogues -e validate_source -e adapter -e _scene_markers -e _source_records ai_gateway tests
[Web AI] rg -n -i -e qwen -e local-ai -e /v1/script/analyze -e adapt.*full -e adapt.*semi src api
[Gateway] rg --files ai_gateway
~~~

Lệnh kiểm tra shell ban đầu `Get-Location` thất bại vì PowerShell báo Windows CET (exit -2146233082); các lệnh sau dùng cmd.exe. Đây không phải lỗi gateway. Đọc file, tạo hash, viết harness/báo cáo dùng filesystem API trong Node REPL.

Các hàm production thực sự đã gọi:

- `AnalyzeRequest.model_validate`: mỗi file, có và không có projectType.
- `_source_records(script)`, `source_dialogues(script)`, `_scene_markers(script)`: nguyên văn từng file.
- `ScriptAnalysis.model_validate`: projection Full từ source và contract witness Semi từ source.
- `validate_source`: projection Full có 23 lời thoại đối chiếu file Full nguyên bản.
- `Scene.model_validate`: thêm lần lượt Translate và Dịch lấy từ scene_1 thật vào scene projection Full.

Chạy với `-I -B`. Harness chặn import torch/transformers/bitsandbytes/pycuda/cupy và entry point inference/worker/API. Kết quả `prohibited_modules_loaded = []`; không gọi GPU reservation hoặc sửa safety gate.

## 3. Phương pháp và giới hạn bằng chứng

Return value nguyên gốc được JSON-serialize trong `*.actual-calls.json`; tuple trở thành array JSON, text không bị sửa. `*.actual-records-annotated.json` bổ sung dòng/offset/scene **do oracle gắn**, không gán khả năng nhận diện scene đó cho gateway.

Oracle chỉ đọc tiêu đề scene_N và field có thật trong hai file, giữ span nguồn, kiểm tra thứ tự/count với expected người dùng. Không có dòng nội dung chưa phân loại trong oracle. Đây là code kiểm thử tạm, không cài vào production và không phải adapter đã triển khai.

“Nguyên văn” nghĩa là so từng ký tự phần giá trị sau nhãn và khoảng trắng phân cách. Full giữ cả dấu ngoặc kép bao quanh Dialogue/Dịch đúng file. Không đổi dấu câu, ngôn ngữ, Unicode hoặc nội dung. Hai mẫu không cung cấp ca thoại nhiều dòng để kiểm chứng riêng.

**Đầu vào validator, không phải output model:**

- Full projection: copy 23 Dialogue, Character, Context, Camera, Action, Tone; ID kiểm thử judge/defendant/plaintiff theo tên, description/profile để rỗng. Chỉ projection vào field schema hiện biểu diễn được, **không chứa Dịch**. Sau đó thử thêm Translate hoặc Dịch để đo phản ứng schema.
- Semi contract witness: copy field của 22 scene vào shape Web; characters=[], field vắng để rỗng, scene_n lấy từ heading, Word_count đếm trong harness, status=pending là hằng hợp đồng. Đây chỉ là đầu vào kiểm thử schema, **không chứng minh adapter tồn tại hoặc gateway đã xuất field rỗng đúng**.
- Không chạy `analysis.analyze`, `backend.generate` hoặc server. Không tạo output giả rồi coi là kết quả Qwen.

## 4. Expected vs actual — tổng hợp

| Tiêu chí | Expected | Actual đo được | Status |
|---|---|---|---|
| Input đúng yêu cầu | Hai file thật | Đọc được, hash không đổi | PASS |
| Full source inventory | 23 scene, 3 tên phân bố 10/8/5 | Đúng theo oracle nguồn | PASS (input only) |
| Full scene recognition | scene_1…scene_23 | _scene_markers trả [] | FAIL |
| Full Dialogue text | 23 nguyên văn | 23/23 đúng text, đúng thứ tự trong record label Dialogue | PASS (text only) |
| Full owner mapping | Judge 10 / Defendant 8 / Plaintiff 5 | 0/23 đúng; speaker label đều Dialogue | FAIL |
| Full Dịch | Bản dịch riêng | 23 text giữ nguyên nhưng Dịch thành speaker | FAIL |
| Full không field thành speaker | Không speaker theo tên field | 46 record: Dialogue 23 + Dịch 23 | FAIL |
| Full Character entities cuối pipeline | 3 entity thật | Chưa chạy model/entity builder | NOT RUN |
| Full không dùng Time_origin | Không cắt footage theo mốc | Source không có; cutter/model không chạy | PASS (vắng trong source); NOT RUN (hành vi nếu field xuất hiện) |
| Semi source inventory | 22 scene/Voiceover/Time_origin | Đúng theo oracle nguồn | PASS (input only) |
| Semi scene recognition | scene_1…scene_22 | _scene_markers trả [] | FAIL |
| Semi Voiceover text | 22 nguyên văn | 22/22 đúng text, đúng thứ tự nhưng speaker label Voiceover | PASS (text only) |
| Semi Time_origin | 22 field thời gian riêng | 22 giá trị dưới speaker label Time_origin | FAIL (phân loại) |
| Voiceover / Footage độc lập | Hai field riêng | Text tách thành 2 record/scene, không nối; cả hai bị coi là speaker | PASS (chuỗi tách biệt); FAIL (ngữ nghĩa) |
| Semi không metadata speaker | Không record speaker từ field | 233 record nhãn field, gồm 211 record ngoài Voiceover | FAIL |
| Semi không Character entity | characters=[] ở output | Chưa có output typed Semi/entity generation | NOT RUN |
| Field Semi vắng → rỗng | Translate/Tone_of_Voice/Character rỗng | Chưa có adapter; witness tự điền không tính là output | NOT IMPLEMENTED |
| projectType | Hỗ trợ full-ai/semi | Cả hai extra_forbidden ở request model | FAIL |
| Workflow parser/adapter riêng | Hai nhánh đúng schema Web | Chưa có | NOT IMPLEMENTED |
| Time khác Time_origin | Chọn Time_origin | Hai field bằng nhau 22/22 | NOT RUN |
| Real Qwen, JSON/profile model, HTTP toàn tuyến | Output thực tế từ model | Không thực hiện | NOT RUN |

46/233 là số record label/text/offset, **không phải số Character entity do Qwen sinh**. Model chưa chạy, nhưng sai phân loại speaker ở tầng source đã được đo trực tiếp.

## 5. Scene coverage và speaker mapping — Full AI

Đối chiếu đủ 23 scene. Tên scene trong bảng lấy theo vị trí trong file gốc vì gateway trả danh sách phẳng. Mỗi scene có 2 record actual: Dialogue và Dịch.

| Scene (dòng nguồn) | Character expected | Speaker actual của Dialogue | Dialogue nguyên văn | Dịch actual | Scene marker actual | Kết quả |
|---|---|---|---|---|---|---|
| scene_1 (7) | Judge | Dialogue | PASS | Speaker Dịch — FAIL | Không nhận — FAIL | FAIL |
| scene_2 (16) | Defendant | Dialogue | PASS | Speaker Dịch — FAIL | Không nhận — FAIL | FAIL |
| scene_3 (25) | Plaintiff | Dialogue | PASS | Speaker Dịch — FAIL | Không nhận — FAIL | FAIL |
| scene_4 (34) | Judge | Dialogue | PASS | Speaker Dịch — FAIL | Không nhận — FAIL | FAIL |
| scene_5 (43) | Defendant | Dialogue | PASS | Speaker Dịch — FAIL | Không nhận — FAIL | FAIL |
| scene_6 (52) | Plaintiff | Dialogue | PASS | Speaker Dịch — FAIL | Không nhận — FAIL | FAIL |
| scene_7 (61) | Judge | Dialogue | PASS | Speaker Dịch — FAIL | Không nhận — FAIL | FAIL |
| scene_8 (70) | Defendant | Dialogue | PASS | Speaker Dịch — FAIL | Không nhận — FAIL | FAIL |
| scene_9 (79) | Plaintiff | Dialogue | PASS | Speaker Dịch — FAIL | Không nhận — FAIL | FAIL |
| scene_10 (88) | Defendant | Dialogue | PASS | Speaker Dịch — FAIL | Không nhận — FAIL | FAIL |
| scene_11 (97) | Judge | Dialogue | PASS | Speaker Dịch — FAIL | Không nhận — FAIL | FAIL |
| scene_12 (106) | Defendant | Dialogue | PASS | Speaker Dịch — FAIL | Không nhận — FAIL | FAIL |
| scene_13 (115) | Judge | Dialogue | PASS | Speaker Dịch — FAIL | Không nhận — FAIL | FAIL |
| scene_14 (124) | Defendant | Dialogue | PASS | Speaker Dịch — FAIL | Không nhận — FAIL | FAIL |
| scene_15 (133) | Judge | Dialogue | PASS | Speaker Dịch — FAIL | Không nhận — FAIL | FAIL |
| scene_16 (142) | Plaintiff | Dialogue | PASS | Speaker Dịch — FAIL | Không nhận — FAIL | FAIL |
| scene_17 (151) | Judge | Dialogue | PASS | Speaker Dịch — FAIL | Không nhận — FAIL | FAIL |
| scene_18 (160) | Defendant | Dialogue | PASS | Speaker Dịch — FAIL | Không nhận — FAIL | FAIL |
| scene_19 (169) | Judge | Dialogue | PASS | Speaker Dịch — FAIL | Không nhận — FAIL | FAIL |
| scene_20 (178) | Defendant | Dialogue | PASS | Speaker Dịch — FAIL | Không nhận — FAIL | FAIL |
| scene_21 (187) | Judge | Dialogue | PASS | Speaker Dịch — FAIL | Không nhận — FAIL | FAIL |
| scene_22 (196) | Plaintiff | Dialogue | PASS | Speaker Dịch — FAIL | Không nhận — FAIL | FAIL |
| scene_23 (205) | Judge | Dialogue | PASS | Speaker Dịch — FAIL | Không nhận — FAIL | FAIL |

Expected từ file: Judge 10, Defendant 8, Plaintiff 5. Actual label của 23 Dialogue: Judge 0, Defendant 0, Plaintiff 0, Dialogue 23. Đây là lỗi mapping, không phải mất 23 chuỗi thoại.

## 6. Scene coverage, thời gian và Footage — Semi

Mỗi scene có 10 record actual: Time_origin, Scene_Duration, Footage, Voiceover, VO_Token_Count, VO_Target_Range, Audio_Mode, Content_Function, Review_Angle, Effect. Time nằm trong reserved set nên không trở thành record speaker. Extractor chưa xuất field time_origin typed.

| Scene (dòng nguồn) | Time_origin nguồn = text actual | Voiceover nguyên văn | Footage nguyên văn, riêng record | Record bị coi là speaker | Scene marker actual | Kết quả |
|---|---|---|---|---|---|---|
| scene_1 (16) | 00:00 - 00:04 | PASS | PASS | 10 | Không nhận — FAIL | FAIL |
| scene_2 (41) | 00:04 - 00:09 | PASS | PASS | 10 | Không nhận — FAIL | FAIL |
| scene_3 (66) | 00:30 - 00:35 | PASS | PASS | 10 | Không nhận — FAIL | FAIL |
| scene_4 (91) | 00:50 - 00:55 | PASS | PASS | 10 | Không nhận — FAIL | FAIL |
| scene_5 (116) | 00:59 - 01:04 | PASS | PASS | 10 | Không nhận — FAIL | FAIL |
| scene_6 (141) | 01:10 - 01:15 | PASS | PASS | 10 | Không nhận — FAIL | FAIL |
| scene_7 (166) | 01:21 - 01:26 | PASS | PASS | 10 | Không nhận — FAIL | FAIL |
| scene_8 (191) | 01:54 - 01:59 | PASS | PASS | 10 | Không nhận — FAIL | FAIL |
| scene_9 (216) | 01:59 - 02:04 | PASS | PASS | 10 | Không nhận — FAIL | FAIL |
| scene_10 (241) | 02:04 - 02:09 | PASS | PASS | 10 | Không nhận — FAIL | FAIL |
| scene_11 (266) | 02:22 - 02:27 | PASS | PASS | 10 | Không nhận — FAIL | FAIL |
| scene_12 (291) | 02:43 - 02:48 | PASS | PASS | 10 | Không nhận — FAIL | FAIL |
| scene_13 (316) | 02:57 - 03:02 | PASS | PASS | 10 | Không nhận — FAIL | FAIL |
| scene_14 (341) | 03:10 - 03:15 | PASS | PASS | 10 | Không nhận — FAIL | FAIL |
| scene_15 (366) | 03:17 - 03:22 | PASS | PASS | 10 | Không nhận — FAIL | FAIL |
| scene_16 (391) | 03:29 - 03:34 | PASS | PASS | 10 | Không nhận — FAIL | FAIL |
| scene_17 (416) | 03:34 - 03:39 | PASS | PASS | 10 | Không nhận — FAIL | FAIL |
| scene_18 (441) | 03:40 - 03:45 | PASS | PASS | 10 | Không nhận — FAIL | FAIL |
| scene_19 (466) | 03:45 - 03:50 | PASS | PASS | 10 | Không nhận — FAIL | FAIL |
| scene_20 (491) | 03:50 - 03:55 | PASS | PASS | 10 | Không nhận — FAIL | FAIL |
| scene_21 (516) | 03:55 - 04:00 | PASS | PASS | 10 | Không nhận — FAIL | FAIL |
| scene_22 (541) | 04:00 - 04:06 | PASS | PASS | 10 | Không nhận — FAIL | FAIL |

PASS trong bảng chỉ kiểm tra chuỗi literal. Scene recognition và phân loại field vẫn FAIL. Thêm 13 record header ngoài scene: tổng 22 × 10 + 13 = **233**.

Character, Translate, Tone_of_Voice đều vắng trong source (0/22 mỗi field); expected adapter để rỗng và characters=[]. Không lấy Persona_Core làm Character hoặc Review_Angle làm Tone_of_Voice, không bịa Translate. Hành vi sinh field rỗng của production là NOT IMPLEMENTED; chưa có bằng chứng model bịa/không bịa các field đó.

## 7. Metadata misclassification

Full histogram actual: `{"Dialogue":23,"Dịch":23}`. Context, Character, Tone, Camera, Action không xuất hiện trong record output; Character không được dùng để binding, Dịch không thành translation.

Semi histogram actual:

| Nhãn actual | Số record | Vị trí |
|---|---:|---|
| Primary_Content_Mode | 1 | Header trước scene_1 |
| Secondary_Flavor | 1 | Header trước scene_1 |
| Coverage_Mode | 1 | Header trước scene_1 |
| Angle_Thesis | 1 | Header trước scene_1 |
| Persona_Core | 1 | Header trước scene_1 |
| Narrative_Thread | 1 | Header trước scene_1 |
| Target_Audience_Context | 1 | Header trước scene_1 |
| Primary_Goal | 1 | Header trước scene_1 |
| Target_Duration | 1 | Header trước scene_1 |
| Scene_Count | 1 | Header trước scene_1 |
| TTS_Pacing_Profile | 1 | Header trước scene_1 |
| Affiliate_Mode | 1 | Header trước scene_1 |
| Routing_Note | 1 | Header trước scene_1 |
| Time_origin | 22 | Mỗi scene một record |
| Scene_Duration | 22 | Mỗi scene một record |
| Footage | 22 | Mỗi scene một record |
| Voiceover | 22 | Mỗi scene một record |
| VO_Token_Count | 22 | Mỗi scene một record |
| VO_Target_Range | 22 | Mỗi scene một record |
| Audio_Mode | 22 | Mỗi scene một record |
| Content_Function | 22 | Mỗi scene một record |
| Review_Angle | 22 | Mỗi scene một record |
| Effect | 22 | Mỗi scene một record |

23 tên nhãn ở Semi là 23 **loại label bị nhận như speaker**, không phải 23 nhân vật đã sinh. Trong 233 record, 22 có text Voiceover đúng nhưng label speaker sai; 211 còn lại là field khác/header bị kéo vào danh sách lời nói.

## 8. Validation failures — thực thi thật

| Lời gọi | Input | Actual | Đánh giá |
|---|---|---|---|
| AnalyzeRequest.model_validate × 2 | File thật, script + language | RETURNED, giữ script nguyên văn | PASS hợp đồng cũ; không xác nhận format screenplay |
| AnalyzeRequest.model_validate × 2 | Thêm projectType full-ai/semi | ValidationError: projectType, extra_forbidden, Extra inputs are not permitted | FAIL routing |
| _source_records / source_dialogues | Hai file thật | RETURNED 46 / 233 record | Đã chạy; FAIL ngữ nghĩa |
| _scene_markers | Hai file thật | RETURNED [] / [] | FAIL coverage |
| ScriptAnalysis.model_validate | Full reference projection: 23 thoại/3 nhân vật | RETURNED | PASS shape projection kiểm thử, không phải result production |
| validate_source | Full projection + source nguyên bản | ValueError: Dialogue coverage does not match the source | FAIL compatibility |
| Scene.model_validate | Full scene_1 projection + Translate thật | ValidationError: Translate, extra_forbidden | FAIL translation |
| Scene.model_validate | Full scene_1 projection + Dịch thật | ValidationError: Dịch, extra_forbidden | FAIL translation alias |
| ScriptAnalysis.model_validate | Semi Web contract witness từ 22 scene thật | ValidationError, 396 lỗi | FAIL schema compatibility |
| validate_source cho Semi typed result | Chưa có kiểu/result Semi hợp lệ | Không gọi | NOT RUN; thiếu implementation |
| Validator trên output Qwen thật | Không có output model | Không gọi | NOT RUN |

Full: validator dựng expected từ extractor sai, đếm **46** record, còn projection chỉ có **23** Dialogue. Hàm dừng tại [schemas.py:133](F:/tool-ai-dh/local-ai-gateway/ai_gateway/schemas.py:133). **Chưa đi tới** các nhánh owner, text hoặc profile phía sau trong lần gọi này; không tuyên bố các nhánh đó đã được kiểm chứng bằng output Qwen.

Semi: 396 lỗi = 22 × (8 required field thiếu + 10 field Web bị cấm). Missing: scene_number, source_reference, context, camera, action, character_ids, dialogue, voice_instruction. Extra: scene_n, time_origin, Footage, Effect, Voiceover, Translate, Tone_of_Voice, Character, Word_count, status. Đây là lỗi trên contract witness, **không phải 396 lỗi do Qwen sinh**.

Log lỗi đầy đủ: [full-ai.validation-results.json](C:/Users/Admin/AppData/Local/Temp/qwen-real-script-baseline-XLU7tw/full-ai.validation-results.json) và [semi.validation-results.json](C:/Users/Admin/AppData/Local/Temp/qwen-real-script-baseline-XLU7tw/semi.validation-results.json).

## 9. Adapter và những phần chưa thể kiểm chứng

- **NOT IMPLEMENTED:** workflow parser/schema Semi riêng; dispatch projectType; Full/Semi adapter sang Web; binding Character/Dialogue theo format block này; Dịch thành translation field.
- **NOT RUN:** real inference; HTTP endpoint, worker lifecycle, entity output; JSON/model repair thực tế; chất lượng Voice Profile; model loading time, tokens/s, VRAM; cắt footage, save Firebase, audio. Không gán số đo hoặc PASS cho các mục này.
- **NOT RUN trên dữ liệu này:** Time khác Time_origin, Full có Time_origin, legacy Dialogue/Voiceover xung đột, thoại nhiều dòng, nhiều speaker trong một scene, cảnh không lời. Không sửa input để tạo ca mới.
- QwenAdapter hiện có là adapter gọi inference backend, không phải adapter schema Full/Semi. Code Qwen voice clone trong Web AI là luồng audio hiện hữu, không chứng minh tích hợp local script-analysis.

## 10. Danh sách lỗi phải sửa theo ưu tiên

| Ưu tiên | Lỗi đã đo / phần thiếu | File / function | Hướng sửa tối thiểu sau baseline |
|---|---|---|---|
| P0-1 | projectType reject ở cả hai file | [schemas.py:11](F:/tool-ai-dh/local-ai-gateway/ai_gateway/schemas.py:11), AnalyzeRequest; api/analysis/jobs | Dispatch và schema riêng xuyên suốt, giữ tương thích client cũ có chủ đích |
| P0-2 | Scene recognition 0/23 và 0/22 | [schemas.py:116](F:/tool-ai-dh/local-ai-gateway/ai_gateway/schemas.py:116), _scene_markers | Nhận scene_N, kiểm tra đủ scene và đúng thứ tự |
| P0-3 | Full owner sai 23/23; Dịch thành speaker | [schemas.py:72](F:/tool-ai-dh/local-ai-gateway/ai_gateway/schemas.py:72), _source_records | Parser Full Character → Dialogue; Dịch → translation, bỏ suy đoán mọi nhãn là speaker |
| P0-4 | Semi 233 record speaker từ field | [schemas.py:78](F:/tool-ai-dh/local-ai-gateway/ai_gateway/schemas.py:78), _source_records | Parser Semi riêng, tách header/narration/footage/effect/time; không Character recognition |
| P0-5 | Validator Full lấy expected sai; schema không biểu diễn Semi | [schemas.py:120](F:/tool-ai-dh/local-ai-gateway/ai_gateway/schemas.py:120), validate_source; [analysis.py:46](F:/tool-ai-dh/local-ai-gateway/ai_gateway/analysis.py:46); [jobs.py:97](F:/tool-ai-dh/local-ai-gateway/ai_gateway/jobs.py:97) | So với source spans và owner đúng workflow; giữ strict coverage, không nới để bỏ lỗi |
| P1-1 | Translate/Dịch extra_forbidden | [schemas.py:38](F:/tool-ai-dh/local-ai-gateway/ai_gateway/schemas.py:38), Scene | Field translation riêng, alias Dịch, không nhập vào lời nói |
| P1-2 | Thiếu adapter output sang Web | Gateway/Web boundary | Giữ Full Voiceover legacy; Semi xuất field độc lập, field vắng rỗng; không đổi Firebase schema |

Baseline chỉ đo và lưu lỗi. **Chưa sửa lỗi production nào.**

## 11. Actual output và dữ liệu đối chiếu

Tất cả test script và JSON bằng chứng nằm trong thư mục tạm `C:/Users/Admin/AppData/Local/Temp/qwen-real-script-baseline-XLU7tw`. Không ghi test script vào production source. Temp có thể được hệ điều hành dọn về sau; báo cáo này giữ số đo, lỗi, bảng đủ 45 scene và toàn bộ chuỗi thoại.

- [run_baseline.py](C:/Users/Admin/AppData/Local/Temp/qwen-real-script-baseline-XLU7tw/run_baseline.py) — harness đã chạy.
- [manifest.json](C:/Users/Admin/AppData/Local/Temp/qwen-real-script-baseline-XLU7tw/manifest.json) — path/hash của input và source trước test.
- [baseline-results.json](C:/Users/Admin/AppData/Local/Temp/qwen-real-script-baseline-XLU7tw/baseline-results.json) — summary, execution flags, errors, no-model guard.
- [cpu-command-result.json](C:/Users/Admin/AppData/Local/Temp/qwen-real-script-baseline-XLU7tw/cpu-command-result.json) — lệnh/stdout/exit code thật.
- [full-ai.actual-calls.json](C:/Users/Admin/AppData/Local/Temp/qwen-real-script-baseline-XLU7tw/full-ai.actual-calls.json) / [semi.actual-calls.json](C:/Users/Admin/AppData/Local/Temp/qwen-real-script-baseline-XLU7tw/semi.actual-calls.json) — return values gốc.
- [full-ai.actual-records-annotated.json](C:/Users/Admin/AppData/Local/Temp/qwen-real-script-baseline-XLU7tw/full-ai.actual-records-annotated.json) / [semi.actual-records-annotated.json](C:/Users/Admin/AppData/Local/Temp/qwen-real-script-baseline-XLU7tw/semi.actual-records-annotated.json) — actual text/label/offset/dòng.
- [full-ai.per-scene-comparison.json](C:/Users/Admin/AppData/Local/Temp/qwen-real-script-baseline-XLU7tw/full-ai.per-scene-comparison.json) / [semi.per-scene-comparison.json](C:/Users/Admin/AppData/Local/Temp/qwen-real-script-baseline-XLU7tw/semi.per-scene-comparison.json) — expected/actual đủ từng scene, gồm Dialogue/Dịch hoặc Voiceover/Footage/Time_origin và metadata.
- [full-ai.source-inventory.json](C:/Users/Admin/AppData/Local/Temp/qwen-real-script-baseline-XLU7tw/full-ai.source-inventory.json) / [semi.source-inventory.json](C:/Users/Admin/AppData/Local/Temp/qwen-real-script-baseline-XLU7tw/semi.source-inventory.json) — oracle nguồn, không phải production extractor.
- [full-ai.validator-inputs-NOT-MODEL-OUTPUT.json](C:/Users/Admin/AppData/Local/Temp/qwen-real-script-baseline-XLU7tw/full-ai.validator-inputs-NOT-MODEL-OUTPUT.json) / [semi.validator-inputs-NOT-MODEL-OUTPUT.json](C:/Users/Admin/AppData/Local/Temp/qwen-real-script-baseline-XLU7tw/semi.validator-inputs-NOT-MODEL-OUTPUT.json) — input tham chiếu cho validator.

Cuối harness: input hashes unchanged=true; hashes của các production file snapshot (schemas.py, errors.py, analysis.py, __init__.py) unchanged=true; prohibited modules loaded=[]. Không ghi production code, GPU config, Cooking hoặc Firebase. Giữ nguyên các thay đổi working tree có sẵn.

## 12. Đối chiếu nguyên văn từng scene

### Full AI — text giữ nguyên nhưng speaker sai

Expected raw Dialogue và actual text bằng nhau chính xác từng dòng sau; actual speaker vẫn là Dialogue, không phải Character. Ngoặc kép có thật trong source.

| Scene | Expected Dialogue raw = actual text trong record speaker Dialogue | So sánh |
|---|---|---|
| scene_1 | "You froze this man's entire mortgage over a used sofa and some stuffed animals?" | EXACT |
| scene_2 | "Your Honor, the law is absolute. He operated an unlicensed retail operation on state soil." | EXACT |
| scene_3 | "It was a garage sale! I made two hundred bucks selling my grandkids' old toys!" | EXACT |
| scene_4 | "Hold on. Let me get the facts straight. The state slapped an eighteen-hundred dollar fine on you... for a yard sale?" | EXACT |
| scene_5 | "He violated the commercial code. When the fine went unpaid, the lien was a standard collection procedure." | EXACT |
| scene_6 | "Standard procedure?! I can't refinance my house! You guys treated me like a tax-evading drug lord!" | EXACT |
| scene_7 | "Counselor, do you realize how absurd this looks? You're bankrupting a citizen over spring cleaning." | EXACT |
| scene_8 | "We don't make the rules, Your Honor. The retail sale of goods to the public requires a trader's license. Plain and simple." | EXACT |
| scene_9 | "I'm not a trader! I do this once a year with my neighbors. We trade old gardening tools!" | EXACT |
| scene_10 | "Ignorance of the law doesn't exempt him from the eighteen-hundred dollar penalty." | EXACT |
| scene_11 | "You want to talk about the law? Let's open the state commercial code right now." | EXACT |
| scene_12 | "Section four, Your Honor. Unlicensed retail sales." | EXACT |
| scene_13 | "Let's read the exact definition of a retail trader, shall we? 'Systematic commercial activity... for the purpose of generating profit.'" | EXACT |
| scene_14 | "Exactly, and he generated two hundred dollars of—" | EXACT |
| scene_15 | "A once-a-year garage sale is not 'systematic commercial activity'! It's a guy getting rid of junk!" | EXACT |
| scene_16 | "Exactly! Are my neighbors supposed to incorporate a business just to sell a lawnmower?" | EXACT |
| scene_17 | "Show me the exact statute that strictly prohibits selling your own used couch. Show it to me." | EXACT |
| scene_18 | "Well... the- the broad interpretation of the code implies—" | EXACT |
| scene_19 | "There is no such law! You slapped a lien on this man's home because some overzealous inspector wanted to hit a quota!" | EXACT |
| scene_20 | "Your Honor, the state must regulate unrecorded transactions to protect—" | EXACT |
| scene_21 | "The only thing I'm protecting today is this citizen from your department. The eighteen-hundred dollar fine is dismissed." | EXACT |
| scene_22 | "Oh, thank God. What about my house?" | EXACT |
| scene_23 | "The lien is removed immediately. And congratulations, Counselor, the state is paying all court costs. We're done here." | EXACT |

### Semi — text giữ nguyên nhưng Voiceover bị coi là speaker

| Scene | Expected Voiceover = actual text trong record speaker Voiceover | So sánh |
|---|---|---|
| scene_1 | Seri nấu ăn chăm vợ. Chuyện là bả đang ốm sụt sịt mà đòi ăn tiệc. | EXACT |
| scene_2 | Tại sao lại thế thì để anh kể. Lôi đống thuốc bắc ra xé xé trông như bà lang băm. | EXACT |
| scene_3 | Đong tí gạo với diêm mạch nấu cơm. Ốm mà ăn uống lỉnh kỉnh dã man. | EXACT |
| scene_4 | Xong lôi cái kéo ra cắt lạp xưởng xộc xộc. Đúng bài lười chảy thây trốn rửa thớt. | EXACT |
| scene_5 | Tống thuốc bắc với đùi gà vào nồi hầm. Khúc này anh thấy mùi lười biếng bay mất rồi. | EXACT |
| scene_6 | Quay sang cắt măng tây. Ốm thì ốm chứ kỹ năng múa kéo vẫn cứ là đỉnh chóp. | EXACT |
| scene_7 | Nhưng hoang mang tột độ là bả lôi mấy cái túi zip trữ rau củ gọt sẵn ra. | EXACT |
| scene_8 | Đến đoạn luộc rau. Tưởng luộc nước lọc bình thường nhưng không, phải có tí mẹo cơ. | EXACT |
| scene_9 | Bóp tuýp mỡ lợn vào. Đậu má mỡ lợn giờ đóng tuýp như kem đánh răng à? | EXACT |
| scene_10 | Cơ mà luộc rau có tí mỡ lợn nó xanh mướt mườn mượt, nhìn mlem thật sự. | EXACT |
| scene_11 | Vớt ra táng thêm tí muối đường với dầu mè. Đa nhiệm thoăn thoắt chóng cả mặt. | EXACT |
| scene_12 | Nồi canh gà hầm lụp bụp. Mở nắp ra khói bốc lên thơm lộng óc các vợ ạ. | EXACT |
| scene_13 | Tranh thủ pha bát nước chấm. Bày vẽ thế này tí anh rửa bát ốm đòn chứ đùa. | EXACT |
| scene_14 | Nồi cơm chín bả múc hẳn cái sốt nấm đen xì xì trộn vào. Chơi sang vãi nồi. | EXACT |
| scene_15 | Trộn thẳng trong cái ruột nồi cơm luôn. Làm màu nãy giờ cuối cùng cũng hiện nguyên hình. | EXACT |
| scene_16 | Chưa xong đâu, còn nấu chè tráng miệng. Mấy viên khoai tím nổi lềnh phềnh. | EXACT |
| scene_17 | Rắc thêm tí vụn nấm tuyết. Ốm mà vẫn đòi ăn dưỡng nhan, anh cũng quỳ lạy luôn. | EXACT |
| scene_18 | Chốt hạ bằng hộp cốt dừa rót vào chè. Nhìn cái màu nó mỹ mãn tột độ. | EXACT |
| scene_19 | Lên mâm 4 món hoành tráng. Ăn thì sướng đấy nhưng nghĩ đến đống bát là hoang mang. | EXACT |
| scene_20 | Đang định ngồi thì con báo thủ lông vàng này chiếm mẹ luôn cái ghế. Bất lực. | EXACT |
| scene_21 | Nhai rau giòn sần sật, cắn miếng gà mềm nục ngậm mồm. Ngon đến nỗi quên cả ốm. | EXACT |
| scene_22 | Húp bát chè béo ngậy nữa. Thôi em đi rửa bát cho vợ đây, xin vía cả nhà bình an nhé! | EXACT |

**Kết luận baseline:** text literal được giữ trong record phẳng trên hai mẫu, nhưng scene, owner và phân loại field không đạt hợp đồng. Full AI FAIL; Semi FAIL. Real inference NOT RUN. Dừng ở bước đo baseline; chưa triển khai sửa parser.
