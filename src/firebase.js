import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc } from "firebase/firestore";

// ==========================================
// CẤU HÌNH FIREBASE DATABASE (Lưu kịch bản)
// ==========================================
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: "semicontent-e195b.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: "1082777610376",
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// 🚀 HÀM ÉP TIMEOUT: Bắt buộc dừng và văng lỗi nếu chạy quá lâu
const withTimeout = (promise, ms, errorMessage) => {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(errorMessage)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
};

// ==========================================
// HÀM LƯU DỰ ÁN & UPLOAD VIDEO LÊN CLOUDFLARE R2
// ==========================================
export const autoSaveToFirebase = async (data, projectName, script, characters = [], projectType = 'full-ai') => {
  const projectId = "proj_" + Date.now();
  let uploadData = JSON.parse(JSON.stringify(data)); 

  console.log(`⏳ [BẮT ĐẦU] Chuẩn bị đẩy ${uploadData.length} video lên mây Cloudflare R2...`);
  
  // BẮN TOÀN BỘ VIDEO LÊN MÂY R2 (ĐA LUỒNG)
  const uploadPromises = uploadData.map(async (scene, i) => {
    if (scene.videoUrl && scene.videoUrl.startsWith('blob:')) {
      try {
        console.log(`-> Đang xin quyền tải Scene ${scene.scene_n}...`);
        const response = await fetch(scene.videoUrl);
        const blob = await response.blob();
        
        // 1. Tạo tên file độc nhất cho cảnh này
        const uniqueFileName = `${projectId}/scene_${scene.scene_n}_${Date.now()}.mp4`;

        // 2. Gọi Vercel API để xin Link Upload (dùng 1 lần)
        const urlRes = await withTimeout(
          fetch('/api/get-upload-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileName: uniqueFileName, fileType: 'video/mp4' })
          }),
          15000, 
          "Vercel API không phản hồi khi xin link upload"
        );
        
        const { uploadUrl } = await urlRes.json();
        if (!uploadUrl) throw new Error("Server không cấp được Link Upload R2");

        console.log(`-> Đang đẩy Scene ${scene.scene_n} thẳng lên Cloudflare R2...`);

        // 3. Đẩy thẳng cục Video lên Cloudflare qua phương thức PUT
        const uploadRes = await withTimeout(
          fetch(uploadUrl, {
            method: 'PUT', 
            body: blob,
            headers: { 'Content-Type': 'video/mp4' } 
          }),
          600000, // Cho phép tối đa 10 phút y như cũ
          `Cloudflare upload bị kẹt quá 10 phút cho Scene ${scene.scene_n}` 
        );
        
        if (uploadRes.ok) {
           // 4. Ráp link Public VITE_R2_PUBLIC_URL với tên file để ra link xem trực tiếp
           const finalVideoUrl = `${import.meta.env.VITE_R2_PUBLIC_URL}/${uniqueFileName}`;
           uploadData[i].videoUrl = finalVideoUrl;
           console.log(`✅ [THÀNH CÔNG] Đã upload xong Scene ${scene.scene_n}!`);
        } else {
           throw new Error(`Cloudflare trả về mã lỗi: ${uploadRes.status}`);
        }
      } catch (error) {
        console.error(`❌ [LỖI TẢI LÊN] Scene ${scene.scene_n}:`, error.message);
        throw new Error(`Scene ${scene.scene_n} tải lên R2 thất bại: ${error.message}`);
      }
    }
  });

  // Chờ tất cả video tải xong 
  try {
    await Promise.all(uploadPromises);
    console.log("🔥 Hoàn tất upload toàn bộ Video. Đang lưu thông tin vào Firebase...");
  } catch (err) {
    throw new Error(`Đẩy video lên mây thất bại. Chi tiết: ${err.message}`);
  }

  // Tính tiền AI
  const totalVoice = uploadData.filter(s => s.Voiceover && s.Voiceover.trim() !== '').length;
  const cost = totalVoice * 0.01;

  // 🚀 ĐÓNG GÓI DỮ LIỆU ĐỂ LƯU VÀO FIREBASE
  const projectDoc = {
    id: projectId,
    projectName: projectName || "Dự án chưa đặt tên", 
    createdAt: Date.now(),
    sceneCount: uploadData.length,
    estCost: cost,
    data: uploadData,
    originalScript: script,
    characters: characters,
    projectType: projectType 
  };

  // 🚀 LƯU VÀO FIREBASE
  try {
    await withTimeout(
      setDoc(doc(db, "projects", projectId), projectDoc),
      15000,
      "Firebase không phản hồi sau 15 giây. Vui lòng kiểm tra lại kết nối mạng."
    );
    console.log("✅ Đã lưu Database thành công!");
    return projectId; 
  } catch (dbError) {
    console.error("❌ LỖI FIREBASE DATABASE:", dbError);
    throw dbError; 
  }
};

// 🚀 Cập nhật tiến độ dự án (Lưu Audio, Video Output, Voice Clone)
export const updateProjectProgress = async (projectId, updates) => {
  try {
    await setDoc(doc(db, "projects", projectId), updates, { merge: true });
    console.log(`✅ Đã lưu trữ tiến độ (Audio/Video/Voice) lên Firebase!`);
  } catch (error) {
    console.error("❌ Lỗi khi cập nhật tiến độ dự án:", error);
  }
};