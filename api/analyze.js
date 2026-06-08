export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

    try {
        const { image, weekStart, draft } = req.body;
        if (!image) {
            return res.status(400).json({ error: 'No image provided' });
        }

        const weekStartLine = weekStart
            ? `\n중요: 이 식단표가 속한 주의 월요일 날짜는 ${weekStart} 입니다. weekStart는 반드시 "${weekStart}"로 설정하세요. 이미지에 다른 날짜가 보여도 이 값을 우선합니다.\n`
            : '';

        // 2차 검증 단계: 1차 결과(draft)를 이미지와 다시 대조해서 틀린 부분만 바로잡음
        const draftLine = draft
            ? `\n아래는 같은 식단표 이미지에서 1차로 추출한 결과입니다. 이미지를 다시 한 글자씩 대조하여, 잘못 읽었거나 엉뚱하게 바뀐 메뉴 이름·칸 위치를 바로잡아 최종 JSON으로 주세요. 이미 맞는 항목은 그대로 두세요. 이미지에 없는 메뉴를 새로 만들지 마세요.\n\n[1차 결과]\n${JSON.stringify(draft)}\n`
            : '';

        const prompt = `이 이미지는 회사 식단표입니다. 표에 적힌 글자를 정확히 읽어, 각 요일별 조식/중식/석식 메뉴를 추출하세요.
${weekStartLine}${draftLine}
반드시 아래 JSON 형식으로만 응답하세요:
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

정확도 규칙(매우 중요):
- 메뉴 이름은 이미지에 **실제로 적힌 글자 그대로** 옮기세요. 비슷한 다른 음식으로 바꾸거나 추측해서 지어내지 마세요.
- 글자가 흐리거나 일부만 보이면, 보이는 글자 그대로 최대한 옮기고 절대 다른 메뉴로 대체하지 마세요. 도저히 못 읽으면 그 항목은 생략하세요(없는 메뉴를 만들어내지 말 것).
- 표의 칸(요일×끼니) 위치를 정확히 맞춰 엉뚱한 칸에 넣지 마세요.
- 한 칸에 여러 메뉴가 있으면 각 메뉴를 줄바꿈(\\n)으로 구분하세요.
- weekStart는 해당 주 월요일. 이미지에 날짜가 있으면 그대로, 없으면 위에서 지정한 값을 사용.
- 칼로리는 추정값입니다. 각 메뉴 뒤에 "(숫자kcal)" 형식으로 1인분 예상 칼로리를 붙이세요. 단, **메뉴 이름 자체는 절대 칼로리 추정 때문에 바꾸지 마세요.**
- 토/일이 있으면 "토","일" 키도 추가. 없는 끼니는 빈 문자열("").`;

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4o',
                temperature: 0,
                response_format: { type: 'json_object' },
                messages: [
                    {
                        role: 'system',
                        content: '당신은 한국어 식단표 OCR 전문가입니다. 이미지에 적힌 글자를 한 글자도 바꾸지 않고 그대로 정확히 옮기는 것이 최우선입니다. 불확실하면 추측하지 말고 보이는 그대로만 옮기거나 생략합니다.'
                    },
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: prompt },
                            { type: 'image_url', image_url: { url: image, detail: 'high' } }
                        ]
                    }
                ],
                max_tokens: 3000
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
