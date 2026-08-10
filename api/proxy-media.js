// File: api/proxy-media.js
export default async function handler(req, res) {
  const { url } = req.query;
  
  if (!url) {
    return res.status(400).json({ error: 'Thiếu tham số URL' });
  }

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Không thể tải file từ Google CDN');

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 🚀 BÙA HỘ MỆNH: Cấp phép cho file xuyên qua tường lửa COEP của Firebase
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'); 
    res.setHeader('Content-Type', response.headers.get('content-type') || 'video/mp4');

    res.status(200).send(buffer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}