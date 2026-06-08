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

-- RLS 비활성화 (개인 프로젝트용)
ALTER TABLE meals DISABLE ROW LEVEL SECURITY;
ALTER TABLE moods DISABLE ROW LEVEL SECURITY;
