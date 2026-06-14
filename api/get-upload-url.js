import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { fileName, fileType } = req.body;

  const S3 = new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
    // 🚀 DÒNG QUAN TRỌNG NHẤT: Ép thư viện không được nhét tên bucket lên đầu URL
    forcePathStyle: true 
  });

  try {
    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: fileName,
      ContentType: fileType,
    });

    const uploadUrl = await getSignedUrl(S3, command, { expiresIn: 3600 });
    
    return res.status(200).json({ uploadUrl });
  } catch (err) {
    console.error("Lỗi R2 API:", err);
    return res.status(500).json({ error: 'Không thể tạo link upload R2' });
  }
}