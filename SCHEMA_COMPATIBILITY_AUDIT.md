# SCHEMA_COMPATIBILITY_AUDIT

Ngày: 2026-10-09 · Phạm vi: Web AI ↔ local-ai-gateway · Trạng thái: **AUDIT ONLY — chưa triển khai**

## 1. Kết luận và phạm vi bằng chứng

**Chưa thể nối trực tiếp endpoint Qwen hiện tại vào MainEditor.** Hợp đồng gateway chưa phân biệt workflow; grammar nhận speaker không tương thích với các field của Web AI; output cũng khác cấu trúc mà Web AI đang đọc/lưu.

Ngữ nghĩa do người dùng xác nhận:

- **`full-ai`**: Dialogue là lời nói của Character. Context, Camera, Action, Tone là thông tin cảnh. Không dùng Time_origin để cắt footage.
- **`semi`**: Voiceover là thuyết minh; time_origin dùng cắt footage. Footage, Effect, Translate, Tone_of_Voice là các field riêng. Không phân tích nhân vật theo cơ chế Full AI.

Báo cáo đọc source hiện có tại `F:/tool-ai-dh/web-ai`, `F:/tool-ai-dh/local-ai-gateway` và JSON decoder được gateway import từ Cooking-AI-review. Các tham chiếu cuối báo cáo chỉ tới file và dòng đã đọc.

Trong lượt này **không sửa source, không chạy test/inference, không khởi động gateway, không truy cập database, không thay đổi GPU gate hoặc workflow**. Chỉ tạo tài liệu này. Working tree Web AI đã có thay đổi từ trước và được giữ nguyên.

Phân loại bằng chứng:

- **Xác minh từ source**: nhánh xử lý, field, điều kiện kiểm tra và đường đọc/ghi thực sự có trong code. Đây là phân tích tĩnh, không phải kết quả chạy với kịch bản thật.
- **Đề xuất**: hợp đồng/adapter/test chưa được triển khai.
- **Cần dữ liệu thật**: cách trình bày screenplay ngoài thực tế, dữ liệu legacy đang tồn tại, chất lượng nhận diện và suy luận của Qwen.

Fixture courtroom trong gateway là dữ liệu kiểm thử được soạn sẵn, **không phải kịch bản thật đã được xác nhận và không phải output real model** ([G8], [G9]). Không dùng kết quả fake backend hoặc thông tin 49 test của Phase 1 để kết luận chất lượng hai workflow.

## 2. Hợp đồng Web AI hiện tại

### 2.1 Đầu vào UI và độ chặt của schema

MainEditor nhận một chuỗi `script` từ textarea; người dùng chọn nút Full AI hoặc Semi. Full AI chỉ kiểm tra script có giá trị; Semi yêu cầu thêm `videoFile` ([W1], [W2], [W3]). UI chưa định nghĩa grammar bắt buộc về tiêu đề cảnh, dấu phân cách tên/mô tả, thụt dòng hay lời thoại nhiều dòng.

Các schema dưới đây là **shape được yêu cầu trong prompt và được consumer mong đợi**, không phải schema đã được kiểm tra chặt ở runtime. `callGeminiAPI` chỉ tách JSON, parse, bọc array thành `{characters: [], scenes: array}`, và điền hai container còn thiếu. Không kiểm tra type từng field, quan hệ Character, hay lời thoại có được giữ nguyên ([W4]). Vì vậy không thể khẳng định mọi project đang lưu đều đúng shape này.

### 2.2 Full AI: source → kết quả phân tích → dữ liệu lưu

Luồng: script → prompt Full AI → `{characters, scenes}` → `autoSaveToFirebase(..., "full-ai")`. Nhánh này không gọi `performCutVideo` ([W1]).

| Thành phần source / ý nghĩa | Field Web AI sau phân tích | Kiểu mong đợi và quy tắc hiện tại |
|---|---|---|
| Nhân vật có tên và có thể kèm mô tả | `characters[].id/name/description/voiceTone` | Bốn string; prompt minh họa ID `char_1`, không có ràng buộc tạo ID trong JS |
| Nhân vật của cảnh | `scenes[].Character` | String tên ngắn, tham chiếu bằng **tên**, không phải character ID |
| Dialogue | `Voiceover` | String; prompt **yêu cầu đổi tên field này** |
| Context / Camera / Action | `Context / Camera / Action` | Các string riêng, không phải speaker |
| Tone | `Tone_of_Voice` | String thông tin giọng của cảnh |
| Bản dịch | `Translate` | String được yêu cầu trong output; prompt Full AI không quy định trích nguyên văn rõ như Semi |
| Thứ tự cảnh | `scene_n` | Number theo mẫu prompt |
| Số từ lời thoại | `Word_count` | Number, hiện yêu cầu model tính |
| Trạng thái ban đầu | `status` | String `"pending"` |
| Time_origin | Không có trong shape Full AI yêu cầu | Không có vai trò cắt footage trong nhánh này |

UI dùng chung vẫn hiển thị `time_origin || Time` (StoryboardTab:110), và thống kê Workspace:892 cũng đọc hai field này. Đây là đường hiển thị/thống kê, không gọi cutter và không thay đổi ngữ nghĩa Full AI đã xác nhận.

Shape tạo mới hiện tại là:
~~~text
{
  characters: [{ id: string, name: string, description: string, voiceTone: string }],
  scenes: [{
    scene_n: number, Context: string, Camera: string, Action: string,
    Character: string, Voiceover: string, Translate: string,
    Tone_of_Voice: string, Word_count: number, status: "pending"
  }]
}
~~~

`Dialogue` không nằm trong output mẫu của MainEditor Full AI. Nó xuất hiện trong consumer và được ghi cùng `Voiceover` khi sửa lời thoại ở Workspace ([W5]). **Voiceover trong project Full AI là alias lưu trữ của Dialogue; tên field đó không biến nội dung thành thuyết minh của Semi.**

Character là thực thể trong `characters[]`; scene nối tới thực thể bằng tên. Storyboard so tên sau trim; thao tác set ảnh nền và đổi tên trong Setup so tên chính xác. Do đó không thể đưa `speaker_id` của gateway trực tiếp vào `scene.Character` ([W7], [W8], [W9]).

### 2.3 Semi: source → kết quả phân tích → footage

Luồng: script + videoFile → prompt Semi → `{characters: [], scenes}` → cắt video theo `time_origin` → lưu với `projectType: "semi"` ([W2], [W10]).

| Source / ý nghĩa | Field Web AI | Quy tắc prompt và consumer |
|---|---|---|
| Time_origin | `time_origin: string` | Copy giá trị Time_origin; không lấy Time thay thế |
| Voiceover | `Voiceover: string` | Giữ ngôn ngữ, nội dung; không trộn Translate hay chỉ dẫn |
| Footage | `Footage: string` | Mô tả footage riêng |
| Effect | `Effect: string` | Hiệu ứng riêng, không nhập vào narration |
| Translate | `Translate: string` | Bản dịch riêng |
| Tone_of_Voice | `Tone_of_Voice: string` | Field riêng |
| Character nếu source có | `Character: string` | Prompt liệt kê trong field copy nguyên văn, nhưng ví dụ để trống; không phân tích nhân vật |
| Danh sách nhân vật | `characters: []` | Prompt bắt buộc rỗng |
| Thứ tự, số từ, trạng thái | `scene_n / Word_count / status` | Number / number / `"pending"`; không lời thuyết minh thì Voiceover rỗng và Word_count = 0 |

Shape trước khi cắt:
~~~text
{
  characters: [],
  scenes: [{
    scene_n: number, time_origin: string, Footage: string, Effect: string,
    Character: string, Voiceover: string, Translate: string,
    Tone_of_Voice: string, Word_count: number, status: "pending"
  }]
}
~~~

Prompt cho phép bỏ nhãn field và dấu ngoặc kép/khoảng trắng bao quanh; phần còn lại phải là substring chính xác của source. Field thiếu → chuỗi rỗng ([W2]). Đây mới là chỉ dẫn cho model, chưa có validator cưỡng chế.

Đối với `Character` của Semi, hướng tương thích tối thiểu là giữ giá trị source nếu có như một field độc lập, **không tạo character entity, ID hoặc speaker binding**; `characters[]` luôn rỗng. Không nên tự xoá field này khỏi dữ liệu cũ chỉ vì ví dụ prompt để rỗng. Cần mẫu Semi thật để xác nhận field này có được dùng hay không.

Cắt footage chỉ xét `scene.time_origin` có dấu `-` ASCII, tách thành start/end, tính duration = end − start. Hàm hỗ trợ cách đọc giây, mm:ss, hh:mm:ss; chưa kiểm tra đầy đủ số hữu hạn, thứ tự mốc hay giới hạn video. Field thiếu hoặc không có dấu `-` bị bỏ qua khi cắt, **scene vẫn còn trong array để lưu**. Cảnh cắt thành công nhận `videoUrl` dạng blob và `status: "cut"`, rồi qua luồng upload hiện hữu ([W10]). Không có fallback cắt từ `Time`.

### 2.4 Envelope lưu trữ chung

`autoSaveToFirebase` lưu project gồm `id, projectName, createdAt, sceneCount, estCost, data, originalScript, characters, projectType`. `data` chính là scenes sau xử lý/upload; `originalScript` giữ script truyền vào. Không có chuẩn hoá Dialogue ↔ Voiceover tại hàm lưu ([W11]).

Project cũ thiếu `projectType`: Workspace mặc định Full AI; nếu scene đầu có property Footage khác undefined thì chọn Semi. Không suy luận từ Voiceover ([W12]). Đây là heuristic đọc hiện tại, **không phải bằng chứng phân loại đúng mọi project legacy**.

## 3. Hợp đồng gateway hiện tại

### 3.1 Request và response HTTP

`POST /v1/script/analyze` nhận:

- `script: string`: bắt buộc, không trắng; schema giới hạn 1–100000 ký tự. API còn áp dụng `settings.max_script_chars` riêng (mặc định trong source: 40000).
- `language: string = "en"`: regex `^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$`; prompt chỉ dùng cho phần mô tả, không cho phép dịch lời thoại.
- Strict types, cấm extra fields. **Không có projectType**; gửi field đó với schema hiện tại sẽ không hợp lệ ([G1], [G2]).

API gọi `source_dialogues(script)` trước khi submit. Khi nhận job, response 202 có `job_id, state: "queued", status_url`. Client phải lấy `GET /v1/jobs/{job_id}`; envelope trả `job_id, state, result, error, metrics`. `result` chỉ có kết quả sau khi job hoàn tất ([G2], [G4]). Đây không phải response `{characters, scenes}` đồng bộ như hàm gọi Gemini hiện tại.

### 3.2 Schema result đang được ép buộc

Tất cả field dưới đây đều bắt buộc; extra fields bị cấm. Các string không nêu min có thể rỗng ([G1]).

| Object | Fields / giới hạn |
|---|---|
| ScriptAnalysis | `characters: Character[]` tối đa 100; `scenes: Scene[]` từ 1–200 |
| Character | `id` theo `^[a-z][a-z0-9_]{0,63}$`; `name` 1–100 ký tự; `description` tối đa 300; `voice_profile: VoiceProfile` |
| VoiceProfile | `delivery, emotion`: string tối đa 200 mỗi field; `evidence: string[]` tối đa 8 phần tử |
| Scene | `scene_number` integer 1–200; `source_reference` ≤160; `context` ≤1000; `camera` ≤400; `action` ≤1000; `character_ids: string[]` ≤100; `dialogue: Dialogue[]` ≤200; `voice_instruction` ≤200 |
| Dialogue | `speaker_id` theo regex ID; `text` 1–10000; `voice_instruction` ≤200 |

Validator bắt buộc ID/tên nhân vật không trùng, scene_number liên tiếp từ 1, participant ID tồn tại, speaker thuộc participant của scene. Danh sách dialogue có thể rỗng; tuy nhiên source parser từ chối **toàn bộ script không có record thoại được nhận diện**. Không nên nhầm điều này với việc mọi scene riêng lẻ đều phải có lời thoại.

Không có `Translate, time_origin, Footage, Effect, Voiceover, Word_count, status` trong result. Tên field scene và cấu trúc profile cũng khác Web AI. Một gateway scene có thể chứa nhiều người nói/nhiều utterance; một Web scene hiện có một Character string và một chuỗi lời thoại.

`analysis.py` chọn một prompt/schema duy nhất, kiểm tra kết quả rồi cho tối đa một lần sửa JSON. `jobs.py` kiểm tra lại bằng cùng ScriptAnalysis và validate_source trước khi công bố result ([G3], [G4]). Vì vậy sửa prompt đơn lẻ hoặc chỉ thêm field request sẽ không đủ.

## 4. Điểm nhận sai metadata thành speaker

Lỗi nằm ở grammar screenplay trong **gateway**, không nằm ở JSON decoder Cooking.

| Mã | Bằng chứng source | Hệ quả xác nhận bằng đọc code |
|---|---|---|
| C1 | `_LABEL` và `_source_records`, schemas.py:76–92 | Dòng có dạng nhãn:value, value không rỗng, nhãn không bị loại trừ → được thêm thẳng thành record (speaker, text) |
| C2 | `_RESERVED`, schemas.py:72–75 | Thiếu Dialogue, Voiceover, Time_origin, Footage, Effect, Translate, Tone_of_Voice; với dòng phù hợp regex, các tên field này bị coi là speaker |
| C3 | schemas.py:91,134 | Character: bị loại bỏ như metadata, không thiết lập nhân vật hiện tại để gắn với Dialogue. Khai báo được bảo vệ riêng lại phải có dạng CHARACTER id \| Name |
| C4 | schemas.py:120–162 | Validator lấy chính các record sai đó làm chuẩn số lượng, thứ tự và quyền sở hữu thoại. Model trả nhân vật thật có thể bị từ chối; model làm theo nhãn field có thể vượt phần kiểm tra này với danh tính sai |
| C5 | schemas.py:86–106 | Nhánh nhãn:value chỉ lấy phần trên cùng một dòng. Dòng tiếp nối không nhãn không được gắn vào record đó. Chỉ nhánh uppercase block có cơ chế gom nhiều dòng |
| C6 | schemas.py:116–129 | Chỉ nhận scene heading theo SCENE hoặc INT./EXT./INT/EXT.; nếu heading thực tế không khớp, kiểm tra ranh giới/thứ tự scene theo source không được áp dụng |

Context, Camera, Action, Tone **đã** nằm trong reserved set khi viết đúng nhãn đó. Không kết luận các field này luôn bị nhận sai. Biến thể nhãn khác chỉ có thể đánh giá sau khi có mẫu thực tế. Nhánh uppercase block cũng có thể coi tên field viết hoa không nằm trong reserved set là tên người nói.

C1–C6 là kết luận có điều kiện từ source, không phải log thực nghiệm với dữ liệu người dùng. Bổ sung vài tên vào blacklist chỉ ngăn một số record sai; vẫn không giải quyết binding Character → Dialogue, nhiều dòng, phân cảnh hoặc schema Semi.

Gateway import `app.services.vision_optimization.parse` từ Cooking tại inference.py:49. Hàm đó chỉ bỏ một cặp Markdown fence hoàn chỉnh rồi decode JSON; không nhận diện speaker hay phân loại workflow ([G6], [C1]). Không cần sửa Cooking để sửa lỗi grammar này.

## 5. Dialogue / Voiceover và dữ liệu legacy Full AI

Các shape dưới đây là khả năng được chứng minh bởi writer/reader hiện có, **chưa phải thống kê database thật**.

| Shape Full AI | Hành vi source hiện tại | Chính sách tương thích tối thiểu đề xuất |
|---|---|---|
| Chỉ Voiceover | Đúng shape tạo mới MainEditor; UI/audio fallback đọc được | Tiếp tục hỗ trợ; hiểu là Dialogue của Character trong project Full AI |
| Chỉ Dialogue, có nội dung | UI/audio đọc Dialogue; bộ đếm dùng Voiceover có thể lệch | Không chuyển dữ liệu mới sang Dialogue-only khi chưa xử lý consumer |
| Cả hai bằng nhau | Có thể sinh ra khi sửa Full AI tại Workspace | Giữ được cả hai, không cần migration |
| Cả hai khác nhau, Dialogue truthy | UI/audio ưu tiên Dialogue; không báo conflict | Adapter đọc legacy phải phát hiện conflict, không âm thầm ghi đè một bản |
| Dialogue rỗng, Voiceover còn nội dung | Toán tử `||` fallback về Voiceover | Không tự suy luận đó là chủ ý xoá hay bản cũ; cần dữ liệu/lịch sử thực tế |
| Dialogue chỉ có khoảng trắng, Voiceover có nội dung | Dialogue vẫn truthy; batch audio loại sau trim nên không fallback | Báo bất nhất khi nhập legacy; không trim/rewrite lời thoại để che lỗi |
| Cả hai thiếu/rỗng | Không có text để gen audio | Phân biệt cảnh im lặng hợp lệ với lỗi thiếu dữ liệu từ source |
| Project thiếu projectType | Dùng heuristic Footage scene đầu như mục 2.4 | Không đoán workflow từ tên Voiceover; không tự ghi lại projectType |
| Semi có thêm Dialogue | Reader Semi vẫn chỉ lấy Voiceover | Không dùng fallback Full AI hoặc tạo speaker cho Semi |

Bằng chứng đọc/sửa: Workspace:719–722,1562; StoryboardTab:165,214 ([W5], [W6], [W7]). `onChange` sửa Full AI gán cùng text vào cả Dialogue và Voiceover; khi lưu thay scene bằng object trong modal, không có bước báo alias conflict.

Hai phụ thuộc quan trọng nếu bỏ Voiceover:

1. Storyboard tính fallback Word_count từ Voiceover, không từ Dialogue. Với Dialogue-only và Word_count thiếu/0, lời thoại có thể hiển thị nhưng số từ là 0 ([W7]).
2. `autoSaveToFirebase` tính totalVoice/estCost chỉ bằng Voiceover. Dialogue-only sẽ không được tính ở phép đếm đó ([W11]).

Đây là các bất nhất reader được xác nhận; không khẳng định đã có project thực tế bị ảnh hưởng. Không thay đổi tính năng audio trong phạm vi đề xuất tích hợp ban đầu.

Ngoài ra, Setup đổi tên nhân vật còn ghi `updatedChar.voiceTone` vào Tone_of_Voice của mọi scene khớp tên ([W9]). Do đó profile nhân vật và Tone từng cảnh không thể coi là một field đồng nghĩa. Adapter không nên tự áp dụng thao tác Setup hoặc dùng profile để ghi đè Tone của cảnh.

## 6. Thiết kế đề xuất: hai parser và hai adapter

Tất cả mục này là đề xuất, chưa tồn tại trong code.

### 6.1 Dispatch theo workflow

Request từ Web AI gửi rõ `projectType: "full-ai" | "semi"`, cùng script và language. Giá trị không hợp lệ phải bị từ chối; không dò workflow từ Voiceover, Time hay Character.

Để không phá client Phase 1 đang chỉ gửi script/language: có thể giữ request thiếu projectType trong nhánh tương thích **grammar Full AI cũ đã tài liệu hoá**. Request mới từ Web AI luôn phải chỉ rõ loại. Đây là tương thích API cũ, không phải quy tắc suy đoán project legacy trong database.

Luồng cần nhất quán:

1. API dispatch parser/validation đầu vào theo projectType.
2. Worker nhận và giữ projectType.
3. Analysis chọn đúng prompt, schema result, kiểm tra source.
4. JobManager kiểm tra lại theo cùng loại trước khi trả result.
5. Web adapter lấy result của job hoàn tất, chuyển sang shape hiện có của workflow tương ứng.

Giữ envelope job và cơ chế worker hiện hữu. Không thay GPU reservation, model, Cooking source, audio hay cơ chế lưu/cắt hiện có. Nếu request có projectType nhưng parser không hiểu format, trả lỗi rõ với vị trí field/cảnh; không fallback sang workflow còn lại.

### 6.2 Full AI parser / adapter

**Parser Full AI** nhận scene block, Character là thực thể, Dialogue thuộc Character; Context/Camera/Action/Tone/Translate là field riêng. Chỉ binding bằng chứng rõ trong source; Character chứa mô tả phải tách tên/mô tả theo format đã xác nhận. Không đoán tên bằng cách lấy mọi nhãn trước dấu hai chấm.

Có thể giữ grammar speaker:dialogue/uppercase block cũ trong nhánh Full AI riêng, nhưng phải kiểm tra nhãn với cấu trúc/khai báo đã xác định; không cho nhãn field trở thành speaker mặc định. Cú pháp mơ hồ hoặc không phân định được người nói → báo lỗi, giữ nguyên source.

Hợp đồng nội bộ đề xuất: giữ cấu trúc Character/Dialogue có ID của gateway; bổ sung/giữ giá trị Translate và Tone của source cùng vị trí trích xuất. ID phải nhất quán trong một kết quả; không tự thay ID của project cũ khi đọc lại. Nhân vật im lặng vẫn cần được giữ khi source khai báo rõ.

**Adapter Full AI sang Web hiện tại:**

- scene_number → scene_n; context/camera/action → Context/Camera/Action.
- speaker_id → tra character.name → Character, không đưa ID vào field tên.
- Nội dung Dialogue nguồn → **Voiceover để tương thích writer hiện tại**. Chưa cần đổi mọi writer sang Dialogue hoặc thêm migration. Reader legacy vẫn phải hiểu Dialogue và xử lý conflict riêng.
- Tone của cảnh → Tone_of_Voice; Translate nguồn → Translate. Không trộn chúng vào nội dung nói.
- characters → id/name/description/voiceTone. voiceTone chỉ có thông tin có căn cứ; không tự ghi đè Tone scene. Profile có cấu trúc/evidence vẫn giữ trong kết quả gateway để kiểm tra, không giả định một string voiceTone lưu được toàn bộ evidence.
- Word_count do utility đếm trên text đã xác định; empty → 0. Đây là thay cách tạo field ở adapter, không phải đổi công thức billing hay audio.
- status mới = pending. Không dùng Time_origin để kích hoạt cắt video Full AI.

**Giới hạn cần giải quyết rõ:** một gateway scene nhiều speaker/utterance không có ánh xạ tổng quát không mất dữ liệu sang một Character + một Voiceover. Giai đoạn tối thiểu chỉ chuyển tự động khi cảnh có đúng một người nói và text có thể giữ nguyên một vùng source xác định. Với nhiều speaker hoặc các đoạn lời xen kẽ metadata: báo incompatibility kèm vị trí; **không ghép lời, bỏ lời, tự chia scene hay đổi numbering**. Cần kịch bản thật và quyết định ánh xạ trước khi mở rộng.

### 6.3 Semi parser / adapter

**Parser Semi** nhận các field riêng: Voiceover, Time_origin/time_origin, Footage, Effect, Translate, Tone_of_Voice và Character nếu có theo hợp đồng hiện tại. Không gọi bộ nhận diện speaker Full AI.

Hợp đồng kết quả đề xuất gần shape Web hiện có: `characters: []`, `scenes[]` với scene_n, time_origin, Footage, Effect, Character, Voiceover, Translate, Tone_of_Voice; thêm Word_count/status ở adapter. Không có speaker_id/character_ids/voice_profile bắt buộc cho narration.

Quy tắc:

- Voiceover là vùng text nguồn được xác định; Translate/Effect/chỉ dẫn vẫn độc lập.
- Cảnh không Voiceover vẫn được giữ, Word_count = 0.
- time_origin trích từ Time_origin/time_origin đã được định nghĩa; không dùng Time thay thế. Không nhét timestamp vào thoại.
- Giữ raw time_origin; parse start/end cho kiểm tra, không tự sửa mốc sai. Báo mốc thiếu/không hợp lệ trước khi bàn giao vào cutter. Video duration thực tế cần cho kiểm tra vượt biên.
- Không thay đổi hàm cắt hoặc upload ở lượt audit này; quyết định xử lý cảnh thiếu mốc trước triển khai phải được đối chiếu với dữ liệu thật vì hiện tại chúng bị bỏ qua khi cắt.
- Character chỉ giữ nguyên field nếu có; không lập danh sách nhân vật hay ép Voiceover có speaker.

### 6.4 Utility có thể dùng chung và invariant bắt buộc

Có thể chia sẻ: tách dòng có offsets, source spans theo scene/field, decode JSON chặt, kiểm tra type/giới hạn, kiểm tra coverage/thứ tự, đếm từ cho field hiển thị, lỗi có vị trí. Grammar field, speaker binding và quy tắc thời gian phải nằm ở parser tương ứng.

Không dùng một regex mọi nhãn là speaker cho cả hai workflow. Không “sửa” validation bằng cách loại những record model không trả được.

Với text được phát âm: so sánh chính xác vùng source sau khi bỏ delimiter của format được xác nhận; giữ nguyên Unicode, dấu câu, dòng mới và các lần lặp. Field metadata/source spans tách riêng, không chỉ kiểm tra substring xuất hiện đâu đó. Với field nhiều dòng, parser phải biết ranh giới hoặc từ chối; không chấp nhận chỉ lấy dòng đầu.

Voice Profile: validator hiện chỉ buộc evidence xuất hiện trong script và không rỗng khi có delivery/emotion; chưa kiểm tra excerpt thực sự thuộc nhân vật đó hoặc chứng minh suy luận là hợp lý ([G1]). Đề xuất bổ sung liên kết evidence → nhân vật/cảnh. Đánh giá ngữ nghĩa vẫn cần người đọc kịch bản thật; JSON hợp lệ không đồng nghĩa profile đúng.

## 7. Các thay đổi tối thiểu cần thiết nếu được yêu cầu triển khai

| Phạm vi | Thay đổi đề xuất | Lý do |
|---|---|---|
| Gateway schemas + parser | Hai loại result, workflow discriminator, parser riêng và validator riêng | Loại bỏ nhầm field/speaker mà giữ kiểm tra toàn vẹn |
| api.py / analysis.py / worker.py / jobs.py | Truyền/chọn projectType xuyên suốt, kiểm tra lại output đúng loại | Không để validator Full AI chặn hoặc diễn giải Semi sai |
| Contract JSON / test / tài liệu gateway | Cập nhật cùng schema thực thi, giữ regression grammar cũ | Tránh published schema và code lệch nhau |
| Ranh giới gọi AI của Web, ở bước triển khai sau | Chờ job hoàn tất rồi qua Full adapter hoặc Semi adapter | Giữ interface downstream `{characters, scenes}` và field cũ |
| Tương thích legacy | Đọc hai alias, báo xung đột; giữ Voiceover trong output tạo mới Full AI | Tránh phá reader/count hiện tại |
| Kiểm thử | Unit parser, adapter/contract, sau đó corpus thật đã gán nhãn | Tách tính đúng của code khỏi chất lượng model |

Không cần migration database, thay Cooking, sửa GPU safety gate, đổi model hoặc viết lại audio để thực hiện bước tương thích ban đầu. Những bất nhất consumer đã chỉ ra phải có regression test; sửa UX/conflict editor hoặc thống nhất bộ đếm là đề xuất riêng, không tự mở rộng scope.

## 8. Test case và expected result

**Toàn bộ bảng dưới đây là kế hoạch, chưa chạy trong lượt audit.** U = ca kỹ thuật có thể dùng fixture unit được ghi rõ là nhân tạo; R = cần mẫu thật/legacy thật để xác nhận độ phủ; Q = cần Qwen real inference ở giai đoạn được cho phép sau này. Test U không thay thế R/Q.

| ID | Tình huống | Expected result | Cần |
|---|---|---|---|
| F01 | Full có Character + Dialogue + Context/Camera/Action/Tone | Chỉ Character thành nhân vật; Dialogue giữ nguyên và gắn đúng ID; metadata riêng | U, R, Q |
| F02 | Character gồm tên và mô tả | Tách đúng tên/mô tả theo nhãn chuẩn; không cắt nhầm tên hoặc tạo nhân vật từ mô tả | R, Q |
| F03 | Cùng nhân vật xuất hiện nhiều scene | Một entity/ID nhất quán, mọi câu thuộc đúng scene và nhân vật | U, R, Q |
| F04 | Nhân vật được khai báo nhưng im lặng | Giữ entity và cảnh; không bịa thoại/profile | U, R, Q |
| F05 | Một scene nhiều speaker, hoặc lời xen kẽ action | Nội bộ giữ đủ thứ tự/quyền sở hữu; adapter Web báo chưa ánh xạ được, không tự gộp/tách | U, R, Q |
| F06 | Dialogue nhiều dòng, CRLF/LF, dấu câu, tiếng Việt | Bảo toàn text/span; không chỉ lấy dòng đầu, không dịch hoặc sửa chính tả | U, R, Q |
| F07 | Lặp nguyên câu ở hai vị trí/nhân vật | Giữ đúng số lần và owner; không deduplicate bằng substring | U, R, Q |
| F08 | Thiếu Character nhưng có Dialogue | Báo không xác định owner nếu source không có binding khác rõ ràng; không tạo speaker tên Dialogue | U, R |
| F09 | Full có thêm Time_origin hoặc Time | Không cắt footage; không nhận timestamp là thoại | U, R |
| F10 | Tên Unicode, tên trùng/alias, ID dễ collision | Không nhập hai người làm một hoặc đổi ID tường minh; mơ hồ phải báo | U, R, Q |
| F11 | Tone cảnh khác profile chung | Tone_of_Voice giữ Tone cảnh; không bị profile nhân vật ghi đè trong adapter | U, R, Q |
| F12 | Profile có evidence thật nhưng thuộc nhân vật khác/không liên quan | Không coi evidence substring là đủ chứng minh; yêu cầu owner đúng và đánh giá ngữ nghĩa | U, R, Q |
| S01 | Semi có đầy đủ các field riêng | characters=[]; Voiceover nguyên văn; không speaker_id, không field metadata thành nhân vật | U, R, Q |
| S02 | Đồng thời có Time và Time_origin khác nhau | time_origin lấy đúng nguồn Time_origin; cutter không lấy Time | U, R |
| S03 | Voiceover trống nhưng có footage và timestamp | Giữ scene, Word_count=0; footage vẫn đủ điều kiện cắt, không bịa narration | U, R, Q |
| S04 | Translate khác ngôn ngữ Voiceover | Hai field độc lập, không dịch/thay Voiceover bằng Translate | U, R, Q |
| S05 | Có Character trong Semi | Copy field nếu có; characters=[]; không chạy character recognition | U, R |
| S06 | Thiếu/sai time_origin, end≤start, quá thời lượng video | Báo lỗi/thiếu mốc trước bàn giao; không tự thay bằng Time hoặc bịa mốc | U, R + video |
| S07 | Timestamp dùng dấu gạch khác, decimal, hh:mm:ss | Chỉ nhận format đã chốt; format lạ báo rõ, không âm thầm bỏ cảnh | U, R |
| S08 | Footage/Effect/Voiceover nhiều dòng, dấu hai chấm trong nội dung | Giữ đúng ranh giới field và nguyên văn; không sinh speaker từ dòng con | U, R, Q |
| L01 | Full legacy chỉ Voiceover | Hiển thị/nội dung adapter tương đương hiện tại; không phân loại thành Semi | U, R |
| L02 | Full legacy chỉ Dialogue | Nhận đủ text; phát hiện phụ thuộc count Voiceover, không tuyên bố tương thích đầy đủ khi chưa xử lý | U, R |
| L03 | Hai alias bằng nhau/khác nhau | Bằng nhau giữ nguyên; khác nhau báo conflict và không ghi đè tự động | U, R |
| L04 | Dialogue rỗng/trắng nhưng Voiceover không rỗng | Phát hiện mơ hồ; không tự suy luận xoá hoặc silently fallback khi chuyển đổi | U, R |
| L05 | Thiếu projectType; Footage có/không ở scene đầu | Ghi nhận quyết định reader hiện tại; không auto-migrate, không dò bằng Voiceover | U, R |
| L06 | Legacy có ảnh/voice/video và scene status | Adapter đọc không làm mất field tài sản/trạng thái hoặc tạo lại ID hiện hữu | U, R |
| C01 | projectType full-ai/semi/không hợp lệ/thiếu | Dispatch đúng; sai bị reject; thiếu chỉ theo hợp đồng API cũ đã công bố | U |
| C02 | Field Dialogue/Voiceover/Footage/Translate dạng nhãn:value | Không tên field nào bị coi là speaker; kiểm tra parser và validator cùng kỳ vọng | U, R |
| C03 | Thêm/bớt/sửa/đảo/move thoại hoặc đổi speaker trong output | Validation thất bại; không trả thành công một phần | U, R, Q |
| C04 | Heading cảnh khác SCENE/INT/EXT, Markdown/bullet/đánh số | Có grammar rõ và giữ scene đầy đủ, hoặc báo unsupported; không bỏ kiểm tra coverage | U, R |
| C05 | Sai type, extra field, duplicate JSON key, ref không tồn tại | Reject JSON/schema; giữ kiểm tra ở analysis lẫn JobManager | U |
| C06 | Job queued/running/completed/failed | Chỉ completed hợp lệ mới đưa result qua adapter; không save kết quả thiếu/lỗi | U |
| C07 | Output adapter → consumer Web hiện tại | Field đúng case, scene_n đúng, Character khớp tên; Voiceover/count/Translate/Tone không mất | U, R |
| C08 | Courtroom fixture hiện hữu qua nhánh legacy | Regression giữ IDs/thoại; ghi rõ fixture authored, không coi là real script/model pass | U; Q riêng |

## 9. Dữ liệu thật còn thiếu và điều kiện kết luận

Trong phạm vi file đã kiểm tra, chưa có bộ kịch bản thật được xác nhận kèm expected result cho cả hai workflow. Không đọc production database và không xác nhận tỷ lệ các shape legacy.

Cần bổ sung trước khi kết luận độ phủ:

1. **Full AI thật**: raw screenplay chưa qua AI, kèm đánh dấu scene, tên nhân vật, từng đoạn Dialogue, Context/Camera/Action/Tone; ưu tiên mẫu có mô tả dài và lời thoại nhiều dòng. Nếu có cảnh nhiều người nói, cần xác nhận cách biểu diễn mong muốn trong Web.
2. **Semi thật**: raw screenplay có Voiceover/Translate/Footage/Effect/Tone_of_Voice, Time và Time_origin, cảnh im lặng; kèm thời lượng/video hoặc mốc cắt chuẩn để kiểm tra footage.
3. **Legacy export được phép dùng**: projectType, originalScript, characters và scenes của Full Voiceover-only, Full đã sửa sinh cả hai alias, trường hợp xung đột nếu có, Semi và project thiếu projectType. Có thể bỏ thông tin tài khoản và URL tài sản nhạy cảm; cần giữ cấu trúc field.
4. **Đánh giá profile**: người đọc xác nhận evidence hỗ trợ delivery/emotion của đúng nhân vật; thiếu căn cứ phải để rỗng, không “điền cho đủ”.

Trên corpus thật đã gán nhãn, yêu cầu tối thiểu: mọi đoạn thoại/narration được giữ đúng nội dung, số lần, scene và owner khi áp dụng; không sinh nhân vật từ metadata; không bỏ scene; Semi không phát sinh character model; mốc cắt đúng nguồn. JSON validity, coverage, ownership và đánh giá profile phải báo riêng, kèm số mẫu/ca lỗi. Không gộp chúng thành một nhãn “parser đạt chất lượng”.

**Đề nghị hiện tại:** sửa hợp đồng/parsers/adapters theo phạm vi tối thiểu sau khi được yêu cầu triển khai; sau đó kiểm tra bằng corpus thật. Chưa phê duyệt tích hợp production và chưa kết luận chất lượng Qwen. Real inference vẫn ngoài phạm vi lượt này; khi được yêu cầu lại phải qua GPU readiness/safety gate hiện hữu.

## 10. Tham chiếu source

Các dòng dưới đây thuộc working tree tại thời điểm đọc; không phải cam kết mọi field đã xuất hiện trong database.

- [W1 — MainEditor: prompt và lưu Full AI][W1]
- [W2 — MainEditor: prompt Semi][W2]
- [W3 — MainEditor: textarea đầu vào][W3]
- [W4 — MainEditor: JSON parse không có field validation][W4]
- [W5 — Workspace: sửa Full ghi cả Dialogue/Voiceover][W5]
- [W6 — Workspace: chọn text cho audio][W6]
- [W7 — Storyboard: count và ánh xạ Character][W7]
- [W8 — Workspace: dùng tên nhân vật lấy ảnh][W8]
- [W9 — Setup: đổi tên/profile cập nhật scene][W9]
- [W10 — MainEditor: time_origin và cắt footage][W10]
- [W11 — Firebase: đếm Voiceover và project envelope][W11]
- [W12 — Workspace: đọc projectType legacy][W12]
- [G1 — Gateway: request/result schema và source grammar][G1]
- [G2 — Gateway API: source prevalidation và job envelope][G2]
- [G3 — Gateway analysis: prompt/schema/validation][G3]
- [G4 — Gateway jobs: kiểm tra lại output][G4]
- [G5 — Gateway worker: khôi phục request][G5]
- [G6 — Gateway inference: import JSON decoder Cooking][G6]
- [G7 — Gateway process: truyền request qua worker][G7]
- [G8 — Gateway tests: fixture và fake backend][G8]
- [G9 — Gateway README: nguồn gốc authored fixture][G9]
- [C1 — Cooking: JSON decoder, không phải speaker parser][C1]

[W1]: F:/tool-ai-dh/web-ai/src/MainEditor.jsx:33
[W2]: F:/tool-ai-dh/web-ai/src/MainEditor.jsx:82
[W3]: F:/tool-ai-dh/web-ai/src/MainEditor.jsx:374
[W4]: F:/tool-ai-dh/web-ai/src/MainEditor.jsx:160
[W5]: F:/tool-ai-dh/web-ai/src/Workspace/Workspace.jsx:1562
[W6]: F:/tool-ai-dh/web-ai/src/Workspace/Workspace.jsx:719
[W7]: F:/tool-ai-dh/web-ai/src/Workspace/StoryboardTab.jsx:36
[W8]: F:/tool-ai-dh/web-ai/src/Workspace/Workspace.jsx:360
[W9]: F:/tool-ai-dh/web-ai/src/Workspace/SetupTab.jsx:22
[W10]: F:/tool-ai-dh/web-ai/src/MainEditor.jsx:200
[W11]: F:/tool-ai-dh/web-ai/src/firebase.js:114
[W12]: F:/tool-ai-dh/web-ai/src/Workspace/Workspace.jsx:144
[G1]: F:/tool-ai-dh/local-ai-gateway/ai_gateway/schemas.py:8
[G2]: F:/tool-ai-dh/local-ai-gateway/ai_gateway/api.py:94
[G3]: F:/tool-ai-dh/local-ai-gateway/ai_gateway/analysis.py:6
[G4]: F:/tool-ai-dh/local-ai-gateway/ai_gateway/jobs.py:94
[G5]: F:/tool-ai-dh/local-ai-gateway/ai_gateway/worker.py:35
[G6]: F:/tool-ai-dh/local-ai-gateway/ai_gateway/inference.py:49
[G7]: F:/tool-ai-dh/local-ai-gateway/ai_gateway/process.py:63
[G8]: F:/tool-ai-dh/local-ai-gateway/tests/test_analysis.py:10
[G9]: F:/tool-ai-dh/local-ai-gateway/README.md:113
[C1]: F:/Cooking-AI-review/app/services/vision_optimization.py:60
