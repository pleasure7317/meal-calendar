// OpenAI TTS - 자연스러운 영어 발음 음성 생성
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'OpenAI API key not configured' });
    }
    try {
        const { text } = req.body || {};
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
                voice: 'nova',          // 따뜻하고 자연스러운 여성 음성
                input: text.slice(0, 300),
                response_format: 'mp3',
                speed: 0.95,
            }),
        });
        if (!r.ok) {
            const err = await r.json().catch(() => ({}));
            return res.status(r.status).json({ error: err.error?.message || `TTS error (${r.status})` });
        }
        const buf = Buffer.from(await r.arrayBuffer());
        res.setHeader('Content-Type', 'audio/mpeg');
        // 같은 문장 반복 재생은 캐시로 빠르게
        res.setHeader('Cache-Control', 'public, max-age=604800, s-maxage=604800');
        return res.status(200).send(buf);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
