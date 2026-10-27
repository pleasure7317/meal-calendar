// 네이버 지도 JS SDK 클라이언트 키 전달 (도메인 제한이 걸린 공개용 키)
export default function handler(req, res) {
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json({ mapKeyId: process.env.NAVER_MAP_KEY_ID || '' });
}
