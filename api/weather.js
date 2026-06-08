// 기상청 단기예보(getVilageFcst) - 홍천 시간별 날씨
export default async function handler(req, res) {
    const key = process.env.DATA_GO_KR_KEY;
    if (!key) {
        return res.status(500).json({ error: 'DATA_GO_KR_KEY not configured' });
    }

    // 홍천군 동네예보 격자 좌표
    const nx = 75, ny = 132;

    // KST 기준 현재 시각
    const now = new Date(Date.now() + 9 * 3600 * 1000);
    const Y = now.getUTCFullYear();
    const M = String(now.getUTCMonth() + 1).padStart(2, '0');
    const D = String(now.getUTCDate()).padStart(2, '0');
    const todayStr = `${Y}${M}${D}`;
    const hour = now.getUTCHours();
    const min = now.getUTCMinutes();

    // 단기예보 발표시각: 02,05,08,11,14,17,20,23시 (발표 후 약 10분 뒤 제공)
    const baseTimes = [23, 20, 17, 14, 11, 8, 5, 2];
    let baseHour = null;
    for (const t of baseTimes) {
        if (hour > t || (hour === t && min >= 10)) { baseHour = t; break; }
    }
    let baseDate = todayStr;
    if (baseHour === null) {
        // 02:10 이전이면 전날 23시 발표 사용
        const y = new Date(now.getTime() - 24 * 3600 * 1000);
        baseDate = `${y.getUTCFullYear()}${String(y.getUTCMonth() + 1).padStart(2, '0')}${String(y.getUTCDate()).padStart(2, '0')}`;
        baseHour = 23;
    }
    const baseTime = String(baseHour).padStart(2, '0') + '00';

    const url = `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst`
        + `?serviceKey=${encodeURIComponent(key)}`
        + `&pageNo=1&numOfRows=1000&dataType=JSON`
        + `&base_date=${baseDate}&base_time=${baseTime}&nx=${nx}&ny=${ny}`;

    try {
        const r = await fetch(url);
        const text = await r.text();
        let json;
        try { json = JSON.parse(text); }
        catch (e) {
            return res.status(502).json({ error: 'KMA API non-JSON response', detail: text.slice(0, 300) });
        }

        const header = json?.response?.header;
        if (header && header.resultCode !== '00') {
            return res.status(502).json({ error: `KMA: ${header.resultMsg} (${header.resultCode})` });
        }

        const items = json?.response?.body?.items?.item || [];

        // fcstTime 별로 묶기 (오늘 날짜만)
        const byTime = {};
        for (const it of items) {
            if (it.fcstDate !== todayStr) continue;
            const t = it.fcstTime;
            if (!byTime[t]) byTime[t] = {};
            byTime[t][it.category] = it.fcstValue;
        }

        const hours = Object.keys(byTime).sort().map(t => ({
            time: t,                                  // "HHMM"
            temp: byTime[t].TMP ?? null,              // 기온
            sky: byTime[t].SKY ?? null,               // 하늘상태
            pty: byTime[t].PTY ?? null,               // 강수형태
            pop: byTime[t].POP ?? null,               // 강수확률
            reh: byTime[t].REH ?? null,               // 습도
        }));

        return res.status(200).json({ date: todayStr, location: '홍천', hours });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
