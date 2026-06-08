// ==================== Supabase Init ====================
const SUPABASE_URL = 'https://kgwlzvmnvlzrpjatnfmt.supabase.co';
const SUPABASE_KEY = 'sb_publishable_rLsCWwHlvRDFLHa7xnV9ZQ_9HA834a-';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ==================== Data Store ====================
const API_KEY_STORAGE = 'mealCalendarApiKey';
const API_PROVIDER_STORAGE = 'mealCalendarApiProvider';

// In-memory cache
let mealsCache = {};
let cacheLoaded = false;

async function loadMealsFromDB() {
    try {
        const { data, error } = await supabase.from('meals').select('*');
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
        const { error } = await supabase.from('meals').upsert({
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
        await supabase.from('moods').upsert({
            date_key: dateKey,
            mood: mood,
        }, { onConflict: 'date_key' });
    } catch (err) {
        console.error('Mood save error:', err);
    }
}

async function loadMoodFromDB(dateKey) {
    try {
        const { data, error } = await supabase
            .from('moods')
            .select('mood')
            .eq('date_key', dateKey)
            .single();
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

function estimateCalories(menuText) {
    if (!menuText) return null;
    let total = 0;
    let found = 0;
    const items = menuText.split(/[\n,\/·]/).map(s => s.trim()).filter(Boolean);
    for (const item of items) {
        for (const [food, cal] of Object.entries(calorieDB)) {
            if (item.includes(food)) {
                total += cal;
                found++;
                break;
            }
        }
    }
    if (found === 0) {
        return items.length > 0 ? `약 ${items.length * 200}kcal (추정)` : null;
    }
    return `약 ${total}kcal`;
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
                `<div class="menu-item" onclick="openFoodSearch('${item.replace(/'/g, "\\'")}')">${item}</div>`
            ).join('');
        } else {
            container.innerHTML = '<p class="no-meal">등록된 메뉴가 없어요</p>';
        }
    });
}

// ==================== API Key Management ====================
const apiKeyToggle = document.getElementById('apiKeyToggle');
const apiKeyInput = document.getElementById('apiKeyInput');
const apiProvider = document.getElementById('apiProvider');
const apiKeyOverlay = document.getElementById('apiKeyOverlay');

function loadApiConfig() {
    const key = localStorage.getItem(API_KEY_STORAGE) || '';
    const provider = localStorage.getItem(API_PROVIDER_STORAGE) || 'openai';
    apiKeyInput.value = key;
    apiProvider.value = provider;
    if (key) {
        apiKeyToggle.textContent = '🔑 설정됨';
        apiKeyToggle.classList.add('configured');
    }
}
loadApiConfig();

apiKeyToggle.addEventListener('click', () => {
    apiKeyOverlay.classList.add('show');
});

document.getElementById('apiKeyClose').addEventListener('click', () => {
    apiKeyOverlay.classList.remove('show');
});

apiKeyOverlay.addEventListener('click', e => {
    if (e.target === e.currentTarget) apiKeyOverlay.classList.remove('show');
});

document.getElementById('saveApiKey').addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    const provider = apiProvider.value;
    if (!key) {
        showToast('API 키를 입력해주세요!');
        return;
    }
    localStorage.setItem(API_KEY_STORAGE, key);
    localStorage.setItem(API_PROVIDER_STORAGE, provider);
    apiKeyToggle.textContent = '🔑 설정됨';
    apiKeyToggle.classList.add('configured');
    apiKeyOverlay.classList.remove('show');
    showToast('API 키가 저장되었어요!');
});

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

async function analyzeWithOpenAI(base64Image) {
    const apiKey = localStorage.getItem(API_KEY_STORAGE);
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
                    { type: 'text', text: AI_PROMPT },
                    { type: 'image_url', image_url: { url: base64Image } }
                ]
            }],
            max_tokens: 2000
        })
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `API 오류 (${response.status})`);
    }
    const data = await response.json();
    return data.choices[0].message.content;
}

async function analyzeWithClaude(base64Image) {
    const apiKey = localStorage.getItem(API_KEY_STORAGE);
    const mediaType = base64Image.match(/data:(.*?);/)?.[1] || 'image/jpeg';
    const rawBase64 = base64Image.replace(/^data:.*?;base64,/, '');
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 2000,
            messages: [{
                role: 'user',
                content: [
                    { type: 'image', source: { type: 'base64', media_type: mediaType, data: rawBase64 } },
                    { type: 'text', text: AI_PROMPT }
                ]
            }]
        })
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `API 오류 (${response.status})`);
    }
    const data = await response.json();
    return data.content[0].text;
}

function parseAIResponse(responseText) {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('JSON을 찾을 수 없습니다');
    return JSON.parse(jsonMatch[0]);
}

function fillAnalysisForm(parsed) {
    const dayMap = { '월': 0, '화': 1, '수': 2, '목': 3, '금': 4, '토': 5, '일': 6 };
    const area = document.getElementById('analysisArea');
    area.style.display = '';

    if (parsed.weekStart) {
        document.getElementById('periodStart').value = parsed.weekStart;
        updatePeriodEnd();
    }

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
    const reader = new FileReader();
    reader.onload = e => {
        currentImageBase64 = e.target.result;
        previewImg.src = currentImageBase64;
        uploadPreview.style.display = '';
        uploadArea.style.display = 'none';
    };
    reader.readAsDataURL(file);
}

async function runAIAnalysis() {
    const provider = localStorage.getItem(API_PROVIDER_STORAGE) || 'openai';
    const loading = document.getElementById('aiLoading');
    loading.style.display = '';
    document.getElementById('analysisArea').style.display = 'none';

    try {
        let responseText;
        if (provider === 'openai') {
            responseText = await analyzeWithOpenAI(currentImageBase64);
        } else {
            responseText = await analyzeWithClaude(currentImageBase64);
        }
        const parsed = parseAIResponse(responseText);
        fillAnalysisForm(parsed);
        showToast('AI 분석 완료! 결과를 확인해주세요 🎉');
    } catch (err) {
        console.error('AI Analysis Error:', err);
        showToast(`분석 실패: ${err.message}`);
        showManualForm();
    } finally {
        loading.style.display = 'none';
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
    const apiKey = localStorage.getItem(API_KEY_STORAGE);
    const analysisArea = document.getElementById('analysisArea');
    const manualArea = document.getElementById('manualArea');

    if (analysisArea.style.display !== 'none') {
        saveWeekFromGrid('analysisWeekGrid');
    } else if (manualArea.style.display !== 'none') {
        saveWeekFromGrid('weekInputGrid');
    } else if (currentImageBase64 && apiKey) {
        await runAIAnalysis();
        return;
    } else if (currentImageBase64 && !apiKey) {
        showToast('API 키를 먼저 설정해주세요!');
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
                    <label>🌅 조식</label>
                    <textarea data-day="${i}" data-type="breakfast" placeholder="메뉴를 입력해주세요&#10;(줄바꿈으로 구분)">${existing.breakfast || ''}</textarea>
                </div>
                <div class="meal-input-wrap">
                    <label>☀️ 중식</label>
                    <textarea data-day="${i}" data-type="lunch" placeholder="메뉴를 입력해주세요&#10;(줄바꿈으로 구분)">${existing.lunch || ''}</textarea>
                </div>
                <div class="meal-input-wrap">
                    <label>🌙 석식</label>
                    <textarea data-day="${i}" data-type="dinner" placeholder="메뉴를 입력해주세요&#10;(줄바꿈으로 구분)">${existing.dinner || ''}</textarea>
                </div>
            </div>
        `;
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
                const first = meals.breakfast.split('\n')[0];
                mealsHtml += `<div class="day-meal-tag breakfast"><span class="tag-icon">🌅</span><span class="tag-text">${first}</span></div>`;
            }
            if (meals.lunch) {
                const first = meals.lunch.split('\n')[0];
                mealsHtml += `<div class="day-meal-tag lunch"><span class="tag-icon">☀️</span><span class="tag-text">${first}</span></div>`;
            }
            if (meals.dinner) {
                const first = meals.dinner.split('\n')[0];
                mealsHtml += `<div class="day-meal-tag dinner"><span class="tag-icon">🌙</span><span class="tag-text">${first}</span></div>`;
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

function openDayModal(date, key) {
    currentModalDate = date;
    currentModalKey = key;
    const modal = document.getElementById('modalOverlay');
    const dateStr = `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 ${['일','월','화','수','목','금','토'][date.getDay()]}요일`;
    document.getElementById('modalDate').textContent = dateStr;

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === 'breakfast');
    });
    currentTab = 'breakfast';
    updateModalContent();
    modal.classList.add('show');
}

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
        list.innerHTML = items.map(item =>
            `<div class="modal-meal-item" onclick="openFoodSearch('${item.replace(/'/g, "\\'")}')">
                <span>${item}</span>
                <span class="search-icon">🔍</span>
            </div>`
        ).join('');
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
    const panel = document.getElementById('foodPanelOverlay');
    document.getElementById('foodName').textContent = `🍳 ${foodName}`;

    const results = document.getElementById('foodSearchResults');
    const links = document.getElementById('foodLinks');

    let cal = null;
    for (const [food, c] of Object.entries(calorieDB)) {
        if (foodName.includes(food)) { cal = c; break; }
    }

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
                    <span class="nut-value">${cal ? Math.round(cal * 0.5 / 4) + 'g' : '-'}</span>
                </div>
                <div class="nutrition-item">
                    <span class="nut-icon">🥩</span>
                    <span class="nut-label">단백질</span>
                    <span class="nut-value">${cal ? Math.round(cal * 0.25 / 4) + 'g' : '-'}</span>
                </div>
                <div class="nutrition-item">
                    <span class="nut-icon">🧈</span>
                    <span class="nut-label">지방</span>
                    <span class="nut-value">${cal ? Math.round(cal * 0.25 / 9) + 'g' : '-'}</span>
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
async function init() {
    try {
        await loadMealsFromDB();
    } catch (e) {
        console.warn('DB 로드 실패, 빈 상태로 시작:', e);
    }
    updateTodayMenu();
    initCalendar();
    try {
        await restoreMood();
    } catch (e) {
        console.warn('기분 로드 실패:', e);
    }
}
init();
