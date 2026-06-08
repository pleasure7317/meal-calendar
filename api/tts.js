// OpenAI TTS - 자연스러운 영어 발음 음성 생성
// GET(?text=)으로 호출하면 같은 문장은 CDN/브라우저 캐시(7일)되어 재호출·재과금 없음
export default async function handler(req, res) {
    if (req.method !== 'POST' && req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'OpenAI API key not configured' });
    }
    try {
        const text = req.method === 'GET' ? (req.query && req.query.text) : (req.body && req.body.text);
        if (!text || !text.trim()) {
            return res.status(400).json({ error: 'No text provided' });
        }
        const r = await fetch('https://api.openai.com/v1/audio/speech', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'tts-1',
                voice: 'nova',          // 학습용: 또렷하고 차분한 여성 음성
                input: text.slice(0, 300),
                response_format: 'mp3',
                speed: 0.9,             // 학습하기 좋게 살짝 천천히
            }),
        });
        if (!r.ok) {
            const err = await r.json().catch(() => ({}));
            return res.status(r.status).json({ error: err.error?.message || `TTS error (${r.status})` });
        }
        const buf = Buffer.from(await r.arrayBuffer());
        res.setHeader('Content-Type', 'audio/mpeg');
        // 같은 문장은 브라우저 7일 + CDN 30일 캐시 (재호출·재과금 없음)
        res.setHeader('Cache-Control', 'public, max-age=604800, s-maxage=2592000, stale-while-revalidate=604800');
        return res.status(200).send(buf);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
