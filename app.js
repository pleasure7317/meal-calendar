// ==================== Supabase Init ====================
const SUPABASE_URL = 'https://kgwlzvmnvlzrpjatnfmt.supabase.co';
const SUPABASE_KEY = 'sb_publishable_rLsCWwHlvRDFLHa7xnV9ZQ_9HA834a-';
let sb = null;
try {
    if (window.supabase && window.supabase.createClient) {
        sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    } else {
        console.warn('Supabase 라이브러리가 로드되지 않았습니다. DB 없이 동작합니다.');
    }
} catch (e) {
    console.warn('Supabase 초기화 실패, DB 없이 동작합니다:', e);
}

// ==================== Emoji (Twemoji) ====================
// 로컬에 받아둔 Microsoft Fluent 3D 이모지 목록 (codepoint 키)
const FLUENT3D = new Set([
    '1f305','1f319','1f324','1f326','1f327','1f328','1f338','1f35a','1f373','1f37d',
    '1f389','1f3ac','1f3e8','1f446','1f495','1f497','1f4a7','1f4aa','1f4ca','1f4cc','1f4d2',
    '1f4d6','1f4d7','1f4f7','1f4f8','1f50d','1f525','1f5d1','1f60a','1f622','1f624',
    '1f50a','1f62e-200d-1f4a8','1f634','1f912','1f917','1f929','1f963','1f969','1f970',
    '1f97a','1f9c8','2600','2601','26a0','26c5','270f','2728','2744'
]);

let _emojiTimer = null;
let _emojiObserver = null;
function refreshEmoji() {
    if (!window.twemoji) return;
    // 너무 자주 호출되는 걸 방지하기 위해 약간 디바운스
    clearTimeout(_emojiTimer);
    _emojiTimer = setTimeout(() => {
        try {
            // 변환 중에는 옵저버를 잠시 꺼서 자기 자신이 만든 DOM 변경으로
            // 다시 변환이 트리거되는 무한 루프(깜빡임)를 방지
            if (_emojiObserver) _emojiObserver.disconnect();
            twemoji.parse(document.body, {
                callback: (icon) => {
                    // 받아둔 3D 이모지만 로컬 PNG로 변환, 나머지는 그대로 둠
                    // (외부 폴백 CDN을 쓰지 않아 깜빡임/로딩 문제 없음)
                    return FLUENT3D.has(icon) ? `emoji/${icon}.png` : false;
                },
            });
        } catch (e) { /* noop */ } finally {
            if (_emojiObserver) {
                _emojiObserver.observe(document.body, { childList: true, subtree: true });
            }
        }
    }, 50);
}

// ==================== Data Store ====================

// In-memory cache
let mealsCache = {};
let cacheLoaded = false;

async function loadMealsFromDB() {
    try {
        const { data, error } = await sb.from('meals').select('*');
        if (error) throw error;
        const result = {};
        for (const row of data) {
            result[row.date_key] = {
                breakfast: row.breakfast || '',
                lunch: row.lunch || '',
                dinner: row.dinner || '',
            };
        }
        mealsCache = result;
        cacheLoaded = true;
        return result;
    } catch (err) {
        console.error('DB load error:', err);
        return mealsCache;
    }
}

function loadMeals() {
    return mealsCache;
}

async function saveMealToDB(dateKey, meals) {
    try {
        const { error } = await sb.from('meals').upsert({
            date_key: dateKey,
            breakfast: meals.breakfast || '',
            lunch: meals.lunch || '',
            dinner: meals.dinner || '',
            updated_at: new Date().toISOString(),
        }, { onConflict: 'date_key' });
        if (error) throw error;
    } catch (err) {
        console.error('DB save error:', err);
    }
}

async function saveMeals(data) {
    mealsCache = data;
    const promises = [];
    for (const [dateKey, meals] of Object.entries(data)) {
        if (meals.breakfast || meals.lunch || meals.dinner) {
            promises.push(saveMealToDB(dateKey, meals));
        }
    }
    await Promise.all(promises);
}

async function saveMoodToDB(dateKey, mood) {
    try {
        await sb.from('moods').upsert({
            date_key: dateKey,
            mood: mood,
        }, { onConflict: 'date_key' });
    } catch (err) {
        console.error('Mood save error:', err);
    }
}

async function loadMoodFromDB(dateKey) {
    try {
        const { data, error } = await sb
            .from('moods')
            .select('mood')
            .eq('date_key', dateKey)
            .maybeSingle();
        if (error || !data) return null;
        return data.mood;
    } catch { return null; }
}

function getMealKey(date) {
    const d = new Date(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

// ==================== Calorie Database ====================
const calorieDB = {
    '쌀밥': 300, '잡곡밥': 310, '현미밥': 290, '밥': 300, '흑미밥': 300, '보리밥': 290,
    '김치찌개': 200, '된장찌개': 150, '순두부찌개': 180, '부대찌개': 400, '청국장': 200,
    '짜장면': 550, '짬뽕': 500, '볶음밥': 450, '비빔밥': 550, '카레': 500, '돈까스': 550,
    '제육볶음': 380, '불고기': 350, '갈비탕': 400, '삼겹살': 500, '소불고기': 380,
    '닭볶음탕': 350, '닭갈비': 400, '치킨': 600, '찜닭': 380,
    '고등어구이': 200, '갈치구이': 180, '생선까스': 350, '새우튀김': 300, '오징어볶음': 250,
    '계란찜': 120, '계란말이': 150, '두부조림': 130, '멸치볶음': 100, '김치': 30,
    '깍두기': 30, '나물': 50, '샐러드': 80, '과일': 80, '요거트': 100,
    '미역국': 80, '떡국': 400, '만두국': 380, '우동': 420, '라면': 500, '냉면': 450,
    '족발': 450, '보쌈': 400, '수육': 350, '떡볶이': 380, '순대': 300,
    '콩나물국': 60, '시금치나물': 40, '무생채': 30, '어묵': 120, '잡채': 200,
    '소시지': 150, '햄': 140, '스팸': 200, '피자': 600, '햄버거': 550,
    '토스트': 250, '빵': 200, '우유': 130, '주스': 100, '커피': 5, '수프': 150,
};

// 메뉴 항목에서 영양정보 파싱: { kcal, carbs, protein, fat }
function parseItemNutrition(item) {
    if (!item) return {};
    const num = (re) => { const m = item.match(re); return m ? parseInt(m[1], 10) : null; };
    return {
        kcal: num(/(\d+)\s*kcal/i),
        carbs: num(/탄[^\d]*(\d+)\s*g/),
        protein: num(/단[^\d]*(\d+)\s*g/),
        fat: num(/지[^\d]*(\d+)\s*g/),
    };
}

// 메뉴 이름만 (뒤쪽 괄호 영양정보 제거)
function itemName(item) {
    if (!item) return '';
    return item.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

// 탄·단·지방 한 줄 (값이 있을 때만)
function macrosLine(item) {
    const n = parseItemNutrition(item);
    const parts = [];
    if (n.carbs != null) parts.push(`탄 ${n.carbs}g`);
    if (n.protein != null) parts.push(`단 ${n.protein}g`);
    if (n.fat != null) parts.push(`지 ${n.fat}g`);
    return parts.join(' · ');
}

// 메뉴 한 개의 칼로리 추정 (숫자 반환, 없으면 null)
function itemCalorie(item) {
    if (!item) return null;
    // AI가 붙여준 칼로리 숫자가 있으면 그걸 우선 사용
    const m = item.match(/(\d+)\s*kcal/i);
    if (m) return parseInt(m[1], 10);
    const name = itemName(item);
    for (const [food, cal] of Object.entries(calorieDB)) {
        if (name.includes(food)) return cal;
    }
    return null;
}

// 메뉴 텍스트를 "이름 (NNNkcal)" 형태로 표시 (탄/단/지는 화면에 숨김 → 패널에서만 보임)
function withCalorie(item) {
    const name = itemName(item);
    const kcalM = item.match(/(\d+)\s*kcal/i);
    if (kcalM) {
        return `${name} <span class="item-cal">(${kcalM[1]}kcal)</span>`;
    }
    const cal = itemCalorie(item);
    return cal ? `${name} <span class="item-cal">(${cal}kcal)</span>` : name;
}

function estimateCalories(menuText) {
    if (!menuText) return null;
    let total = 0;
    let found = 0;
    let missing = 0;
    const items = menuText.split('\n').map(s => s.trim()).filter(Boolean);
    for (const item of items) {
        const cal = itemCalorie(item);
        if (cal != null) {
            total += cal;
            found++;
        } else {
            missing++;
        }
    }
    if (found === 0) {
        return items.length > 0 ? `약 ${items.length * 200}kcal (추정)` : null;
    }
    // 일부만 매칭된 경우엔 못 찾은 메뉴를 1개당 200kcal로 보정
    total += missing * 200;
    return missing > 0 ? `약 ${total}kcal (추정)` : `약 ${total}kcal`;
}

// ==================== Mood Section ====================
const moodMessages = {
    happy: '오늘도 행복한 하루 보내세요! 💕',
    love: '사랑이 가득한 하루가 될 거예요 💗',
    excited: '오늘 하루 신나게 즐겨봐요! ✨',
    sleepy: '졸린 날이지만 맛있는 밥 먹으면 힘이 날 거예요 🍚',
    tired: '수고했어요, 오늘도 잘하고 있어요 🌸',
    sad: '괜찮아요, 맛있는 거 먹으면 기분이 나아질 거예요 🤗',
    angry: '심호흡하고 맛있는 거 먹어요! 화이팅 💪',
    sick: '아프면 안 돼요... 따뜻한 거 먹고 푹 쉬어요 🥣',
};

document.querySelectorAll('.mood-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        const mood = btn.dataset.mood;
        const msg = document.getElementById('moodMessage');
        msg.textContent = moodMessages[mood];
        msg.classList.add('show');
        saveMoodToDB(getMealKey(new Date()), mood);
    });
});

async function restoreMood() {
    const todayKey = getMealKey(new Date());
    const mood = await loadMoodFromDB(todayKey);
    if (mood) {
        const btn = document.querySelector(`.mood-btn[data-mood="${mood}"]`);
        if (btn) {
            btn.classList.add('selected');
            const msg = document.getElementById('moodMessage');
            msg.textContent = moodMessages[mood];
            msg.classList.add('show');
        }
    }
}

// ==================== Today's Menu ====================
function updateTodayMenu() {
    const data = loadMeals();
    const todayKey = getMealKey(new Date());
    const today = data[todayKey];

    const types = [
        { key: 'breakfast', el: 'todayBreakfast' },
        { key: 'lunch', el: 'todayLunch' },
        { key: 'dinner', el: 'todayDinner' },
    ];

    types.forEach(({ key, el }) => {
        const container = document.getElementById(el);
        if (today && today[key]) {
            const items = today[key].split('\n').filter(Boolean);
            container.innerHTML = items.map(item =>
                `<div class="menu-item" onclick="openFoodSearch('${item.replace(/'/g, "\\'")}')">${withCalorie(item)}</div>`
            ).join('');
        } else {
            container.innerHTML = '<p class="no-meal">등록된 메뉴가 없어요</p>';
        }
    });
}


// ==================== Register Modal ====================
const registerOverlay = document.getElementById('registerOverlay');

document.getElementById('openRegister').addEventListener('click', () => {
    resetRegisterModal();
    registerOverlay.classList.add('show');
});

document.getElementById('registerClose').addEventListener('click', () => {
    registerOverlay.classList.remove('show');
});

registerOverlay.addEventListener('click', e => {
    if (e.target === e.currentTarget) registerOverlay.classList.remove('show');
});

function resetRegisterModal() {
    document.getElementById('uploadPreview').style.display = 'none';
    document.getElementById('uploadArea').style.display = '';
    document.getElementById('aiLoading').style.display = 'none';
    document.getElementById('analysisArea').style.display = 'none';
    document.getElementById('manualArea').style.display = 'none';
    document.getElementById('fileInput').value = '';
    currentImageBase64 = null;

    const today = new Date();
    const dayOfWeek = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7));
    document.getElementById('periodStart').value = getMealKey(monday);
    updatePeriodEnd();
    buildPeriodChips();
}

function updatePeriodEnd() {
    const start = document.getElementById('periodStart').value;
    if (start) {
        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        document.getElementById('periodEnd').value = getMealKey(end);
    }
}

document.getElementById('periodStart').addEventListener('change', () => {
    updatePeriodEnd();
});

function buildPeriodChips() {
    const chips = document.getElementById('periodChips');
    const today = new Date();
    const currentStart = document.getElementById('periodStart').value;
    chips.innerHTML = '';

    for (let i = -1; i <= 2; i++) {
        const d = new Date(today);
        const dayOfWeek = d.getDay();
        d.setDate(d.getDate() - ((dayOfWeek + 6) % 7) + (i * 7));
        const key = getMealKey(d);
        const endD = new Date(d);
        endD.setDate(endD.getDate() + 6);
        const label = i === 0 ? '이번 주' : i === -1 ? '지난 주' : i === 1 ? '다음 주' : `${d.getMonth()+1}/${d.getDate()}~`;

        const chip = document.createElement('button');
        chip.className = `period-chip${key === currentStart ? ' active' : ''}`;
        chip.textContent = label;
        chip.addEventListener('click', () => {
            document.getElementById('periodStart').value = key;
            updatePeriodEnd();
            chips.querySelectorAll('.period-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
        });
        chips.appendChild(chip);
    }
}

// ==================== AI Analysis ====================
const AI_PROMPT = `이 이미지는 회사 식단표입니다. 이미지에서 각 요일별 조식, 중식, 석식 메뉴를 추출해주세요.

반드시 아래 JSON 형식으로만 응답해주세요. 다른 텍스트 없이 JSON만 반환해주세요:
{
  "weekStart": "YYYY-MM-DD",
  "meals": {
    "월": {"breakfast": "메뉴1\\n메뉴2", "lunch": "메뉴1\\n메뉴2", "dinner": "메뉴1\\n메뉴2"},
    "화": {"breakfast": "...", "lunch": "...", "dinner": "..."},
    "수": {"breakfast": "...", "lunch": "...", "dinner": "..."},
    "목": {"breakfast": "...", "lunch": "...", "dinner": "..."},
    "금": {"breakfast": "...", "lunch": "...", "dinner": "..."}
  }
}

주의사항:
- weekStart는 해당 주 월요일 날짜입니다. 이미지에 날짜가 있으면 그대로 사용하고, 없으면 오늘 날짜 기준 이번 주 월요일로 설정해주세요.
- 각 메뉴 항목은 줄바꿈(\\n)으로 구분해주세요.
- 토요일/일요일이 있으면 "토", "일" 키도 추가해주세요.
- 없는 식사(조식/중식/석식)는 빈 문자열("")로 설정해주세요.`;

async function analyzeWithServer(base64Image, weekStart, draft) {
    const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64Image, weekStart, draft })
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `서버 오류 (${response.status})`);
    }
    const data = await response.json();
    if (!data.result) throw new Error('AI 응답이 비어 있어요. 다시 시도해 주세요');
    return data.result;
}

function parseAIResponse(responseText) {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('AI 응답 형식 오류 (다시 시도해 주세요)');
    try {
        return JSON.parse(jsonMatch[0]);
    } catch (e) {
        throw new Error('AI 응답이 중간에 끊겼어요. 사진을 더 선명하게/작게 해서 다시 시도해 주세요');
    }
}

function fillAnalysisForm(parsed) {
    const dayMap = { '월': 0, '화': 1, '수': 2, '목': 3, '금': 4, '토': 5, '일': 6 };
    const area = document.getElementById('analysisArea');
    area.style.display = '';

    // 사용자가 직접 고른 기간을 항상 우선. AI가 추측한 weekStart로 덮어쓰지 않음.
    updatePeriodEnd();

    buildWeekGrid('analysisWeekGrid');

    const grid = document.getElementById('analysisWeekGrid');
    if (parsed.meals) {
        for (const [dayName, meals] of Object.entries(parsed.meals)) {
            const dayIndex = dayMap[dayName];
            if (dayIndex === undefined) continue;
            for (const [type, menu] of Object.entries(meals)) {
                const ta = grid.querySelector(`textarea[data-day="${dayIndex}"][data-type="${type}"]`);
                if (ta && menu) ta.value = menu;
            }
        }
    }
}

// ==================== File Upload ====================
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const uploadPreview = document.getElementById('uploadPreview');
const previewImg = document.getElementById('previewImg');
let currentImageBase64 = null;

uploadArea.addEventListener('click', () => fileInput.click());
uploadArea.addEventListener('dragover', e => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
});
uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
uploadArea.addEventListener('drop', e => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', e => {
    if (e.target.files.length) handleFile(e.target.files[0]);
});

document.getElementById('removeImg').addEventListener('click', () => {
    uploadPreview.style.display = 'none';
    uploadArea.style.display = '';
    document.getElementById('analysisArea').style.display = 'none';
    document.getElementById('aiLoading').style.display = 'none';
    fileInput.value = '';
    currentImageBase64 = null;
});

function handleFile(file) {
    if (!file.type.startsWith('image/')) {
        showToast('이미지 파일만 업로드할 수 있어요!');
        return;
    }
    const showPreview = (dataUrl) => {
        currentImageBase64 = dataUrl;
        previewImg.src = dataUrl;
        uploadPreview.style.display = '';
        uploadArea.style.display = 'none';
    };
    const reader = new FileReader();
    reader.onload = e => {
        const original = e.target.result;
        // 큰 사진은 최대 2000px로 줄여서 전송 (용량 초과 방지 + 속도↑, 글자 선명도 유지)
        const img = new Image();
        img.onload = () => {
            try {
                const maxDim = 2000;
                let { width, height } = img;
                if (Math.max(width, height) > maxDim) {
                    const scale = maxDim / Math.max(width, height);
                    width = Math.round(width * scale);
                    height = Math.round(height * scale);
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                showPreview(canvas.toDataURL('image/jpeg', 0.9));
            } catch (err) {
                showPreview(original); // 변환 실패 시 원본 사용
            }
        };
        img.onerror = () => showPreview(original);
        img.src = original;
    };
    reader.readAsDataURL(file);
}

function setAILoadingText(t) {
    const el = document.getElementById('aiLoadingText');
    if (el) el.textContent = t;
}

// ===== 화면 꺼짐 방지 (Screen Wake Lock) =====
let _wakeLock = null;
let _wakeWanted = false;
async function acquireWakeLock() {
    _wakeWanted = true;
    try {
        if ('wakeLock' in navigator) {
            _wakeLock = await navigator.wakeLock.request('screen');
            _wakeLock.addEventListener('release', () => { _wakeLock = null; });
        }
    } catch (e) { /* 지원 안 하거나 거부됨 → 무시 */ }
}
async function releaseWakeLock() {
    _wakeWanted = false;
    try { if (_wakeLock) await _wakeLock.release(); } catch (e) { /* noop */ }
    _wakeLock = null;
}
// 분석 중 화면을 잠깐 가렸다 다시 켜면 wake lock이 풀리므로 재요청
document.addEventListener('visibilitychange', () => {
    if (_wakeWanted && !_wakeLock && document.visibilityState === 'visible') {
        acquireWakeLock();
    }
});

async function runAIAnalysis() {
    const loading = document.getElementById('aiLoading');
    loading.style.display = '';
    document.getElementById('analysisArea').style.display = 'none';
    acquireWakeLock(); // 분석 동안 화면 꺼짐 방지

    try {
        const weekStart = document.getElementById('periodStart').value;

        // 1차: 사진에서 메뉴 추출
        setAILoadingText('1차 분석 중이에요… 식단표를 또박또박 읽고 있어요 👀');
        const firstText = await analyzeWithServer(currentImageBase64, weekStart);
        const firstParsed = parseAIResponse(firstText);

        // 2차: 1차 결과를 이미지와 다시 대조해서 검증·보정
        let finalParsed = firstParsed;
        try {
            setAILoadingText('2차 검증 중이에요… 더 자세하게 한 번 더 확인하고 있어요 🔍');
            const secondText = await analyzeWithServer(currentImageBase64, weekStart, firstParsed);
            finalParsed = parseAIResponse(secondText);
        } catch (e) {
            // 검증 단계가 실패해도 1차 결과로 진행
            console.warn('2차 검증 실패, 1차 결과 사용:', e);
        }

        fillAnalysisForm(finalParsed);
        showToast('AI 분석 완료! 결과를 확인해주세요 🎉');
    } catch (err) {
        console.error('AI Analysis Error:', err);
        showToast(`분석 실패: ${err.message}`);
        showManualForm();
    } finally {
        loading.style.display = 'none';
        setAILoadingText('AI가 식단표를 분석하고 있어요...');
        releaseWakeLock(); // 분석 끝나면 화면 잠금 정상화
    }
}

function showManualForm() {
    const manualArea = document.getElementById('manualArea');
    manualArea.style.display = '';
    buildWeekGrid('weekInputGrid');
}

// ==================== Manual Input ====================
document.getElementById('manualToggle').addEventListener('click', () => {
    const manualArea = document.getElementById('manualArea');
    const isHidden = manualArea.style.display === 'none';
    manualArea.style.display = isHidden ? '' : 'none';
    document.getElementById('analysisArea').style.display = 'none';
    if (isHidden) buildWeekGrid('weekInputGrid');
});

// ==================== Submit (달력에 넣기) ====================
document.getElementById('btnSubmitMeal').addEventListener('click', async () => {
    const analysisArea = document.getElementById('analysisArea');
    const manualArea = document.getElementById('manualArea');

    if (analysisArea.style.display !== 'none') {
        await saveWeekFromGrid('analysisWeekGrid');
    } else if (manualArea.style.display !== 'none') {
        await saveWeekFromGrid('weekInputGrid');
    } else if (currentImageBase64) {
        await runAIAnalysis();
        return;
    } else {
        showToast('사진을 올리거나 직접 입력해주세요!');
        return;
    }
});

async function saveWeekFromGrid(gridId) {
    const startDate = document.getElementById('periodStart').value;
    if (!startDate) {
        showToast('기간을 선택해주세요!');
        return;
    }
    const data = loadMeals();
    const grid = document.getElementById(gridId);
    const textareas = grid.querySelectorAll('textarea');

    textareas.forEach(ta => {
        const dayOffset = parseInt(ta.dataset.day);
        const type = ta.dataset.type;
        const date = new Date(startDate);
        date.setDate(date.getDate() + dayOffset);
        const key = getMealKey(date);

        if (!data[key]) data[key] = {};
        data[key][type] = ta.value.trim();
    });

    showToast('저장 중...');
    await saveMeals(data);
    updateTodayMenu();
    renderCalendar();
    registerOverlay.classList.remove('show');
    showToast('식단이 달력에 저장되었어요! 🎉');
}

// ==================== Reset Modal ====================
const resetOverlay = document.getElementById('resetOverlay');

document.getElementById('openReset').addEventListener('click', () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    document.getElementById('resetStart').value = getMealKey(monday);
    document.getElementById('resetEnd').value = getMealKey(sunday);
    resetOverlay.classList.add('show');
});

document.getElementById('resetClose').addEventListener('click', () => {
    resetOverlay.classList.remove('show');
});

resetOverlay.addEventListener('click', e => {
    if (e.target === e.currentTarget) resetOverlay.classList.remove('show');
});

async function deleteMealsRange(startKey, endKey) {
    try {
        if (sb) {
            const { error } = await sb.from('meals').delete()
                .gte('date_key', startKey).lte('date_key', endKey);
            if (error) throw error;
        }
    } catch (err) {
        console.error('DB delete error:', err);
    }
    for (const key of Object.keys(mealsCache)) {
        if (key >= startKey && key <= endKey) delete mealsCache[key];
    }
}

async function deleteAllMeals() {
    try {
        if (sb) {
            const { error } = await sb.from('meals').delete().gte('id', 0);
            if (error) throw error;
        }
    } catch (err) {
        console.error('DB delete-all error:', err);
    }
    mealsCache = {};
}

document.getElementById('btnDeleteRange').addEventListener('click', async () => {
    const start = document.getElementById('resetStart').value;
    const end = document.getElementById('resetEnd').value;
    if (!start || !end) { showToast('기간을 선택해주세요!'); return; }
    if (start > end) { showToast('시작일이 종료일보다 늦어요!'); return; }
    if (!confirm(`${start} ~ ${end} 기간의 식단을 삭제할까요?`)) return;
    showToast('삭제 중...');
    await deleteMealsRange(start, end);
    updateTodayMenu();
    renderCalendar();
    resetOverlay.classList.remove('show');
    showToast('선택한 기간의 식단을 삭제했어요! 🗑️');
});

document.getElementById('btnDeleteAll').addEventListener('click', async () => {
    if (!confirm('정말 모든 식단을 삭제할까요? 되돌릴 수 없어요!')) return;
    showToast('삭제 중...');
    await deleteAllMeals();
    updateTodayMenu();
    renderCalendar();
    resetOverlay.classList.remove('show');
    showToast('모든 식단을 삭제했어요! 🗑️');
});

const dayNames = ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'];

function buildWeekGrid(gridId) {
    const grid = document.getElementById(gridId);
    const startDate = document.getElementById('periodStart').value;
    const data = loadMeals();

    grid.innerHTML = '';
    for (let i = 0; i < 7; i++) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + i);
        const key = getMealKey(date);
        const existing = data[key] || {};

        const group = document.createElement('div');
        group.className = 'day-input-group';
        group.innerHTML = `
            <h4>${dayNames[i]} (${date.getMonth() + 1}/${date.getDate()})</h4>
            <div class="meal-inputs">
                <div class="meal-input-wrap">
                    <label>🌅 조식 <span class="cal-badge" data-cal="breakfast">${estimateCalories(existing.breakfast) || ''}</span></label>
                    <textarea data-day="${i}" data-type="breakfast" placeholder="메뉴를 입력해주세요&#10;(줄바꿈으로 구분)">${existing.breakfast || ''}</textarea>
                </div>
                <div class="meal-input-wrap">
                    <label>☀️ 중식 <span class="cal-badge" data-cal="lunch">${estimateCalories(existing.lunch) || ''}</span></label>
                    <textarea data-day="${i}" data-type="lunch" placeholder="메뉴를 입력해주세요&#10;(줄바꿈으로 구분)">${existing.lunch || ''}</textarea>
                </div>
                <div class="meal-input-wrap">
                    <label>🌙 석식 <span class="cal-badge" data-cal="dinner">${estimateCalories(existing.dinner) || ''}</span></label>
                    <textarea data-day="${i}" data-type="dinner" placeholder="메뉴를 입력해주세요&#10;(줄바꿈으로 구분)">${existing.dinner || ''}</textarea>
                </div>
            </div>
        `;
        // 입력하면 칼로리 실시간 표시
        group.querySelectorAll('textarea').forEach(ta => {
            const badge = group.querySelector(`.cal-badge[data-cal="${ta.dataset.type}"]`);
            ta.addEventListener('input', () => {
                badge.textContent = estimateCalories(ta.value) || '';
            });
        });
        grid.appendChild(group);
    }
}


// ==================== Calendar ====================
let currentYear, currentMonth;

function initCalendar() {
    const now = new Date();
    currentYear = now.getFullYear();
    currentMonth = now.getMonth();
    renderCalendar();
}

document.getElementById('prevMonth').addEventListener('click', () => {
    currentMonth--;
    if (currentMonth < 0) { currentMonth = 11; currentYear--; }
    renderCalendar();
});

document.getElementById('nextMonth').addEventListener('click', () => {
    currentMonth++;
    if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    renderCalendar();
});

function renderCalendar() {
    document.getElementById('calendarMonth').textContent =
        `${currentYear}년 ${currentMonth + 1}월`;

    const grid = document.getElementById('calendarGrid');
    grid.innerHTML = '';

    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const today = new Date();
    const todayKey = getMealKey(today);
    const data = loadMeals();

    for (let i = 0; i < firstDay; i++) {
        const empty = document.createElement('div');
        empty.className = 'calendar-day empty';
        grid.appendChild(empty);
    }

    for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(currentYear, currentMonth, d);
        const key = getMealKey(date);
        const dayOfWeek = date.getDay();
        const isToday = key === todayKey;
        const meals = data[key];

        const cell = document.createElement('div');
        cell.className = `calendar-day${isToday ? ' today' : ''}${dayOfWeek === 0 ? ' sun' : ''}${dayOfWeek === 6 ? ' sat' : ''}`;

        let mealsHtml = '';
        if (meals) {
            if (meals.breakfast) {
                mealsHtml += `<span class="day-meal-icon breakfast"><span class="dm-emoji">🌅</span><span class="dm-label">조식</span></span>`;
            }
            if (meals.lunch) {
                mealsHtml += `<span class="day-meal-icon lunch"><span class="dm-emoji">☀️</span><span class="dm-label">중식</span></span>`;
            }
            if (meals.dinner) {
                mealsHtml += `<span class="day-meal-icon dinner"><span class="dm-emoji">🌙</span><span class="dm-label">석식</span></span>`;
            }
        }

        cell.innerHTML = `
            <div class="day-number">${d}</div>
            <div class="day-meals">${mealsHtml}</div>
        `;

        cell.addEventListener('click', () => openDayModal(date, key));
        grid.appendChild(cell);
    }
}

// ==================== Day Modal ====================
let currentModalDate = null;
let currentModalKey = null;
let currentTab = 'breakfast';

function openDayModal(date, key, tab = 'breakfast') {
    currentModalDate = date;
    currentModalKey = key;
    const modal = document.getElementById('modalOverlay');
    const dateStr = `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 ${['일','월','화','수','목','금','토'][date.getDay()]}요일`;
    document.getElementById('modalDate').textContent = dateStr;

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    currentTab = tab;
    updateModalContent();
    modal.classList.add('show');
}

// 오늘의 메뉴 카드(조식/중식/석식) 클릭 → 해당 탭으로 상세 팝업
[['breakfast-card', 'breakfast'], ['lunch-card', 'lunch'], ['dinner-card', 'dinner']].forEach(([cls, tab]) => {
    const card = document.querySelector('.' + cls);
    if (card) {
        card.style.cursor = 'pointer';
        card.addEventListener('click', () => {
            const today = new Date();
            openDayModal(today, getMealKey(today), tab);
        });
    }
});

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentTab = btn.dataset.tab;
        updateModalContent();
    });
});

function updateModalContent() {
    const data = loadMeals();
    const meals = data[currentModalKey];
    const list = document.getElementById('modalMealList');
    const calorieEl = document.getElementById('calorieValue');

    if (meals && meals[currentTab]) {
        const items = meals[currentTab].split('\n').filter(Boolean);
        list.innerHTML = items.map(item => {
            const macros = macrosLine(item);
            return `<div class="modal-meal-item" onclick="openFoodSearch('${item.replace(/'/g, "\\'")}')">
                <div class="mmi-text">
                    <span class="mmi-name">${withCalorie(item)}</span>
                    ${macros ? `<span class="mmi-macros">${macros}</span>` : ''}
                </div>
                <span class="search-icon">🔍</span>
            </div>`;
        }).join('');
        const cal = estimateCalories(meals[currentTab]);
        calorieEl.textContent = cal || '정보 없음';
    } else {
        list.innerHTML = '<div class="no-meal-modal">등록된 메뉴가 없어요 😢</div>';
        calorieEl.textContent = '-';
    }
}

document.getElementById('modalClose').addEventListener('click', () => {
    document.getElementById('modalOverlay').classList.remove('show');
});

document.getElementById('modalOverlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) {
        document.getElementById('modalOverlay').classList.remove('show');
    }
});

// ==================== Food Search Panel ====================
function openFoodSearch(foodName) {
    // AI가 붙여준 영양정보(칼로리·탄·단·지) 추출
    const nut = parseItemNutrition(foodName);
    // 메뉴 이름만 (괄호 영양정보 제거)
    foodName = itemName(foodName);
    const panel = document.getElementById('foodPanelOverlay');
    document.getElementById('foodName').textContent = `🍳 ${foodName}`;

    const results = document.getElementById('foodSearchResults');
    const links = document.getElementById('foodLinks');

    // 칼로리: AI값 우선, 없으면 내장 DB
    let cal = nut.kcal;
    if (cal == null) {
        for (const [food, c] of Object.entries(calorieDB)) {
            if (foodName.includes(food)) { cal = c; break; }
        }
    }
    // 탄/단/지: AI값 우선, 없으면 칼로리에서 일반 비율로 추정
    const carbs = nut.carbs != null ? nut.carbs : (cal ? Math.round(cal * 0.5 / 4) : null);
    const protein = nut.protein != null ? nut.protein : (cal ? Math.round(cal * 0.25 / 4) : null);
    const fat = nut.fat != null ? nut.fat : (cal ? Math.round(cal * 0.25 / 9) : null);
    const g = (v) => (v != null ? v + 'g' : '-');

    results.innerHTML = `
        <div class="food-info-card">
            <h4>📊 영양 정보 (1인분 추정)</h4>
            <div class="nutrition-grid">
                <div class="nutrition-item">
                    <span class="nut-icon">🔥</span>
                    <span class="nut-label">칼로리</span>
                    <span class="nut-value">${cal ? cal + 'kcal' : '검색해보세요'}</span>
                </div>
                <div class="nutrition-item">
                    <span class="nut-icon">🍚</span>
                    <span class="nut-label">탄수화물</span>
                    <span class="nut-value">${g(carbs)}</span>
                </div>
                <div class="nutrition-item">
                    <span class="nut-icon">🥩</span>
                    <span class="nut-label">단백질</span>
                    <span class="nut-value">${g(protein)}</span>
                </div>
                <div class="nutrition-item">
                    <span class="nut-icon">🧈</span>
                    <span class="nut-label">지방</span>
                    <span class="nut-value">${g(fat)}</span>
                </div>
            </div>
        </div>
    `;

    const encodedName = encodeURIComponent(foodName);
    links.innerHTML = `
        <a href="https://search.naver.com/search.naver?query=${encodedName}+레시피" target="_blank" class="food-link">
            <span class="link-icon">📗</span> 네이버에서 레시피 검색
        </a>
        <a href="https://search.naver.com/search.naver?query=${encodedName}+칼로리" target="_blank" class="food-link">
            <span class="link-icon">🔥</span> 칼로리 정보 검색
        </a>
        <a href="https://search.naver.com/search.naver?query=${encodedName}+영양성분" target="_blank" class="food-link">
            <span class="link-icon">📊</span> 영양 성분 검색
        </a>
        <a href="https://www.google.com/search?q=${encodedName}+음식&tbm=isch" target="_blank" class="food-link">
            <span class="link-icon">📷</span> 음식 사진 보기
        </a>
        <a href="https://www.youtube.com/results?search_query=${encodedName}+만들기" target="_blank" class="food-link">
            <span class="link-icon">🎬</span> 유튜브 요리 영상
        </a>
    `;

    panel.classList.add('show');
}

document.getElementById('panelClose').addEventListener('click', () => {
    document.getElementById('foodPanelOverlay').classList.remove('show');
});

document.getElementById('foodPanelOverlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) {
        document.getElementById('foodPanelOverlay').classList.remove('show');
    }
});

// ==================== Toast ====================
function showToast(message) {
    let toast = document.querySelector('.toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.className = 'toast';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
}

// ==================== Init ====================
// ==================== 입사 D-day ====================
function updateDday() {
    const el = document.getElementById('ddayText');
    if (!el) return;
    // 입사일: 2026년 5월 7일 (당일을 D+1로 카운트)
    const start = new Date(2026, 4, 7);
    const now = new Date();
    const s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const n = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const days = Math.floor((n - s) / 86400000) + 1;
    el.textContent = `입사 D+${days}`;
}

// ==================== 오늘의 영어 구문 (호텔리어 표현) ====================
const ENGLISH_PHRASES = [
    { en: "How may I assist you today?", ko: "오늘 무엇을 도와드릴까요?" },
    { en: "Welcome to our hotel. May I have your name, please?", ko: "저희 호텔에 오신 것을 환영합니다. 성함을 말씀해 주시겠어요?" },
    { en: "May I have your reservation number, please?", ko: "예약 번호를 알려주시겠어요?" },
    { en: "Would you like a city view or an ocean view room?", ko: "시티뷰 객실과 오션뷰 객실 중 어느 것을 원하세요?" },
    { en: "Check-in is at 3 PM and check-out is at noon.", ko: "체크인은 오후 3시, 체크아웃은 정오입니다." },
    { en: "May I see your passport, please?", ko: "여권을 보여주시겠어요?" },
    { en: "Here is your key card. Your room is on the 7th floor.", ko: "여기 키카드입니다. 객실은 7층에 있습니다." },
    { en: "May I help you with your luggage?", ko: "짐을 들어드릴까요?" },
    { en: "Breakfast is served from 7 to 10 in the main restaurant.", ko: "조식은 메인 레스토랑에서 7시부터 10시까지 제공됩니다." },
    { en: "Is there anything else I can help you with?", ko: "그 밖에 도와드릴 일이 있을까요?" },
    { en: "I'm terribly sorry for the inconvenience.", ko: "불편을 드려 대단히 죄송합니다." },
    { en: "Let me check that for you right away.", ko: "바로 확인해 드리겠습니다." },
    { en: "Your room will be ready shortly.", ko: "객실이 곧 준비될 예정입니다." },
    { en: "Would you like a wake-up call in the morning?", ko: "아침에 모닝콜을 원하시나요?" },
    { en: "How was your stay with us?", ko: "저희 호텔에서의 숙박은 어떠셨나요?" },
    { en: "Please let me know if you need extra towels.", ko: "수건이 더 필요하시면 말씀해 주세요." },
    { en: "The Wi-Fi password is on the back of your key card.", ko: "와이파이 비밀번호는 키카드 뒷면에 있습니다." },
    { en: "May I upgrade you to a suite?", ko: "스위트룸으로 업그레이드해 드려도 될까요?" },
    { en: "Would you prefer a smoking or non-smoking room?", ko: "흡연 객실과 금연 객실 중 어느 것을 원하세요?" },
    { en: "I'll arrange a taxi for you.", ko: "택시를 준비해 드리겠습니다." },
    { en: "Enjoy your stay with us!", ko: "즐거운 시간 보내세요!" },
    { en: "Could you please fill out this form?", ko: "이 양식을 작성해 주시겠어요?" },
    { en: "How many nights will you be staying?", ko: "며칠 밤 묵으실 예정인가요?" },
    { en: "Complimentary breakfast is included in your stay.", ko: "조식이 무료로 포함되어 있습니다." },
    { en: "Allow me to show you to your room.", ko: "객실로 안내해 드리겠습니다." },
    { en: "Would you like to leave your luggage with us?", ko: "짐을 저희에게 맡기시겠어요?" },
    { en: "I'll send someone up to your room right away.", ko: "바로 객실로 직원을 보내드리겠습니다." },
    { en: "Your total comes to 150 dollars.", ko: "총 금액은 150달러입니다." },
    { en: "How would you like to pay?", ko: "어떻게 결제하시겠어요?" },
    { en: "Could I have your signature here, please?", ko: "여기에 서명해 주시겠어요?" },
    { en: "The pool is open from 6 AM to 10 PM.", ko: "수영장은 오전 6시부터 오후 10시까지 운영합니다." },
    { en: "I do apologize for the wait.", ko: "기다리게 해 드려 죄송합니다." },
    { en: "We hope to see you again soon.", ko: "다시 뵙기를 바랍니다." },
    { en: "Would you like a late check-out?", ko: "레이트 체크아웃을 원하시나요?" },
    { en: "Please don't hesitate to call the front desk.", ko: "언제든 편하게 프런트로 전화 주세요." },
    { en: "Your room has been upgraded free of charge.", ko: "객실이 무료로 업그레이드되었습니다." },
    { en: "Can I get you anything from the bar?", ko: "바에서 뭐 좀 가져다 드릴까요?" },
    { en: "Let me write that down for you.", ko: "제가 적어드리겠습니다." },
    { en: "The elevators are just around the corner.", ko: "엘리베이터는 모퉁이를 돌면 바로 있습니다." },
    { en: "Thank you for choosing our hotel.", ko: "저희 호텔을 선택해 주셔서 감사합니다." },
    { en: "Would you like help making a dinner reservation?", ko: "저녁 식사 예약을 도와드릴까요?" },
    { en: "Let me transfer you to housekeeping.", ko: "하우스키핑으로 연결해 드리겠습니다." },
    { en: "Your luggage will be sent up to your room.", ko: "짐은 객실로 올려보내 드리겠습니다." },
    { en: "Would you care for some water while you wait?", ko: "기다리시는 동안 물 한 잔 드릴까요?" },
    { en: "I'm afraid we're fully booked tonight.", ko: "죄송하지만 오늘 밤은 만실입니다." },
    { en: "May I confirm your check-out date?", ko: "체크아웃 날짜를 확인해 드릴까요?" },
    { en: "The minibar items are charged to your room.", ko: "미니바 이용 요금은 객실로 청구됩니다." },
    { en: "Please tap your key card to enter the lounge.", ko: "라운지 입장 시 키카드를 태그해 주세요." },
    { en: "Shall I call housekeeping to clean your room now?", ko: "지금 객실 청소를 요청해 드릴까요?" },
    { en: "Your reservation is confirmed for two nights.", ko: "예약이 2박으로 확정되었습니다." },
    { en: "Is this your first time staying with us?", ko: "저희 호텔은 처음이신가요?" },
    { en: "We offer a complimentary airport shuttle service.", ko: "무료 공항 셔틀 서비스를 제공합니다." },
    { en: "I'll make a note of your request for a high floor.", ko: "고층 객실 요청을 기록해 두겠습니다." },
    { en: "Would you like your receipt emailed to you?", ko: "영수증을 이메일로 보내드릴까요?" },
    { en: "Allow me to escort you to the elevator.", ko: "엘리베이터까지 안내해 드리겠습니다." },
    { en: "Breakfast can be delivered to your room.", ko: "조식을 객실로 가져다 드릴 수 있습니다." },
    { en: "Please let us know your estimated arrival time.", ko: "도착 예정 시간을 알려주세요." },
    { en: "It's been a pleasure serving you.", ko: "모시게 되어 영광이었습니다." },
    { en: "Would you like me to call a doctor?", ko: "의사를 불러드릴까요?" },

    // 인사 · 응대
    { en: "Good morning, and welcome to our hotel.", ko: "좋은 아침입니다, 저희 호텔에 오신 것을 환영합니다." },
    { en: "Good evening. How can I help you?", ko: "안녕하세요(저녁 인사). 무엇을 도와드릴까요?" },
    { en: "It's a pleasure to have you with us.", ko: "모시게 되어 기쁩니다." },
    { en: "My name is Mina, and I'll be assisting you today.", ko: "제 이름은 미나이며, 오늘 도와드리겠습니다." },
    { en: "Please, take your time.", ko: "천천히 하셔도 됩니다." },
    { en: "Of course, right away.", ko: "물론입니다, 바로 해드리겠습니다." },
    { en: "I'd be happy to help with that.", ko: "기꺼이 도와드리겠습니다." },
    { en: "Certainly, sir.", ko: "네, 알겠습니다 (남성 손님께)." },
    { en: "Certainly, ma'am.", ko: "네, 알겠습니다 (여성 손님께)." },
    { en: "One moment, please.", ko: "잠시만 기다려 주세요." },
    { en: "Thank you for your patience.", ko: "기다려 주셔서 감사합니다." },
    { en: "Is everything to your satisfaction?", ko: "모든 것이 만족스러우신가요?" },
    { en: "Please feel free to ask me anything.", ko: "무엇이든 편하게 물어보세요." },
    { en: "I'll be right with you.", ko: "곧 도와드리겠습니다." },
    { en: "How may I direct your call?", ko: "어디로 연결해 드릴까요?" },

    // 예약
    { en: "Would you like to make a reservation?", ko: "예약을 하시겠어요?" },
    { en: "For what dates would you like to book?", ko: "어떤 날짜로 예약하시겠어요?" },
    { en: "How many guests will be staying?", ko: "몇 분이 묵으실 예정인가요?" },
    { en: "Would you like a single or a double room?", ko: "싱글룸과 더블룸 중 어느 것을 원하세요?" },
    { en: "Would you prefer a twin or a king bed?", ko: "트윈 침대와 킹 침대 중 어느 것을 원하세요?" },
    { en: "I'm afraid that room type is unavailable on those dates.", ko: "죄송하지만 그 날짜엔 해당 객실이 없습니다." },
    { en: "May I suggest a deluxe room instead?", ko: "대신 디럭스룸을 추천해 드려도 될까요?" },
    { en: "The rate is 120 dollars per night, including tax.", ko: "요금은 세금 포함 1박당 120달러입니다." },
    { en: "Would you like to guarantee the booking with a credit card?", ko: "신용카드로 예약을 보증하시겠어요?" },
    { en: "Your booking reference is A-1-2-3.", ko: "예약 번호는 A123입니다." },
    { en: "May I have a phone number to confirm the reservation?", ko: "예약 확인을 위해 전화번호를 알려주시겠어요?" },
    { en: "Cancellations are free up to 24 hours before arrival.", ko: "도착 24시간 전까지는 무료 취소가 가능합니다." },
    { en: "Would you like me to email you the confirmation?", ko: "예약 확인서를 이메일로 보내드릴까요?" },
    { en: "We've upgraded your booking at no extra cost.", ko: "추가 비용 없이 예약을 업그레이드해 드렸습니다." },
    { en: "Shall I add breakfast to your reservation?", ko: "예약에 조식을 추가해 드릴까요?" },

    // 체크인
    { en: "Are you checking in today?", ko: "오늘 체크인하시나요?" },
    { en: "Do you have a reservation with us?", ko: "저희 호텔에 예약하셨나요?" },
    { en: "May I have your name and reservation number?", ko: "성함과 예약 번호를 알려주시겠어요?" },
    { en: "I have your reservation right here.", ko: "예약 확인됐습니다." },
    { en: "Could you please fill out this registration card?", ko: "이 숙박 등록 카드를 작성해 주시겠어요?" },
    { en: "I'll need a credit card for incidentals.", ko: "부대 비용을 위해 신용카드가 필요합니다." },
    { en: "We'll place a small hold on your card as a deposit.", ko: "보증금으로 카드에 소액이 임시 승인됩니다." },
    { en: "Your room number is 1208.", ko: "객실 번호는 1208호입니다." },
    { en: "Here are two key cards for your room.", ko: "객실 키카드 두 장 여기 있습니다." },
    { en: "The elevators are to your right.", ko: "엘리베이터는 오른쪽에 있습니다." },
    { en: "Your room is ready now.", ko: "객실이 지금 준비되어 있습니다." },
    { en: "I'm sorry, your room isn't quite ready yet.", ko: "죄송하지만 객실이 아직 준비되지 않았습니다." },
    { en: "We can store your bags until check-in.", ko: "체크인 전까지 짐을 보관해 드릴 수 있습니다." },
    { en: "Would you like an early check-in?", ko: "얼리 체크인을 원하시나요?" },
    { en: "Please keep your key card away from your phone.", ko: "키카드를 휴대폰과 떨어뜨려 보관해 주세요." },

    // 객실 · 부대시설 안내
    { en: "Your room comes with a complimentary minibar.", ko: "객실에는 무료 미니바가 제공됩니다." },
    { en: "There's a safe inside the closet.", ko: "옷장 안에 금고가 있습니다." },
    { en: "The air conditioning can be adjusted by the bed.", ko: "에어컨은 침대 옆에서 조절하실 수 있습니다." },
    { en: "Extra blankets are in the wardrobe.", ko: "여분의 담요는 옷장 안에 있습니다." },
    { en: "The bathroom has both a shower and a bathtub.", ko: "욕실에는 샤워기와 욕조가 모두 있습니다." },
    { en: "Towels are by the sink.", ko: "수건은 세면대 옆에 있습니다." },
    { en: "Slippers and a bathrobe are provided.", ko: "슬리퍼와 가운이 제공됩니다." },
    { en: "The TV remote is on the nightstand.", ko: "TV 리모컨은 침대 옆 탁자에 있습니다." },
    { en: "Room service is available 24 hours a day.", ko: "룸서비스는 24시간 이용 가능합니다." },
    { en: "The gym is on the second floor.", ko: "헬스장은 2층에 있습니다." },
    { en: "The swimming pool is on the rooftop.", ko: "수영장은 옥상에 있습니다." },
    { en: "The spa is open until 9 PM.", ko: "스파는 오후 9시까지 운영합니다." },
    { en: "The business center is open around the clock.", ko: "비즈니스 센터는 24시간 운영합니다." },
    { en: "There's a laundry service available.", ko: "세탁 서비스를 이용하실 수 있습니다." },
    { en: "Parking is available in the basement.", ko: "주차는 지하에서 가능합니다." },
    { en: "The Wi-Fi is free throughout the hotel.", ko: "와이파이는 호텔 전역에서 무료입니다." },
    { en: "Power outlets are located beside the desk.", ko: "콘센트는 책상 옆에 있습니다." },
    { en: "The ice machine is at the end of the hallway.", ko: "제빙기는 복도 끝에 있습니다." },
    { en: "Vending machines are on every floor.", ko: "자판기는 각 층에 있습니다." },
    { en: "Checkout is express via the TV in your room.", ko: "객실 TV로 간편 체크아웃이 가능합니다." },

    // 하우스키핑
    { en: "Would you like your room cleaned now?", ko: "지금 객실 청소를 해드릴까요?" },
    { en: "What time would you like housekeeping to come?", ko: "객실 청소를 몇 시에 해드릴까요?" },
    { en: "I'll send fresh towels right away.", ko: "새 수건을 바로 보내드리겠습니다." },
    { en: "Would you like extra pillows?", ko: "베개를 더 드릴까요?" },
    { en: "We'll have that cleaned up for you immediately.", ko: "바로 치워드리겠습니다." },
    { en: "Please hang the sign if you don't wish to be disturbed.", ko: "방해받고 싶지 않으시면 안내판을 걸어주세요." },
    { en: "Turndown service is available in the evening.", ko: "저녁에 턴다운 서비스를 제공합니다." },
    { en: "Shall I replace the bed linens?", ko: "침구를 교체해 드릴까요?" },
    { en: "We'll restock the minibar this afternoon.", ko: "오늘 오후에 미니바를 채워드리겠습니다." },
    { en: "Is there anything you'd like us to bring up?", ko: "객실로 가져다 드릴 것이 있을까요?" },

    // 룸서비스 · 식음료
    { en: "Thank you for calling room service.", ko: "룸서비스입니다, 전화 주셔서 감사합니다." },
    { en: "May I take your order?", ko: "주문 도와드릴까요?" },
    { en: "Would you like anything to drink with that?", ko: "함께 드실 음료가 필요하신가요?" },
    { en: "How would you like your steak cooked?", ko: "스테이크는 어떻게 익혀드릴까요?" },
    { en: "Your order will be up in about 30 minutes.", ko: "주문하신 음식은 약 30분 후 올라갑니다." },
    { en: "Is there anything you're allergic to?", ko: "알레르기가 있으신 음식이 있나요?" },
    { en: "A service charge will be added to your bill.", ko: "봉사료가 청구서에 추가됩니다." },
    { en: "Enjoy your meal.", ko: "맛있게 드세요." },
    { en: "Would you like a table for how many?", ko: "몇 분 자리를 준비해 드릴까요?" },
    { en: "Do you have a reservation for the restaurant?", ko: "레스토랑 예약을 하셨나요?" },
    { en: "Right this way, please.", ko: "이쪽으로 오세요." },
    { en: "May I recommend today's special?", ko: "오늘의 특선을 추천해 드릴까요?" },
    { en: "Would you like still or sparkling water?", ko: "생수와 탄산수 중 어느 것을 드릴까요?" },
    { en: "Can I start you off with a drink?", ko: "먼저 음료부터 주문하시겠어요?" },
    { en: "Are you ready to order, or do you need a few more minutes?", ko: "주문하시겠어요, 아니면 조금 더 시간이 필요하신가요?" },
    { en: "I'll be your server this evening.", ko: "오늘 저녁 서빙을 맡은 직원입니다." },
    { en: "Would you care for any dessert?", ko: "디저트는 어떠세요?" },
    { en: "Can I get you anything else?", ko: "더 필요하신 것 있으세요?" },
    { en: "I'll bring the check right over.", ko: "계산서를 바로 가져다 드리겠습니다." },
    { en: "The breakfast buffet is just through there.", ko: "조식 뷔페는 저쪽으로 가시면 됩니다." },

    // 컨시어지 · 길 안내 · 관광
    { en: "How can I make your stay more enjoyable?", ko: "어떻게 하면 더 편안히 머무시게 해드릴까요?" },
    { en: "Would you like some recommendations for dinner?", ko: "저녁 식사 장소를 추천해 드릴까요?" },
    { en: "There's a lovely restaurant just down the street.", ko: "이 길 따라 내려가면 멋진 식당이 있습니다." },
    { en: "It's about a ten-minute walk from here.", ko: "여기서 걸어서 약 10분 거리입니다." },
    { en: "Would you like me to book a table for you?", ko: "자리를 예약해 드릴까요?" },
    { en: "The nearest subway station is two blocks away.", ko: "가장 가까운 지하철역은 두 블록 거리입니다." },
    { en: "I can arrange a city tour for you.", ko: "시티 투어를 준비해 드릴 수 있습니다." },
    { en: "Here's a map of the area.", ko: "이 지역 지도입니다." },
    { en: "The museum opens at nine in the morning.", ko: "박물관은 오전 9시에 문을 엽니다." },
    { en: "Would you like tickets for the show?", ko: "공연 티켓을 원하시나요?" },
    { en: "Let me write down the address for you.", ko: "주소를 적어드리겠습니다." },
    { en: "I'd recommend visiting in the early morning to avoid crowds.", ko: "사람이 적은 이른 아침에 가시길 추천합니다." },
    { en: "The shopping district is a short taxi ride away.", ko: "쇼핑 거리는 택시로 금방 갈 수 있습니다." },
    { en: "Would you like an umbrella? It looks like rain.", ko: "우산 드릴까요? 비가 올 것 같아요." },
    { en: "Please don't hesitate to ask if you get lost.", ko: "길을 잃으시면 언제든 물어보세요." },

    // 컴플레인 · 사과
    { en: "I'm very sorry to hear that.", ko: "그런 일이 있으셨다니 정말 죄송합니다." },
    { en: "I completely understand your frustration.", ko: "불편하신 마음 충분히 이해합니다." },
    { en: "Let me look into this for you immediately.", ko: "바로 알아보겠습니다." },
    { en: "I'll have someone fix it right away.", ko: "바로 직원을 보내 고쳐드리겠습니다." },
    { en: "Please accept my sincere apologies.", ko: "진심으로 사과드립니다." },
    { en: "We'll make this right for you.", ko: "바로잡아 드리겠습니다." },
    { en: "As a gesture of goodwill, breakfast is on us.", ko: "사과의 의미로 조식을 무료로 제공해 드리겠습니다." },
    { en: "May I offer you a different room?", ko: "다른 객실을 안내해 드려도 될까요?" },
    { en: "Thank you for bringing this to our attention.", ko: "알려주셔서 감사합니다." },
    { en: "I'll speak with my manager about this.", ko: "이 부분은 매니저와 상의하겠습니다." },
    { en: "Is there anything I can do to make it up to you?", ko: "보상해 드릴 방법이 있을까요?" },
    { en: "We value your feedback greatly.", ko: "소중한 의견 감사드립니다." },
    { en: "I apologize for the noise; I'll handle it.", ko: "소음에 대해 사과드리며, 제가 처리하겠습니다." },
    { en: "Let me upgrade your room to make up for the trouble.", ko: "불편을 드린 점, 객실 업그레이드로 보상해 드리겠습니다." },
    { en: "We hope you'll give us another chance.", ko: "다시 한 번 기회를 주시길 바랍니다." },

    // 전화 · 메시지
    { en: "Thank you for calling the front desk.", ko: "프런트 데스크입니다, 전화 주셔서 감사합니다." },
    { en: "May I put you on hold for a moment?", ko: "잠시 대기시켜 드려도 될까요?" },
    { en: "I'll connect you to that room.", ko: "그 객실로 연결해 드리겠습니다." },
    { en: "I'm afraid the line is busy.", ko: "죄송하지만 통화 중입니다." },
    { en: "Would you like to leave a message?", ko: "메시지를 남기시겠어요?" },
    { en: "I'll make sure they get the message.", ko: "메시지를 꼭 전해드리겠습니다." },
    { en: "Could you spell that for me, please?", ko: "철자를 불러주시겠어요?" },
    { en: "Let me repeat that back to you.", ko: "다시 한 번 확인해 드리겠습니다." },
    { en: "May I ask who's calling?", ko: "누구신지 여쭤봐도 될까요?" },
    { en: "I'll have them call you back.", ko: "다시 전화드리도록 하겠습니다." },

    // 교통
    { en: "Would you like me to call a taxi?", ko: "택시를 불러드릴까요?" },
    { en: "The shuttle leaves every thirty minutes.", ko: "셔틀은 30분마다 출발합니다." },
    { en: "What time is your flight?", ko: "항공편이 몇 시인가요?" },
    { en: "I'd recommend leaving two hours early.", ko: "두 시간 일찍 출발하시길 권합니다." },
    { en: "The airport is about forty minutes away.", ko: "공항까지는 약 40분 거리입니다." },
    { en: "Shall I arrange airport pickup for you?", ko: "공항 픽업을 준비해 드릴까요?" },
    { en: "Your driver will meet you in the lobby.", ko: "기사님이 로비에서 기다리실 겁니다." },
    { en: "The bus stop is right outside the entrance.", ko: "버스 정류장은 입구 바로 밖에 있습니다." },
    { en: "Would you like a car for the whole day?", ko: "하루 종일 차량을 이용하시겠어요?" },
    { en: "I'll note your pickup time as 7 AM.", ko: "픽업 시간을 오전 7시로 적어두겠습니다." },

    // 결제 · 체크아웃
    { en: "Are you checking out this morning?", ko: "오늘 아침 체크아웃하시나요?" },
    { en: "How was everything during your stay?", ko: "머무시는 동안 모든 것이 괜찮으셨나요?" },
    { en: "Here is your final bill.", ko: "최종 청구서입니다." },
    { en: "Would you like to go over the charges?", ko: "청구 내역을 함께 확인하시겠어요?" },
    { en: "This charge is for the minibar.", ko: "이 항목은 미니바 이용 요금입니다." },
    { en: "Will you be paying by card or cash?", ko: "카드로 결제하시겠어요, 현금으로 하시겠어요?" },
    { en: "May I have the card you used at check-in?", ko: "체크인 때 사용하신 카드를 주시겠어요?" },
    { en: "Your card has been approved.", ko: "카드 승인되었습니다." },
    { en: "Would you like a printed or emailed receipt?", ko: "영수증을 인쇄로 드릴까요, 이메일로 드릴까요?" },
    { en: "I've removed that charge from your bill.", ko: "해당 요금을 청구서에서 제외했습니다." },
    { en: "Can I store your luggage after check-out?", ko: "체크아웃 후 짐을 보관해 드릴까요?" },
    { en: "We hope you enjoyed your stay.", ko: "즐겁게 머무셨길 바랍니다." },
    { en: "Safe travels, and please come again.", ko: "조심히 가시고, 또 방문해 주세요." },
    { en: "Would you like to leave a review of your stay?", ko: "숙박 후기를 남겨주시겠어요?" },
    { en: "Thank you for staying with us.", ko: "저희와 함께해 주셔서 감사합니다." },

    // 멤버십 · 업셀 · 특별 요청
    { en: "Are you a member of our loyalty program?", ko: "저희 멤버십 회원이신가요?" },
    { en: "Would you like to join? It's free.", ko: "가입하시겠어요? 무료입니다." },
    { en: "As a member, you get late check-out for free.", ko: "회원께는 무료 레이트 체크아웃이 제공됩니다." },
    { en: "Would you like to add a spa package?", ko: "스파 패키지를 추가하시겠어요?" },
    { en: "We have a special offer this weekend.", ko: "이번 주말 특별 할인이 있습니다." },
    { en: "May I interest you in a room with a view?", ko: "전망 좋은 객실은 어떠세요?" },
    { en: "Would you like a bottle of wine sent to your room?", ko: "객실로 와인 한 병을 보내드릴까요?" },
    { en: "We can arrange a birthday cake for the occasion.", ko: "특별한 날을 위해 생일 케이크를 준비해 드릴 수 있습니다." },
    { en: "Would you like a connecting room for your family?", ko: "가족을 위해 연결 객실을 원하시나요?" },
    { en: "I'll note that you'd like a quiet room.", ko: "조용한 객실을 원하신다고 기록해 두겠습니다." },
    { en: "Would you like a crib for the baby?", ko: "아기 침대를 준비해 드릴까요?" },
    { en: "We can accommodate a special dietary request.", ko: "특별 식단 요청을 맞춰드릴 수 있습니다." },
    { en: "Shall I arrange flowers for your room?", ko: "객실에 꽃을 준비해 드릴까요?" },
    { en: "Would you like a higher floor for a better view?", ko: "더 좋은 전망을 위해 고층을 원하시나요?" },
    { en: "We'd be glad to celebrate your anniversary with you.", ko: "기념일을 함께 축하해 드리겠습니다." },

    // 안전 · 긴급
    { en: "In case of fire, please use the stairs, not the elevator.", ko: "화재 시에는 엘리베이터 대신 계단을 이용해 주세요." },
    { en: "The emergency exit is at the end of the hall.", ko: "비상구는 복도 끝에 있습니다." },
    { en: "Please remain calm and follow the staff.", ko: "침착하게 직원의 안내를 따라주세요." },
    { en: "I'll call security right away.", ko: "바로 보안팀을 부르겠습니다." },
    { en: "Are you feeling unwell? Shall I call for help?", ko: "몸이 안 좋으신가요? 도움을 요청할까요?" },
    { en: "First aid is available at the front desk.", ko: "구급용품은 프런트에 있습니다." },
    { en: "Please don't leave valuables unattended.", ko: "귀중품을 방치하지 말아주세요." },
    { en: "The nearest hospital is five minutes away.", ko: "가장 가까운 병원은 5분 거리입니다." },
    { en: "Let me escort you to a safe area.", ko: "안전한 곳으로 안내해 드리겠습니다." },
    { en: "Is everyone in your party accounted for?", ko: "일행 분들 모두 함께 계신가요?" },

    // 작별 · 일상 표현
    { en: "Have a wonderful day.", ko: "좋은 하루 보내세요." },
    { en: "Take care, and travel safely.", ko: "몸 조심히, 안전한 여행 되세요." },
    { en: "We look forward to welcoming you back.", ko: "다시 모실 날을 기다리겠습니다." },
    { en: "It was a pleasure having you.", ko: "모시게 되어 즐거웠습니다." },
    { en: "Please come back and see us soon.", ko: "곧 다시 찾아주세요." },
    { en: "Drive safely.", ko: "안전 운전하세요." },
    { en: "Have a pleasant flight.", ko: "편안한 비행 되세요." },
    { en: "I hope the rest of your trip goes well.", ko: "남은 여행도 즐거우시길 바랍니다." },
    { en: "Don't forget your belongings.", ko: "소지품 잊지 마세요." },
    { en: "Goodbye, and thank you again.", ko: "안녕히 가세요, 다시 한 번 감사합니다." },
    { en: "Is there anything I can do before you go?", ko: "가시기 전에 도와드릴 일이 있을까요?" },
    { en: "We'll keep your luggage until you return.", ko: "돌아오실 때까지 짐을 보관해 두겠습니다." },
    { en: "Please rate us five stars if you enjoyed your stay!", ko: "즐거우셨다면 별 다섯 개 부탁드려요!" },
    { en: "Until next time.", ko: "다음에 또 뵙겠습니다." },
    { en: "Wishing you a safe journey home.", ko: "댁까지 안전히 가시길 바랍니다." },

    // 스몰토크 · 날씨
    { en: "Did you have a pleasant trip?", ko: "오시는 길은 편안하셨나요?" },
    { en: "How was your flight?", ko: "비행은 어떠셨어요?" },
    { en: "You must be tired after your long journey.", ko: "먼 길 오시느라 피곤하시겠어요." },
    { en: "The weather is lovely today, isn't it?", ko: "오늘 날씨가 참 좋죠?" },
    { en: "It's quite chilly out, so dress warmly.", ko: "밖이 꽤 쌀쌀하니 따뜻하게 입으세요." },
    { en: "Is this your first time in the city?", ko: "이 도시는 처음이신가요?" },
    { en: "I hope you enjoy your time here.", ko: "여기 계시는 동안 즐거우시길 바랍니다." },
    { en: "Are you here for business or leisure?", ko: "출장이신가요, 여행이신가요?" },
    { en: "What brings you to the city?", ko: "어떤 일로 오셨나요?" },
    { en: "Please make yourself at home.", ko: "편하게 계세요." },

    // 비즈니스 손님
    { en: "Would you like a wake-up call before your meeting?", ko: "회의 전에 모닝콜을 해드릴까요?" },
    { en: "The conference room is booked for you at 10.", ko: "회의실이 10시에 예약되어 있습니다." },
    { en: "May I arrange a printout for you?", ko: "인쇄물을 준비해 드릴까요?" },
    { en: "We can set up a projector in the meeting room.", ko: "회의실에 프로젝터를 설치해 드릴 수 있습니다." },
    { en: "Would you like coffee served during your meeting?", ko: "회의 중에 커피를 제공해 드릴까요?" },
    { en: "The express laundry will be ready by morning.", ko: "특급 세탁은 아침까지 완료됩니다." },
    { en: "Shall I press your suit for tomorrow?", ko: "내일을 위해 정장을 다려드릴까요?" },

    // 가족 · 아이
    { en: "We have a children's menu available.", ko: "어린이 메뉴가 준비되어 있습니다." },
    { en: "Would you like a high chair for your child?", ko: "아이를 위한 유아용 의자를 드릴까요?" },
    { en: "The kids' pool is on the third floor.", ko: "어린이 수영장은 3층에 있습니다." },
    { en: "We offer a babysitting service on request.", ko: "요청 시 베이비시팅 서비스를 제공합니다." },
    { en: "There's a playground behind the hotel.", ko: "호텔 뒤편에 놀이터가 있습니다." },

    // 기기 · 도움
    { en: "Let me show you how the lights work.", ko: "조명 사용법을 알려드리겠습니다." },
    { en: "The thermostat is here by the door.", ko: "온도 조절기는 문 옆에 있습니다." },
    { en: "You can stream from your phone to the TV.", ko: "휴대폰 화면을 TV로 연결하실 수 있습니다." },
    { en: "The safe code can be set by you.", ko: "금고 비밀번호는 직접 설정하실 수 있습니다." },
    { en: "Just dial zero to reach the front desk.", ko: "0번을 누르시면 프런트로 연결됩니다." },
    { en: "Press this button for room service.", ko: "이 버튼을 누르시면 룸서비스로 연결됩니다." },
    { en: "Would you like me to adjust the curtains?", ko: "커튼을 조절해 드릴까요?" },

    // 추가 응대 · 마무리
    { en: "I'll take care of that for you.", ko: "제가 처리해 드리겠습니다." },
    { en: "Consider it done.", ko: "바로 처리하겠습니다." },
    { en: "It would be my pleasure.", ko: "기꺼이 해드리겠습니다." },
    { en: "I'm sorry, I didn't catch that. Could you repeat it?", ko: "죄송해요, 잘 못 들었어요. 다시 말씀해 주시겠어요?" },
    { en: "Let me double-check that for you.", ko: "다시 한 번 확인해 드리겠습니다." },
    { en: "You're very welcome.", ko: "천만에요." },
    { en: "No trouble at all.", ko: "전혀 번거롭지 않습니다." },
    { en: "I'll be happy to arrange that.", ko: "기꺼이 준비해 드리겠습니다." },
    { en: "Please let me know if you change your mind.", ko: "마음이 바뀌시면 말씀해 주세요." },
    { en: "Is there a convenient time to call you back?", ko: "다시 연락드리기 편한 시간이 있을까요?" },
    { en: "I'll follow up with you shortly.", ko: "곧 다시 안내해 드리겠습니다." },
    { en: "Thank you for your understanding.", ko: "양해해 주셔서 감사합니다." },
    { en: "We appreciate your loyalty.", ko: "꾸준히 찾아주셔서 감사합니다." },
    { en: "Welcome back! It's great to see you again.", ko: "다시 오셨네요! 또 뵙게 되어 반갑습니다." },
    { en: "Please enjoy the rest of your evening.", ko: "남은 저녁 즐겁게 보내세요." },
];
const PHRASE_CATS = ["인사·응대","체크인","체크인","예약","체크인","체크인","체크인","인사·응대","객실·부대시설","인사·응대","컴플레인·사과","인사·응대","체크인","객실·부대시설","체크아웃·결제","하우스키핑","객실·부대시설","멤버십·업셀","예약","교통","인사·응대","체크인","예약","객실·부대시설","체크인","체크인","하우스키핑","체크아웃·결제","체크아웃·결제","체크아웃·결제","객실·부대시설","컴플레인·사과","작별","체크아웃·결제","객실·부대시설","멤버십·업셀","룸서비스·식음료","인사·응대","컨시어지·관광","작별","컨시어지·관광","하우스키핑","하우스키핑","인사·응대","예약","체크아웃·결제","객실·부대시설","객실·부대시설","하우스키핑","예약","스몰토크·날씨","교통","멤버십·업셀","체크아웃·결제","컨시어지·관광","룸서비스·식음료","예약","작별","안전·긴급","인사·응대","인사·응대","인사·응대","인사·응대","인사·응대","인사·응대","인사·응대","인사·응대","인사·응대","인사·응대","인사·응대","인사·응대","인사·응대","인사·응대","인사·응대","예약","예약","예약","예약","예약","예약","예약","예약","예약","예약","예약","예약","예약","예약","예약","체크인","체크인","체크인","체크인","체크인","체크인","체크인","체크인","체크인","체크인","체크인","체크인","체크인","체크인","체크인","객실·부대시설","객실·부대시설","객실·부대시설","객실·부대시설","객실·부대시설","객실·부대시설","객실·부대시설","객실·부대시설","객실·부대시설","객실·부대시설","객실·부대시설","객실·부대시설","객실·부대시설","객실·부대시설","객실·부대시설","객실·부대시설","객실·부대시설","객실·부대시설","객실·부대시설","객실·부대시설","하우스키핑","하우스키핑","하우스키핑","하우스키핑","하우스키핑","하우스키핑","하우스키핑","하우스키핑","하우스키핑","하우스키핑","룸서비스·식음료","룸서비스·식음료","룸서비스·식음료","룸서비스·식음료","룸서비스·식음료","룸서비스·식음료","룸서비스·식음료","룸서비스·식음료","룸서비스·식음료","룸서비스·식음료","룸서비스·식음료","룸서비스·식음료","룸서비스·식음료","룸서비스·식음료","룸서비스·식음료","룸서비스·식음료","룸서비스·식음료","룸서비스·식음료","룸서비스·식음료","룸서비스·식음료","컨시어지·관광","컨시어지·관광","컨시어지·관광","컨시어지·관광","컨시어지·관광","컨시어지·관광","컨시어지·관광","컨시어지·관광","컨시어지·관광","컨시어지·관광","컨시어지·관광","컨시어지·관광","컨시어지·관광","컨시어지·관광","컨시어지·관광","컴플레인·사과","컴플레인·사과","컴플레인·사과","컴플레인·사과","컴플레인·사과","컴플레인·사과","컴플레인·사과","컴플레인·사과","컴플레인·사과","컴플레인·사과","컴플레인·사과","컴플레인·사과","컴플레인·사과","컴플레인·사과","컴플레인·사과","전화·메시지","전화·메시지","전화·메시지","전화·메시지","전화·메시지","전화·메시지","전화·메시지","전화·메시지","전화·메시지","전화·메시지","교통","교통","교통","교통","교통","교통","교통","교통","교통","교통","체크아웃·결제","체크아웃·결제","체크아웃·결제","체크아웃·결제","체크아웃·결제","체크아웃·결제","체크아웃·결제","체크아웃·결제","체크아웃·결제","체크아웃·결제","체크아웃·결제","체크아웃·결제","체크아웃·결제","체크아웃·결제","체크아웃·결제","멤버십·업셀","멤버십·업셀","멤버십·업셀","멤버십·업셀","멤버십·업셀","멤버십·업셀","멤버십·업셀","멤버십·업셀","멤버십·업셀","멤버십·업셀","멤버십·업셀","멤버십·업셀","멤버십·업셀","멤버십·업셀","멤버십·업셀","안전·긴급","안전·긴급","안전·긴급","안전·긴급","안전·긴급","안전·긴급","안전·긴급","안전·긴급","안전·긴급","안전·긴급","작별","작별","작별","작별","작별","작별","작별","작별","작별","작별","작별","작별","작별","작별","작별","스몰토크·날씨","스몰토크·날씨","스몰토크·날씨","스몰토크·날씨","스몰토크·날씨","스몰토크·날씨","스몰토크·날씨","스몰토크·날씨","스몰토크·날씨","스몰토크·날씨","비즈니스","비즈니스","비즈니스","비즈니스","비즈니스","비즈니스","비즈니스","가족·아이","가족·아이","가족·아이","가족·아이","가족·아이","기기 도움","기기 도움","기기 도움","기기 도움","기기 도움","기기 도움","기기 도움","인사·응대","인사·응대","인사·응대","인사·응대","인사·응대","인사·응대","인사·응대","인사·응대","인사·응대","인사·응대","인사·응대","인사·응대","인사·응대","인사·응대","인사·응대"];

// ===== 오늘 표시할 표현 (매일 자동 변경 + "한 개 더") =====
function randomEnglishIdx(exclude) {
    const ex = exclude instanceof Set ? exclude : new Set(exclude || []);
    const pool = [];
    for (let i = 0; i < ENGLISH_PHRASES.length; i++) if (!ex.has(i)) pool.push(i);
    const cand = pool.length ? pool : ENGLISH_PHRASES.map((_, i) => i);
    return cand[Math.floor(Math.random() * cand.length)];
}

// 현재 표시 중인 표현 (날짜가 바뀌면 자동으로 새 표현)
function getCurrentEnglish() {
    let cur = null;
    try { cur = JSON.parse(localStorage.getItem('englishCurrent') || 'null'); } catch (e) { /* noop */ }
    const today = getMealKey(new Date());
    if (!cur || typeof cur.idx !== 'number' || cur.date !== today) {
        cur = { idx: randomEnglishIdx(), date: today };
        localStorage.setItem('englishCurrent', JSON.stringify(cur));
    }
    return cur;
}

function updateEnglishPhrase() {
    const enEl = document.getElementById('englishEn');
    const koEl = document.getElementById('englishKo');
    if (!enEl || !koEl) return;
    const cur = getCurrentEnglish();
    const p = ENGLISH_PHRASES[cur.idx];
    enEl.textContent = `"${p.en}"`;
    koEl.textContent = p.ko;
    enEl.dataset.idx = cur.idx;
    const catEl = document.getElementById('englishCat');
    if (catEl) catEl.textContent = `(${PHRASE_CATS[cur.idx] || ''})`;
}

// "한 개 더" → 다른 표현으로 바꿈 (노트에는 안 들어감, 스크랩해야 들어감)
function studyMoreEnglish() {
    const cur = getCurrentEnglish();
    const next = randomEnglishIdx(new Set([cur.idx]));
    localStorage.setItem('englishCurrent', JSON.stringify({ idx: next, date: getMealKey(new Date()) }));
    updateEnglishPhrase();
}

// ===== 스크랩(표현 노트) =====
function loadScraps() {
    try { const a = JSON.parse(localStorage.getItem('englishScraps') || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; }
}
function saveScraps(s) { localStorage.setItem('englishScraps', JSON.stringify(s)); }

// 현재 표현을 표현 노트에 스크랩
function scrapEnglish() {
    const cur = getCurrentEnglish();
    const scraps = loadScraps();
    if (scraps.some(s => s.idx === cur.idx)) {
        showToast('이미 스크랩한 표현이에요 📌');
        return;
    }
    scraps.push({ idx: cur.idx, date: getMealKey(new Date()) });
    saveScraps(scraps);
    showToast('표현 노트에 스크랩했어요! 📌');
}

// 영어 발음 듣기 (브라우저 내장 음성합성)
// 브라우저 기본 음성 (폴백): 자연스러운 영어 음성 우선 선택
function browserSpeak(text) {
    try {
        if (!('speechSynthesis' in window)) return;
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'en-US';
        u.rate = 0.95;
        const voices = window.speechSynthesis.getVoices() || [];
        // 자연스러운 음성 우선순위 (기기에 있는 것 중에서)
        const prefer = ['Google US English', 'Samantha', 'Aria', 'Jenny', 'Ava', 'Allison', 'Microsoft Aria', 'Microsoft Jenny'];
        let v = voices.find(x => prefer.some(p => x.name.includes(p)) && /en[-_]?US/i.test(x.lang));
        if (!v) v = voices.find(x => /en[-_]?US/i.test(x.lang));
        if (v) u.voice = v;
        window.speechSynthesis.speak(u);
    } catch (e) { /* noop */ }
}

// 발음 듣기: 브라우저 기본 음성 사용
function speakEnglish(text) {
    if (!text) return;
    browserSpeak(text);
}
// 음성 목록은 비동기로 로드되므로 미리 한 번 트리거
if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = () => { window.speechSynthesis.getVoices(); };
}

// 표현 노트에서 한 항목 삭제
function deleteEnglishItem(pos) {
    const scraps = loadScraps();
    if (pos < 0 || pos >= scraps.length) return;
    scraps.splice(pos, 1);
    saveScraps(scraps);
    renderEnglishNote();
}

function renderEnglishNote() {
    const listEl = document.getElementById('englishNoteList');
    if (!listEl) return;
    const scraps = loadScraps();
    // 스크랩한 날짜를 오름차순으로 정렬해 Day 번호 부여
    // (처음 스크랩한 날=Day1, 다음에 스크랩한 날=Day2, 같은 날 스크랩은 같은 Day)
    const dates = [...new Set(scraps.map(s => s.date))].sort();
    const dayOf = {};
    dates.forEach((d, i) => { dayOf[d] = i + 1; });
    const today = getMealKey(new Date());

    let html = '';
    for (let pos = scraps.length - 1; pos >= 0; pos--) { // 최신 스크랩이 위
        const e = scraps[pos];
        const p = ENGLISH_PHRASES[e.idx];
        const isToday = e.date === today;
        html += `
            <div class="english-note-item${isToday ? ' today' : ''}">
                <div class="note-top">
                    <span class="note-day">Day ${dayOf[e.date]} (${PHRASE_CATS[e.idx] || ''})${isToday ? ' · 오늘' : ''}</span>
                    <div class="note-actions">
                        <button class="note-speak" data-text="${p.en.replace(/"/g, '&quot;')}" title="발음 듣기">🔊</button>
                        <button class="note-del" data-pos="${pos}" title="삭제">🗑️</button>
                    </div>
                </div>
                <p class="note-en">"${p.en}"</p>
                <p class="note-ko">${p.ko}</p>
            </div>`;
    }
    listEl.innerHTML = html || '<p class="weather-loading">아직 스크랩한 표현이 없어요.<br>📌 스크랩 버튼으로 마음에 드는 표현을 모아보세요!</p>';

    listEl.querySelectorAll('.note-speak').forEach(btn => {
        btn.addEventListener('click', () => speakEnglish(btn.dataset.text));
    });
    listEl.querySelectorAll('.note-del').forEach(btn => {
        btn.addEventListener('click', () => deleteEnglishItem(parseInt(btn.dataset.pos, 10)));
    });
}

function openEnglishNote() {
    const overlay = document.getElementById('englishOverlay');
    if (!overlay) return;
    renderEnglishNote();
    overlay.classList.add('show');
}

// ==================== Weather ====================
function weatherIcon(sky, pty) {
    const p = parseInt(pty, 10);
    if (p === 1) return '🌧️';
    if (p === 2) return '🌨️';
    if (p === 3) return '❄️';
    if (p === 4) return '🌦️';
    const s = parseInt(sky, 10);
    if (s === 1) return '☀️';
    if (s === 3) return '⛅';
    if (s === 4) return '☁️';
    return '🌤️';
}

function weatherDesc(sky, pty) {
    const p = parseInt(pty, 10);
    if (p === 1) return '비';
    if (p === 2) return '비/눈';
    if (p === 3) return '눈';
    if (p === 4) return '소나기';
    const s = parseInt(sky, 10);
    if (s === 1) return '맑음';
    if (s === 3) return '구름많음';
    if (s === 4) return '흐림';
    return '';
}

function renderWeather(data) {
    const wrap = document.getElementById('weatherHours');
    const nowEl = document.getElementById('weatherNow');
    if (!wrap || !data) return false;
    const hours = data.hours || [];

    // 현재 시각(KST) 기준, 지금 시각 이후 12시간만 (자정 넘어서도 이어서)
    const k = new Date(Date.now() + 9 * 3600 * 1000);
    const nowYmd = `${k.getUTCFullYear()}${String(k.getUTCMonth() + 1).padStart(2, '0')}${String(k.getUTCDate()).padStart(2, '0')}`;
    const nowKey = nowYmd + String(k.getUTCHours()).padStart(2, '0');
    const keyOf = (h) => (h.ymd || nowYmd) + h.time.slice(0, 2);
    let upcoming = hours.filter(h => keyOf(h) >= nowKey);
    if (upcoming.length === 0) upcoming = hours;
    upcoming = upcoming.slice(0, 12);
    if (upcoming.length === 0) return false;

    // 현재 요약: 네이버 현재 관측값 우선, 없으면 가장 가까운 시간
    const near = upcoming[0];
    if (nowEl) {
        const c = (data.current && data.current.temp != null) ? data.current : near;
        if (c) nowEl.textContent = `지금 ${c.icon || '🌤️'} ${c.temp}° ${c.desc || ''}`;
    }

    wrap.innerHTML = upcoming.map(h => {
        const hh = parseInt(h.time.slice(0, 2), 10);
        const precip = h.precip ? `<span class="weather-pop">💧${h.precip}</span>` : '';
        return `
            <div class="weather-card">
                <span class="weather-time">${hh}시</span>
                <span class="weather-icon">${h.icon || '🌤️'}</span>
                <span class="weather-temp">${h.temp}°</span>
                ${precip}
            </div>`;
    }).join('');
    return true;
}

async function loadWeather() {
    const wrap = document.getElementById('weatherHours');
    if (!wrap) return;

    // 1) 브라우저에 저장된 최근 날씨가 있으면 즉시 표시 (체감 속도 ↑)
    let shownFromCache = false;
    try {
        const cached = JSON.parse(localStorage.getItem('weatherCache') || 'null');
        const todayStr = (() => {
            const k = new Date(Date.now() + 9 * 3600 * 1000);
            return `${k.getUTCFullYear()}${String(k.getUTCMonth() + 1).padStart(2, '0')}${String(k.getUTCDate()).padStart(2, '0')}`;
        })();
        if (cached && cached.date === todayStr) {
            shownFromCache = renderWeather(cached);
        }
    } catch (e) { /* noop */ }

    // 2) 최신 데이터로 갱신
    try {
        const res = await fetch('/api/weather');
        if (!res.ok) {
            const e = await res.json().catch(() => ({}));
            throw new Error(e.error || `오류 (${res.status})`);
        }
        const data = await res.json();
        try { localStorage.setItem('weatherCache', JSON.stringify(data)); } catch (e) { /* noop */ }
        if (!renderWeather(data) && !shownFromCache) {
            wrap.innerHTML = '<p class="weather-loading">날씨 정보가 없어요</p>';
        }
    } catch (err) {
        console.error('날씨 로드 실패:', err);
        if (!shownFromCache) {
            wrap.innerHTML = `<p class="weather-loading">날씨를 불러오지 못했어요 😢</p>`;
        }
    }
}

// 표현 노트 버튼/모달
(function setupEnglishNote() {
    const btn = document.getElementById('openEnglishNote');
    const overlay = document.getElementById('englishOverlay');
    const close = document.getElementById('englishClose');
    const more = document.getElementById('studyMoreBtn');
    const speak = document.getElementById('englishSpeak');
    const scrap = document.getElementById('scrapBtn');
    if (scrap) scrap.addEventListener('click', scrapEnglish);
    if (more) more.addEventListener('click', studyMoreEnglish);
    if (speak) speak.addEventListener('click', () => {
        const en = document.getElementById('englishEn');
        if (en) speakEnglish(en.textContent.replace(/^"|"$/g, ''));
    });
    if (btn) btn.addEventListener('click', openEnglishNote);
    if (close) close.addEventListener('click', () => overlay.classList.remove('show'));
    if (overlay) overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.remove('show'); });
})();

async function init() {
    try { updateDday(); } catch (e) { console.warn('D-day 표시 실패:', e); }
    try { updateEnglishPhrase(); } catch (e) { console.warn('영어 구문 표시 실패:', e); }
    // 날씨는 DB 로드를 기다리지 않고 즉시 병렬로 불러옴
    try {
        loadWeather();
        // 페이지를 열어둬도 시간이 지나면 자동으로 한 칸씩 굴러가게 주기적 갱신
        setInterval(loadWeather, 10 * 60 * 1000);
    } catch (e) { console.warn('날씨 로드 실패:', e); }
    try {
        await loadMealsFromDB();
    } catch (e) {
        console.warn('DB 로드 실패, 빈 상태로 시작:', e);
    }
    try {
        updateTodayMenu();
    } catch (e) {
        console.warn('오늘의 메뉴 표시 실패:', e);
    }
    try {
        initCalendar();
    } catch (e) {
        console.error('달력 렌더 실패:', e);
    }
    try {
        await restoreMood();
    } catch (e) {
        console.warn('기분 로드 실패:', e);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// 동적으로 추가되는 이모지(달력/메뉴/모달)도 자동으로 Twemoji 변환
function startEmojiWatcher() {
    if (!window.MutationObserver) { refreshEmoji(); return; }
    _emojiObserver = new MutationObserver(() => refreshEmoji());
    refreshEmoji(); // 첫 변환 (끝나면 내부에서 옵저버를 켬)
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startEmojiWatcher);
} else {
    startEmojiWatcher();
}
