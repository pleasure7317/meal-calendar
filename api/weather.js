// 기상청 단기예보 + 초단기실황 - 홍천 시간별 날씨
export default async function handler(req, res) {
    const key = process.env.DATA_GO_KR_KEY;
    if (!key) {
        return res.status(500).json({ error: 'DATA_GO_KR_KEY not configured' });
    }

    // 홍천군 동네예보 격자 좌표
    const nx = 75, ny = 132;
    const BASE = 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0';

    const fmtDate = (d) =>
        `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;

    // KST 기준 현재 시각
    const now = new Date(Date.now() + 9 * 3600 * 1000);
    const todayStr = fmtDate(now);
    const hour = now.getUTCHours();
    const min = now.getUTCMinutes();

    // --- 단기예보 발표시각: 02,05,08,11,14,17,20,23시 (발표 후 약 10분) ---
    const baseTimes = [23, 20, 17, 14, 11, 8, 5, 2];
    let baseHour = null;
    for (const t of baseTimes) {
        if (hour > t || (hour === t && min >= 10)) { baseHour = t; break; }
    }
    let fcstDate = todayStr;
    if (baseHour === null) {
        fcstDate = fmtDate(new Date(now.getTime() - 24 * 3600 * 1000));
        baseHour = 23;
    }
    const fcstBaseTime = String(baseHour).padStart(2, '0') + '00';
    const fcstUrl = `${BASE}/getVilageFcst?serviceKey=${encodeURIComponent(key)}`
        + `&pageNo=1&numOfRows=350&dataType=JSON`
        + `&base_date=${fcstDate}&base_time=${fcstBaseTime}&nx=${nx}&ny=${ny}`;

    // --- 초단기실황: 매시각 발표, 약 40분 뒤 제공 ---
    let nHour = hour, ncstDate = todayStr;
    if (min < 40) {
        nHour = hour - 1;
        if (nHour < 0) { nHour = 23; ncstDate = fmtDate(new Date(now.getTime() - 24 * 3600 * 1000)); }
    }
    const ncstUrl = `${BASE}/getUltraSrtNcst?serviceKey=${encodeURIComponent(key)}`
        + `&pageNo=1&numOfRows=60&dataType=JSON`
        + `&base_date=${ncstDate}&base_time=${String(nHour).padStart(2, '0')}00&nx=${nx}&ny=${ny}`;

    const getJson = async (u) => {
        const r = await fetch(u);
        const text = await r.text();
        return JSON.parse(text);
    };

    try {
        // 두 API 병렬 호출
        const [fcstJson, ncstJson] = await Promise.all([
            getJson(fcstUrl),
            getJson(ncstUrl).catch(() => null),
        ]);

        const header = fcstJson?.response?.header;
        if (header && header.resultCode !== '00') {
            return res.status(502).json({ error: `KMA: ${header.resultMsg} (${header.resultCode})` });
        }

        const items = fcstJson?.response?.body?.items?.item || [];
        const byTime = {};
        for (const it of items) {
            if (it.fcstDate !== todayStr) continue;
            const t = it.fcstTime;
            if (!byTime[t]) byTime[t] = {};
            byTime[t][it.category] = it.fcstValue;
        }
        const hours = Object.keys(byTime).sort().map(t => ({
            time: t,
            temp: byTime[t].TMP ?? null,
            sky: byTime[t].SKY ?? null,
            pty: byTime[t].PTY ?? null,
            pop: byTime[t].POP ?? null,
            reh: byTime[t].REH ?? null,
        }));

        // 초단기실황(실제 관측값)으로 "현재" 보정
        let current = null;
        const nItems = ncstJson?.response?.body?.items?.item || [];
        if (nItems.length) {
            const cur = {};
            for (const it of nItems) cur[it.category] = it.obsrValue;
            if (cur.T1H != null) {
                current = {
                    temp: cur.T1H,
                    pty: cur.PTY ?? '0',
                    reh: cur.REH ?? null,
                    rn1: cur.RN1 ?? null,
                };
            }
        }

        // Vercel CDN 캐시: 10분 캐시 + 30분 stale-while-revalidate
        res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1800');
        return res.status(200).json({ date: todayStr, location: '홍천', current, hours });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
