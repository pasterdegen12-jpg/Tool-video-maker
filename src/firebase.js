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
const CLOUDINARY_CLOUD_NAME = "djjvtqnjv"; 
const CLOUDINARY_UPLOAD_PRESET = "video-maker-upload"; 

export const autoSaveToFirebase = async (parsedData, projectName = "Video Project") => {
  const projectId = `proj_${Date.now()}`;
  let uploadData = JSON.parse(JSON.stringify(parsedData)); 

  console.log(`⏳ [BẮT ĐẦU] Chuẩn bị đẩy ${uploadData.length} video lên mây Cloudinary...`);

  // 🚀 TĂNG TỐC: BẮN TOÀN BỘ VIDEO LÊN MÂY CÙNG 1 LÚC (ĐA LUỒNG)
  const uploadPromises = uploadData.map(async (scene, i) => {
    if (scene.videoUrl && scene.videoUrl.startsWith('blob:')) {
      try {
        console.log(`-> Đang tải Scene ${scene.scene_n}...`);
        const response = await fetch(scene.videoUrl);
        const blob = await response.blob();
        
        const formData = new FormData();
        formData.append('file', blob);
        formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
        formData.append('resource_type', 'video');
        
        const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`, {
          method: 'POST',
          body: formData
        });
        
        const uploadDataRes = await uploadRes.json();
        
        if (uploadDataRes.secure_url) {
           uploadData[i].videoUrl = uploadDataRes.secure_url; 
           console.log(`✅ [THÀNH CÔNG] Đã upload xong Scene ${scene.scene_n}!`);
        } else {
           console.error(`❌ [LỖI CLOUDINARY] Scene ${scene.scene_n} thất bại:`, uploadDataRes);
        }
      } catch (error) {
        console.error(`❌ [LỖI MẠNG] Không thể upload Scene ${scene.scene_n}:`, error);
      }
    }
  });

  // Chờ tất cả video chạy đa luồng hoàn tất
  await Promise.all(uploadPromises);
  console.log("🔥 Hoàn tất upload Video. Đang lưu thông tin vào Firebase...");

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

  try {
    // 🚀 LƯU VÀO FIREBASE VÀ BẮT LỖI GẮT GAO
    await setDoc(doc(db, "projects", projectId), projectDoc);
    console.log("✅ Đã lưu Database thành công!");
    return projectId; // Trả về ID để tự động nhảy trang
  } catch (dbError) {
    console.error("❌ LỖI FIREBASE DATABASE:", dbError);
    // Cảnh báo thẳng mặt người dùng nếu Database từ chối
    alert(`Không thể lưu Database: ${dbError.message} (Nếu báo lỗi "Missing or insufficient permissions" tức là bạn chưa mở quyền Firebase Rules)`);
    throw dbError; 
  }
};