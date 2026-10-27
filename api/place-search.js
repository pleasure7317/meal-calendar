// 네이버 지역 검색 API — 가게 이름/장소명으로 검색 (키는 서버에만 보관)
function clean(s) {
    return String(s || '')
        .replace(/<[^>]*>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();
}

export default async function handler(req, res) {
    const q = String((req.query && req.query.q) || '').trim();
    if (!q) return res.status(400).json({ error: '검색어를 입력해 주세요' });

    const id = process.env.NAVER_SEARCH_CLIENT_ID;
    const secret = process.env.NAVER_SEARCH_CLIENT_SECRET;
    if (!id || !secret) {
        return res.status(500).json({ error: 'NAVER_SEARCH_CLIENT_ID / NAVER_SEARCH_CLIENT_SECRET 환경변수가 없어요' });
    }

    try {
        const url = 'https://openapi.naver.com/v1/search/local.json'
            + `?query=${encodeURIComponent(q)}&display=5&start=1&sort=random`;
        const r = await fetch(url, {
            headers: { 'X-Naver-Client-Id': id, 'X-Naver-Client-Secret': secret },
        });
        const j = await r.json();
        if (!r.ok) {
            return res.status(r.status).json({ error: j.errorMessage || `검색 오류 (${r.status})` });
        }
        // mapx/mapy: WGS84 경도/위도 × 10^7
        const items = (j.items || []).map(it => ({
            name: clean(it.title),
            category: clean(it.category),
            address: clean(it.roadAddress) || clean(it.address),
            jibun: clean(it.address),
            lng: Number(it.mapx) / 1e7,
            lat: Number(it.mapy) / 1e7,
        })).filter(it => isFinite(it.lat) && isFinite(it.lng) && it.lat && it.lng);

        res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
        return res.status(200).json({ items });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
