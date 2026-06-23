import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc } from "firebase/firestore";

// ==========================================
// CẤU HÌNH FIREBASE DATABASE
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

// 🚀 HÀM ÉP TIMEOUT
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
  
  // 🚀 VÒNG LẶP TUẦN TỰ: TẢI LÊN TỪNG FILE MỘT
  for (let i = 0; i < uploadData.length; i++) {
    const scene = uploadData[i];
    
    if (scene.videoUrl && scene.videoUrl.startsWith('blob:')) {
      let success = false;
      let retries = 3; // 🚀 CƠ CHẾ 1: Cho phép thử lại tối đa 3 lần nếu rớt mạng
      
      while (retries > 0 && !success) {
        try {
          console.log(`-> Đang xử lý Scene ${scene.scene_n} (${i + 1}/${uploadData.length})... (Lần thử: ${4 - retries}/3)`);
          
          const response = await fetch(scene.videoUrl);
          const blob = await response.blob();
          
          const uniqueFileName = `${projectId}/scene_${scene.scene_n}_${Date.now()}.mp4`;

          // Gọi Vercel API xin Link Upload
          const urlRes = await withTimeout(
            fetch('/api/get-upload-url', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ fileName: uniqueFileName, fileType: 'video/mp4' })
            }),
            15000, 
            "Vercel API không phản hồi khi xin link upload"
          );
          
          if (!urlRes.ok) {
             if (urlRes.status === 429) throw new Error("Vercel Rate Limit (Quá nhiều request)");
             throw new Error("Server trả về lỗi khi xin Link");
          }

          const { uploadUrl } = await urlRes.json();
          if (!uploadUrl) throw new Error("Server không cấp được Link Upload R2");

          // Đẩy Video lên Cloudflare (PUT)
          const uploadRes = await withTimeout(
            fetch(uploadUrl, {
              method: 'PUT', 
              body: blob,
              headers: { 'Content-Type': 'video/mp4' } 
            }),
            600000, 
            `Cloudflare upload bị kẹt quá 10 phút cho Scene ${scene.scene_n}` 
          );
          
          if (uploadRes.ok) {
             const finalVideoUrl = `${import.meta.env.VITE_R2_PUBLIC_URL}/${uniqueFileName}`;
             uploadData[i].videoUrl = finalVideoUrl;
             console.log(`✅ [THÀNH CÔNG] Đã upload xong Scene ${scene.scene_n}!`);
             
             success = true; // Đánh dấu thành công để thoát vòng lặp while
          } else {
             throw new Error(`Cloudflare trả về mã lỗi: ${uploadRes.status}`);
          }
        } catch (error) {
          retries--;
          console.warn(`⚠️ Lỗi tải Scene ${scene.scene_n}: ${error.message}. Đang thử lại... (Còn ${retries} lần)`);
          
          if (retries === 0) {
            console.error(`❌ [LỖI TẢI LÊN] Scene ${scene.scene_n} thất bại hoàn toàn!`);
            throw new Error(`Scene ${scene.scene_n} tải lên R2 thất bại: ${error.message}`);
          }
          
          // 🚀 CƠ CHẾ 2: Nghỉ 2.5 giây trước khi thử lại để Server nhả block Rate Limit
          await new Promise(resolve => setTimeout(resolve, 2500));
        }
      }
      
      // 🚀 CƠ CHẾ 3: Nghỉ ngơi 1.5 giây giữa mỗi video thành công để tránh dính Rate Limit cho video tiếp theo
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }

  console.log("🔥 Hoàn tất upload toàn bộ Video. Đang lưu thông tin vào Firebase...");

  // Tính tiền AI
  const totalVoice = uploadData.filter(s => s.Voiceover && s.Voiceover.trim() !== '').length;
  const cost = totalVoice * 0.01;

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

  try {
    await withTimeout(
      setDoc(doc(db, "projects", projectId), projectDoc),
      15000,
      "Firebase không phản hồi sau 15 giây."
    );
    console.log("✅ Đã lưu Database thành công!");
    return projectId; 
  } catch (dbError) {
    console.error("❌ LỖI FIREBASE DATABASE:", dbError);
    throw dbError; 
  }
};

// 🚀 Cập nhật tiến độ dự án
export const updateProjectProgress = async (projectId, updates) => {
  try {
    await setDoc(doc(db, "projects", projectId), updates, { merge: true });
    console.log(`✅ Đã lưu trữ tiến độ lên Firebase!`);
  } catch (error) {
    console.error("❌ Lỗi khi cập nhật tiến độ:", error);
  }
};