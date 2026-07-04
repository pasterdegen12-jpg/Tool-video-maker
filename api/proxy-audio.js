// File: api/proxy-audio.js

export default async function handler(req, res) {
  const { url } = req.query;
  
  if (!url) {
    return res.status(400).json({ error: 'Thiếu tham số URL' });
  }

  try {
    // Backend Vercel đứng ra tải file MP3 từ Wavespeed/CloudFront
    const response = await fetch(url);
    if (!response.ok) throw new Error('Không thể tải file từ nguồn');

    // Đọc dữ liệu nhị phân của file Audio
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 🚀 CHÌA KHÓA Ở ĐÂY: Gắn thẻ "Mở khóa CORS" cho Frontend của bạn
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // Lưu cache 1 năm

    // Trả file MP3 về cho giao diện web
    res.status(200).send(buffer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}