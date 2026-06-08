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
    '1f389','1f3ac','1f446','1f495','1f497','1f4a7','1f4aa','1f4bc','1f4ca','1f4d7',
    '1f4f7','1f4f8','1f50d','1f525','1f5d1','1f60a','1f622','1f624','1f62e-200d-1f4a8',
    '1f634','1f912','1f917','1f929','1f963','1f969','1f970','1f97a','1f9c8','2600',
    '2601','25b6','25c0','26a0','26c5','270f','2728','2744'
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

// 메뉴 한 개의 칼로리 추정 (숫자 반환, 없으면 null)
function itemCalorie(item) {
    if (!item) return null;
    // AI가 붙여준 (NNNkcal) 숫자가 있으면 그걸 우선 사용
    const m = item.match(/\((\d+)\s*kcal\)/i);
    if (m) return parseInt(m[1], 10);
    for (const [food, cal] of Object.entries(calorieDB)) {
        if (item.includes(food)) return cal;
    }
    return null;
}

// 메뉴 텍스트 뒤에 (NNNkcal) 붙여서 반환
function withCalorie(item) {
    // AI가 이미 (NNNkcal)을 붙여준 경우엔 그 부분만 스타일링
    const m = item.match(/^(.*?)\s*\((\d+)\s*kcal\)\s*$/i);
    if (m) {
        return `${m[1]} <span class="item-cal">(${m[2]}kcal)</span>`;
    }
    const cal = itemCalorie(item);
    return cal ? `${item} <span class="item-cal">(${cal}kcal)</span>` : item;
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

async function analyzeWithServer(base64Image, weekStart) {
    const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64Image, weekStart })
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `서버 오류 (${response.status})`);
    }
    const data = await response.json();
    return data.result;
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
    const loading = document.getElementById('aiLoading');
    loading.style.display = '';
    document.getElementById('analysisArea').style.display = 'none';

    try {
        const weekStart = document.getElementById('periodStart').value;
        const responseText = await analyzeWithServer(currentImageBase64, weekStart);
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
        list.innerHTML = items.map(item =>
            `<div class="modal-meal-item" onclick="openFoodSearch('${item.replace(/'/g, "\\'")}')">
                <span>${withCalorie(item)}</span>
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
    // AI가 붙여준 (NNNkcal) 값을 먼저 추출 (있으면 우선 사용)
    const calMatch = foodName.match(/\((\d+)\s*kcal\)/i);
    let cal = calMatch ? parseInt(calMatch[1], 10) : null;
    // 메뉴에 붙은 (NNNkcal) 표기는 검색·표시에서 제거
    foodName = foodName.replace(/\s*\(\s*\d+\s*kcal\s*\)\s*$/i, '').trim();
    const panel = document.getElementById('foodPanelOverlay');
    document.getElementById('foodName').textContent = `🍳 ${foodName}`;

    const results = document.getElementById('foodSearchResults');
    const links = document.getElementById('foodLinks');

    // AI 칼로리가 없으면 내장 DB에서 찾기
    if (cal == null) {
        for (const [food, c] of Object.entries(calorieDB)) {
            if (foodName.includes(food)) { cal = c; break; }
        }
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
    el.textContent = `💼 입사 D+${days}`;
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

async function loadWeather() {
    const wrap = document.getElementById('weatherHours');
    const nowEl = document.getElementById('weatherNow');
    if (!wrap) return;
    try {
        const res = await fetch('/api/weather');
        if (!res.ok) {
            const e = await res.json().catch(() => ({}));
            throw new Error(e.error || `오류 (${res.status})`);
        }
        const data = await res.json();
        const hours = data.hours || [];

        // 현재 시각 이후의 시간만 (지난 시간은 제외)
        const nowHHMM = (() => {
            const k = new Date(Date.now() + 9 * 3600 * 1000);
            return String(k.getUTCHours()).padStart(2, '0') + '00';
        })();
        let upcoming = hours.filter(h => h.time >= nowHHMM);
        if (upcoming.length === 0) upcoming = hours;

        if (upcoming.length === 0) {
            wrap.innerHTML = '<p class="weather-loading">날씨 정보가 없어요</p>';
            return;
        }

        // 현재 요약: 실황(current)이 있으면 실제 관측값 사용, 없으면 가장 가까운 예보
        const near = upcoming[0];
        if (nowEl) {
            if (data.current && data.current.temp != null) {
                const c = data.current;
                // 실황엔 하늘상태(SKY)가 없으니 가까운 예보의 sky로 아이콘 보완
                const sky = near ? near.sky : null;
                const pty = (c.pty && c.pty !== '0') ? c.pty : (near ? near.pty : '0');
                nowEl.textContent = `지금 ${weatherIcon(sky, pty)} ${c.temp}° ${weatherDesc(sky, pty)}`;
            } else if (near) {
                nowEl.textContent = `지금 ${weatherIcon(near.sky, near.pty)} ${near.temp}° ${weatherDesc(near.sky, near.pty)}`;
            }
        }

        wrap.innerHTML = upcoming.map(h => {
            const hh = parseInt(h.time.slice(0, 2), 10);
            const label = `${hh}시`;
            return `
                <div class="weather-card">
                    <span class="weather-time">${label}</span>
                    <span class="weather-icon">${weatherIcon(h.sky, h.pty)}</span>
                    <span class="weather-temp">${h.temp}°</span>
                    <span class="weather-pop">💧${h.pop}%</span>
                </div>`;
        }).join('');
    } catch (err) {
        console.error('날씨 로드 실패:', err);
        wrap.innerHTML = `<p class="weather-loading">날씨를 불러오지 못했어요 😢</p>`;
    }
}

async function init() {
    try { updateDday(); } catch (e) { console.warn('D-day 표시 실패:', e); }
    // 날씨는 DB 로드를 기다리지 않고 즉시 병렬로 불러옴
    try { loadWeather(); } catch (e) { console.warn('날씨 로드 실패:', e); }
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
