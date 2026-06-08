// 구내식당에 자주 나오는 메뉴 사전 (AI가 헷갈리는 이름을 정확히 읽도록 힌트로 제공)
const MENU_GLOSSARY = [
    '쌀밥', '잡곡밥', '흑미밥', '기장밥', '콩나물밥', '김치볶음밥', '카레라이스', '오므라이스',
    '김치찌개', '된장찌개', '부대찌개', '순두부찌개', '청국장', '미역국', '북엇국', '콩나물국', '소고기무국', '떡국', '만둣국', '육개장', '감자탕', '갈비탕', '설렁탕', '삼계탕',
    '제육볶음', '오징어볶음', '낙지볶음', '닭갈비', '돼지불고기', '소불고기', '닭볶음탕', '찜닭', '갈비찜', '코다리조림', '고등어조림', '갈치조림', '두부조림', '계란찜', '계란말이',
    '돈까스', '생선까스', '치킨까스', '탕수육', '깐풍기', '양념치킨', '간장치킨',
    '마늘쫑볶음', '멸치볶음', '어묵볶음', '진미채볶음', '오징어채볶음', '감자조림', '연근조림', '우엉조림', '미역줄기볶음', '햄마늘쫑볶음', '소시지야채볶음', '잡채', '비엔나볶음',
    '콩나물무침', '시금치나물', '고사리나물', '도라지무침', '깻잎무침', '무생채', '오이무침', '미나리무침', '파래무침', '취나물',
    '배추김치', '깍두기', '총각김치', '열무김치', '단무지', '쌈장', '쌈채소',
    '북엇국', '동태찌개', '꽁치김치조림', '제육덮밥', '비빔밥', '비빔국수', '잔치국수', '냉면', '콩국수', '쫄면', '우동', '라면', '떡볶이', '김밥', '유부초밥',
];

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
    "월": {"breakfast": "메뉴1 (300kcal, 탄45g, 단10g, 지8g)\\n메뉴2 (200kcal, 탄20g, 단12g, 지6g)", "lunch": "메뉴1 (550kcal, 탄70g, 단20g, 지18g)", "dinner": "메뉴1 (400kcal, 탄50g, 단15g, 지12g)"},
    "화": {"breakfast": "...", "lunch": "...", "dinner": "..."},
    "수": {"breakfast": "...", "lunch": "...", "dinner": "..."},
    "목": {"breakfast": "...", "lunch": "...", "dinner": "..."},
    "금": {"breakfast": "...", "lunch": "...", "dinner": "..."}
  }
}

정확도 규칙(매우 중요):
- 메뉴 이름은 이미지에 **실제로 적힌 글자 그대로** 옮기세요. 한 글자도 바꾸지 말고, 비슷한 다른 음식으로 바꾸거나 추측해서 지어내지 마세요. (이름 정확도가 가장 중요합니다)
- 글자가 흐리거나 일부만 보이면, 보이는 글자 그대로 최대한 옮기고 절대 다른 메뉴로 대체하지 마세요. 도저히 못 읽으면 그 항목은 생략하세요(없는 메뉴를 만들어내지 말 것).
- 띄어쓰기·받침까지 이미지와 똑같이 옮기세요.
- 표의 칸(요일×끼니) 위치를 정확히 맞춰 엉뚱한 칸에 넣지 마세요.
- 한 칸에 여러 메뉴가 있으면 각 메뉴를 줄바꿈(\\n)으로 구분하세요.
- weekStart는 해당 주 월요일. 이미지에 날짜가 있으면 그대로, 없으면 위에서 지정한 값을 사용.
- 각 메뉴 뒤에 1인분 영양 정보를 "(칼로리kcal, 탄N g, 단N g, 지N g)" 형식으로 붙이세요. 예: "제육볶음 (520kcal, 탄25g, 단30g, 지28g)". 탄=탄수화물, 단=단백질, 지=지방(그램).
- 영양 값은 누군가 너에게 "이 음식 1인분 칼로리와 영양성분 알려줘"라고 직접 물었을 때 답하는 것과 동일하게, **네가 알고 있는 해당 음식의 일반적인 1인분 표준 영양값**을 제시하세요. 대충 아무 숫자나 넣지 말고, 그 음식에 맞는 합리적이고 일관된 값을 답하세요. (예: 흰쌀밥 1공기 ≈ 300kcal·탄65g·단6g·지1g 수준)
- 단, **메뉴 이름 자체는 절대 영양값 때문에 바꾸지 마세요.** 영양 정보는 항상 메뉴 이름 뒤 괄호 안에만 적으세요.
- 토/일이 있으면 "토","일" 키도 추가. 없는 끼니는 빈 문자열("").

참고용 메뉴 사전(한국 구내식당에 자주 나오는 메뉴입니다. 이미지의 글자가 아래 메뉴와 거의 같아 보이면, 오타 없이 아래의 정확한 이름으로 적으세요. 단, 이미지에 분명히 다른 메뉴가 적혀 있으면 사전을 무시하고 보이는 그대로 적으세요):
${MENU_GLOSSARY.join(', ')}`;

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
                max_tokens: 8000
            })
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            return res.status(response.status).json({
                error: err.error?.message || `OpenAI API error (${response.status})`
            });
        }

        const data = await response.json();
        let result = data.choices[0].message.content;

        // 자주 틀리는 글자 교정 사전 (왼쪽처럼 잘못 읽으면 오른쪽으로 바꿈)
        // 새로 발견되는 오인식은 여기에 계속 추가하면 됨
        const CORRECTIONS = {
            '마늘쪽볶음': '마늘쫑볶음',
            '마늘총볶음': '마늘쫑볶음',
            '햄마늘쪽볶음': '햄마늘쫑볶음',
            '햄마늘총볶음': '햄마늘쫑볶음',
            '진미채복음': '진미채볶음',
            '제육복음': '제육볶음',
            '계란마리': '계란말이',
        };
        for (const [wrong, right] of Object.entries(CORRECTIONS)) {
            if (result.includes(wrong)) result = result.split(wrong).join(right);
        }

        return res.status(200).json({ result });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
