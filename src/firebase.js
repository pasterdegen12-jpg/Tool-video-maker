import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, setDoc } from "firebase/firestore";

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
  
  // FIX: Sử dụng Deep Copy thay vì Shallow Copy để ngắt kết nối hoàn toàn với state của React
  let uploadData = JSON.parse(JSON.stringify(parsedData)); 

  for (let i = 0; i < uploadData.length; i++) {
    const scene = uploadData[i];
    
    // Đẩy video lên mây Cloudinary
    if (scene.videoUrl && scene.videoUrl.startsWith('blob:')) {
      try {
        const response = await fetch(scene.videoUrl);
        const blob = await response.blob();
        
        const formData = new FormData();
        formData.append('file', blob);
        formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
        formData.append('resource_type', 'video'); // Bắt buộc để nó biết đây là video
        
        const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`, {
          method: 'POST',
          body: formData
        });
        
        const uploadDataRes = await uploadRes.json();
        
        if (uploadDataRes.secure_url) {
           uploadData[i].videoUrl = uploadDataRes.secure_url; 
        } else {
           console.error("Lỗi từ Cloudinary:", uploadDataRes);
        }
      } catch (error) {
        console.error(`Lỗi upload video scene ${scene.scene_n} lên Cloudinary:`, error);
      }
    }
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

  // Ném kịch bản vào Firebase
  await setDoc(doc(collection(db, "projects"), projectId), projectDoc);
  console.log("✅ Đã đẩy Video lên Cloudinary và lưu lịch sử Database thành công!");
  
  // 🚀 THÊM DÒNG NÀY ĐỂ TRẢ VỀ ID DỰ ÁN CHO ĐƯỜNG LINK (ROUTER)
  return projectId;
};