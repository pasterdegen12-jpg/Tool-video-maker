// File: api/proxy-media.js

// 🚀 Kích hoạt sức mạnh Edge Stream để phá vỡ giới hạn 4.5MB của Vercel
export const config = {
  runtime: 'edge', 
};

export default async function handler(req) {
  // Vì là Edge Runtime nên sử dụng chuẩn Web API thay vì req.query
  const { searchParams } = new URL(req.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return new Response(JSON.stringify({ error: 'Thiếu tham số URL' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const response = await fetch(targetUrl);
    if (!response.ok) throw new Error('Không thể tải file từ Server gốc');

    // Bê nguyên dòng chảy (stream) từ Google ném thẳng cho User, kèm theo "bùa hộ mệnh" COEP
    return new Response(response.body, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cross-Origin-Resource-Policy': 'cross-origin',
        'Content-Type': response.headers.get('content-type') || 'video/mp4',
        'Cache-Control': 'public, max-age=86400' // Cho phép trình duyệt lưu cache 1 ngày cho mượt
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}