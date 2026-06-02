import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc } from "firebase/firestore";

// Cấu hình Firebase Database (Lưu kịch bản)
const firebaseConfig = {
  apiKey: "AIzaSyD1rPLXpBMOa4ci9qevr1m5U6w4SRxCv3Y",
  authDomain: "semicontent-e195b.firebaseapp.com",
  projectId: "semicontent-e195b",
  messagingSenderId: "1082777610376",
  appId: "1:1082777610376:web:4a6020b6e9590aebf9573d"
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

export const autoSaveToFirebase = async (parsedData, projectName = "Video Project") => {
  const projectId = `proj_${Date.now()}`;
  let uploadData = JSON.parse(JSON.stringify(parsedData)); 

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
        
        // 🚀 Ép Cloudinary phải xong trong 90 giây/video
        const uploadRes = await withTimeout(
          fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`, {
            method: 'POST', body: formData
          }),
          90000, 
          `Cloudinary upload bị kẹt quá 90s cho Scene ${scene.scene_n}`
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

  // Chờ tất cả video tải xong (Nếu 1 cái lỗi, sẽ ném lỗi ngay ra ngoài)
  try {
    await Promise.all(uploadPromises);
    console.log("🔥 Hoàn tất upload toàn bộ Video. Đang lưu thông tin vào Firebase...");
  } catch (err) {
    throw new Error(`Đẩy video lên mây thất bại. Chi tiết: ${err.message}`);
  }

  // Tính tiền AI
  const totalVoice = uploadData.filter(s => s.Voiceover && s.Voiceover.trim() !== '').length;
  const cost = totalVoice * 0.01;

  const projectDoc = {
    id: projectId,
    name: projectName,
    createdAt: Date.now(),
    sceneCount: uploadData.length,
    estCost: cost,
    data: uploadData
  };

  // 🚀 ÉP TIMEOUT CHO FIREBASE (Tối đa 15 giây)
  try {
    await withTimeout(
      setDoc(doc(db, "projects", projectId), projectDoc),
      15000,
      "Firebase không phản hồi sau 15 giây. Vui lòng kiểm tra lại cấu hình Database Rules (Quyền truy cập) hoặc mạng của bạn."
    );
    console.log("✅ Đã lưu Database thành công!");
    return projectId; 
  } catch (dbError) {
    console.error("❌ LỖI FIREBASE DATABASE:", dbError);
    throw dbError; 
  }
};

// 🚀 HÀM MỚI: Cập nhật tiến độ dự án (Lưu Audio, Video Output, Voice Clone)
export const updateProjectProgress = async (projectId, updates) => {
  try {
    // { merge: true } giúp chỉ cập nhật những phần có thay đổi, giữ nguyên kịch bản cũ
    await setDoc(doc(db, "projects", projectId), updates, { merge: true });
    console.log(`✅ Đã lưu trữ tiến độ (Audio/Video/Voice) lên Firebase!`);
  } catch (error) {
    console.error("❌ Lỗi khi cập nhật tiến độ dự án:", error);
  }
};