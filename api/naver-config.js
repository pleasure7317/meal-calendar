// 네이버 지도 JS SDK 클라이언트 키 전달 (도메인 제한이 걸린 공개용 키)
export default function handler(req, res) {
    const key = process.env.NAVER_MAP_KEY_ID || '';
    // 키가 없을 땐 캐시하지 않음 (설정 직후 바로 반영되게)
    res.setHeader('Cache-Control', key ? 's-maxage=3600, stale-while-revalidate=86400' : 'no-store');
    return res.status(200).json({ mapKeyId: key });
}
