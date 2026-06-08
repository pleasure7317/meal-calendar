-- 식단 데이터 테이블
CREATE TABLE meals (
  id SERIAL PRIMARY KEY,
  date_key TEXT NOT NULL UNIQUE,
  breakfast TEXT DEFAULT '',
  lunch TEXT DEFAULT '',
  dinner TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 기분 데이터 테이블
CREATE TABLE moods (
  id SERIAL PRIMARY KEY,
  date_key TEXT NOT NULL UNIQUE,
  mood TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- RLS 설정: publishable 키로 읽기/쓰기가 가능하도록 전체 허용 정책
-- (이미 테이블을 만든 상태라면 아래 부분만 실행해도 됩니다)
-- ============================================================

ALTER TABLE meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE moods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_all_meals" ON meals;
CREATE POLICY "public_all_meals" ON meals
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "public_all_moods" ON moods;
CREATE POLICY "public_all_moods" ON moods
  FOR ALL USING (true) WITH CHECK (true);
