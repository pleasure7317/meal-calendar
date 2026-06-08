// 네이버 날씨(홍천읍)를 그대로 가져와 시간별/현재 날씨 제공
const NAVER_RCODE = '01720250'; // 강원특별자치도 홍천군 홍천읍

// wetrTxt(날씨 텍스트) → 이모지
function wetrIcon(t) {
    if (!t) return '🌤️';
    if (t.includes('번개') || t.includes('뇌우')) return '⛈️';
    if (t.includes('소나기')) return '🌦️';
    if (t.includes('진눈깨비') || (t.includes('비') && t.includes('눈'))) return '🌨️';
    if (t.includes('눈')) return '❄️';
    if (t.includes('비')) return '🌧️';
    if (t.includes('흐림')) return '☁️';
    if (t.includes('구름조금') || t.includes('구름많음')) return '⛅';
    if (t.includes('맑음')) return '☀️';
    return '🌤️';
}

// 페이지 문자열에서 startKey 뒤의 균형 잡힌 JSON(객체/배열) 한 덩어리를 추출
function extractJson(str, startKey) {
    const k = str.indexOf(startKey);
    if (k < 0) return null;
    let i = k + startKey.length;
    while (i < str.length && str[i] !== '{' && str[i] !== '[') i++;
    if (i >= str.length) return null;
    const open = str[i], close = open === '{' ? '}' : ']';
    let depth = 0, inStr = false, esc = false;
    for (let j = i; j < str.length; j++) {
        const ch = str[j];
        if (inStr) {
            if (esc) esc = false;
            else if (ch === '\\') esc = true;
            else if (ch === '"') inStr = false;
        } else {
            if (ch === '"') inStr = true;
            else if (ch === open) depth++;
            else if (ch === close) { depth--; if (depth === 0) return str.slice(i, j + 1); }
        }
    }
    return null;
}

export default async function handler(req, res) {
    // KST 오늘 날짜
    const now = new Date(Date.now() + 9 * 3600 * 1000);
    const todayStr = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;

    try {
        const r = await fetch(`https://weather.naver.com/today/${NAVER_RCODE}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
                'Referer': 'https://weather.naver.com/',
                'Accept-Language': 'ko-KR,ko;q=0.9',
            },
        });
        const html = await r.text();

        // 현재 관측
        let current = null;
        const nowStr = extractJson(html, '"nowFcastInfo":');
        if (nowStr) {
            try {
                const n = JSON.parse(nowStr);
                if (n.tmpr != null) {
                    current = {
                        temp: Math.round(n.tmpr),
                        desc: n.wetrTxt || '',
                        icon: wetrIcon(n.wetrTxt),
                    };
                }
            } catch (e) { /* noop */ }
        }

        // 시간별 예보
        let hours = [];
        const listStr = extractJson(html, '"domesticWetrList":');
        if (listStr) {
            try {
                const list = JSON.parse(listStr);
                hours = list
                    .filter(it => it.aplYmd === todayStr && it.tmpr != null)
                    .map(it => ({
                        time: String(it.aplTm).padStart(2, '0') + '00',
                        temp: Math.round(it.tmpr),
                        pop: (it.rainProb == null || it.rainProb === '-') ? '0' : String(it.rainProb).replace('%', ''),
                        desc: it.wetrTxt || '',
                        icon: wetrIcon(it.wetrTxt),
                    }));
            } catch (e) { /* noop */ }
        }

        if (hours.length === 0 && !current) {
            return res.status(502).json({ error: '네이버 날씨 데이터를 파싱하지 못했어요' });
        }

        // 엣지 캐시 30분 + 만료 후에도 하루 동안 캐시본 즉시 응답하며 백그라운드 갱신
        // (크론이 30분마다 미리 데워둠 → 사실상 항상 즉시)
        res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=86400');
        return res.status(200).json({ date: todayStr, location: '홍천', source: 'naver', current, hours });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
