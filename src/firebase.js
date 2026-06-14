import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc } from "firebase/firestore";

// Cấu hình Firebase Database (Lưu kịch bản)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: "semicontent-e195b.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: "1082777610376",
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// ==========================================
// CẤU HÌNH CLOUDINARY (Lưu file Video)
// ==========================================
export const CLOUDINARY_CLOUD_NAME = "djjvtqnjv"; 
export const CLOUDINARY_UPLOAD_PRESET = "video-maker-upload"; 

// 🚀 HÀM ÉP TIMEOUT: Bắt buộc dừng và văng lỗi nếu chạy quá lâu
const withTimeout = (promise, ms, errorMessage) => {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(errorMessage)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
};

// 🚀 ĐÃ SỬA DÒNG NÀY: Thêm tham số projectType = 'full-ai' vào cuối cùng
export const autoSaveToFirebase = async (data, projectName, script, characters = [], projectType = 'full-ai') => {
  const projectId = "proj_" + Date.now();
  let uploadData = JSON.parse(JSON.stringify(data)); 

  console.log(`⏳ [BẮT ĐẦU] Chuẩn bị đẩy ${uploadData.length} video lên mây Cloudinary...`);
  
  // BẮN TOÀN BỘ VIDEO LÊN MÂY (ĐA LUỒNG)
  const uploadPromises = uploadData.map(async (scene, i) => {
    if (scene.videoUrl && scene.videoUrl.startsWith('blob:')) {
      try {
        console.log(`-> Đang tải Scene ${scene.scene_n} lên Cloudinary...`);
        const response = await fetch(scene.videoUrl);
        const blob = await response.blob();
        
        const formData = new FormData();
        formData.append('file', blob);
        formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
        formData.append('resource_type', 'video');
        
        // Nới lỏng thời gian chờ lên 10 phút (600000ms)
        const uploadRes = await withTimeout(
          fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`, {
            method: 'POST', body: formData
          }),
          600000, 
          `Cloudinary upload bị kẹt quá 10 phút cho Scene ${scene.scene_n}` 
        );
        
        const uploadDataRes = await uploadRes.json();
        if (uploadDataRes.secure_url) {
           uploadData[i].videoUrl = uploadDataRes.secure_url;
           console.log(`✅ [THÀNH CÔNG] Đã upload xong Scene ${scene.scene_n}!`);
        } else {
           throw new Error(JSON.stringify(uploadDataRes));
        }
      } catch (error) {
        console.error(`❌ [LỖI TẢI LÊN] Scene ${scene.scene_n}:`, error.message);
        throw new Error(`Scene ${scene.scene_n} tải lên thất bại: ${error.message}`);
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
    projectType: projectType // 🚀 Workspace sẽ đọc trường này để rẽ nhánh UI
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