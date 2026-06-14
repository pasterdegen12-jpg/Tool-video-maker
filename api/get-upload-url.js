import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export default async function handler(req, res) {
  // Chỉ cho phép phương thức POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { fileName, fileType } = req.body;

  // Khởi tạo kết nối tới Cloudflare R2 bằng biến môi trường
  const S3 = new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });

  try {
    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: fileName,
      ContentType: fileType,
    });

    // Tạo một đường link upload dùng 1 lần, hết hạn sau 1 tiếng (3600 giây)
    const uploadUrl = await getSignedUrl(S3, command, { expiresIn: 3600 });
    
    return res.status(200).json({ uploadUrl });
  } catch (err) {
    console.error("Lỗi R2 API:", err);
    return res.status(500).json({ error: 'Không thể tạo link upload R2' });
  }
}