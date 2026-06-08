export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

    try {
        const { image, weekStart } = req.body;
        if (!image) {
            return res.status(400).json({ error: 'No image provided' });
        }

        const weekStartLine = weekStart
            ? `\n중요: 이 식단표가 속한 주의 월요일 날짜는 ${weekStart} 입니다. weekStart는 반드시 "${weekStart}"로 설정하세요. 이미지에 다른 날짜가 보여도 이 값을 우선합니다.\n`
            : '';

        const prompt = `이 이미지는 회사 식단표입니다. 이미지에서 각 요일별 조식, 중식, 석식 메뉴를 추출해주세요.
${weekStartLine}
반드시 아래 JSON 형식으로만 응답해주세요. 다른 텍스트 없이 JSON만 반환해주세요:
{
  "weekStart": "YYYY-MM-DD",
  "meals": {
    "월": {"breakfast": "메뉴1 (300kcal)\\n메뉴2 (200kcal)", "lunch": "메뉴1 (550kcal)\\n메뉴2 (80kcal)", "dinner": "메뉴1 (400kcal)"},
    "화": {"breakfast": "...", "lunch": "...", "dinner": "..."},
    "수": {"breakfast": "...", "lunch": "...", "dinner": "..."},
    "목": {"breakfast": "...", "lunch": "...", "dinner": "..."},
    "금": {"breakfast": "...", "lunch": "...", "dinner": "..."}
  }
}

주의사항:
- weekStart는 해당 주 월요일 날짜입니다. 이미지에 날짜가 있으면 그대로 사용하고, 없으면 오늘 날짜 기준 이번 주 월요일로 설정해주세요.
- 각 메뉴 항목은 줄바꿈(\\n)으로 구분해주세요.
- **중요: 각 메뉴 항목마다 1인분 예상 칼로리를 메뉴 이름 뒤에 "(숫자kcal)" 형식으로 붙여주세요.** 예: "김치찌개 (200kcal)", "쌀밥 (300kcal)". 모든 메뉴에 반드시 칼로리를 표기하세요.
- 토요일/일요일이 있으면 "토", "일" 키도 추가해주세요.
- 없는 식사(조식/중식/석식)는 빈 문자열("")로 설정해주세요.`;

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4o',
                messages: [{
                    role: 'user',
                    content: [
                        { type: 'text', text: prompt },
                        { type: 'image_url', image_url: { url: image } }
                    ]
                }],
                max_tokens: 2000
            })
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            return res.status(response.status).json({
                error: err.error?.message || `OpenAI API error (${response.status})`
            });
        }

        const data = await response.json();
        const result = data.choices[0].message.content;

        return res.status(200).json({ result });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
