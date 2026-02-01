-- ============================================
-- Xavian CRM - Supabase 데이터베이스 스키마
-- ============================================
-- 이 파일의 SQL 쿼리를 Supabase Dashboard > SQL Editor에서 실행하세요.
-- 순서대로 실행하면 테이블과 관계가 생성됩니다.
-- ============================================

-- 1. 제품(Products) 테이블
CREATE TABLE IF NOT EXISTS products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT,
  standard TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. 고객(Clients) 테이블
CREATE TABLE IF NOT EXISTS clients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  status TEXT DEFAULT '활성',
  last_order DATE,
  order_amount NUMERIC(15, 2) DEFAULT 0,
  contract_prices JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. 영업 활동(Activities) 테이블
-- 주의: PostgreSQL은 기본적으로 소문자로 변환하므로 snake_case 사용
-- JavaScript 코드에서 clientId를 사용하지만, DB에서는 client_id로 저장
CREATE TABLE IF NOT EXISTS activities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  activity_date DATE NOT NULL,
  user TEXT,
  description TEXT,
  status TEXT DEFAULT '완료',
  client_name TEXT,
  next_action_date DATE,
  next_action_detail TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. 매출(Sales) 테이블
CREATE TABLE IF NOT EXISTS sales (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  sale_date DATE NOT NULL,
  item_name TEXT,
  quantity NUMERIC(10, 2) DEFAULT 1,
  unit_price NUMERIC(15, 2) DEFAULT 0,
  total_amount NUMERIC(15, 2) DEFAULT 0,
  notes TEXT,
  client_name TEXT,
  items JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. 이슈(Issues) 테이블
CREATE TABLE IF NOT EXISTS issues (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT,
  target_date DATE,
  status TEXT DEFAULT '등록',
  date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. 사용자 설정(Settings) 테이블 (user_id는 auth.users와 연결)
CREATE TABLE IF NOT EXISTS settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  company_name TEXT,
  email TEXT,
  email_notification BOOLEAN DEFAULT true,
  new_client_notification BOOLEAN DEFAULT true,
  sales_goal_notification BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 인덱스 생성 (성능 최적화)
-- ============================================

CREATE INDEX IF NOT EXISTS idx_activities_client_id ON activities(client_id);
CREATE INDEX IF NOT EXISTS idx_activities_activity_date ON activities(activity_date);
CREATE INDEX IF NOT EXISTS idx_sales_client_id ON sales(client_id);
CREATE INDEX IF NOT EXISTS idx_sales_sale_date ON sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status);
CREATE INDEX IF NOT EXISTS idx_issues_date ON issues(date);
CREATE INDEX IF NOT EXISTS idx_settings_user_id ON settings(user_id);

-- ============================================
-- Row Level Security (RLS) 정책 설정
-- ============================================

-- 모든 테이블에 RLS 활성화
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- 인증된 사용자는 모든 데이터를 볼 수 있도록 정책 설정
CREATE POLICY "인증된 사용자는 모든 제품 조회 가능" ON products
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "인증된 사용자는 모든 제품 수정 가능" ON products
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "인증된 사용자는 모든 고객 조회 가능" ON clients
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "인증된 사용자는 모든 고객 수정 가능" ON clients
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "인증된 사용자는 모든 활동 조회 가능" ON activities
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "인증된 사용자는 모든 활동 수정 가능" ON activities
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "인증된 사용자는 모든 매출 조회 가능" ON sales
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "인증된 사용자는 모든 매출 수정 가능" ON sales
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "인증된 사용자는 모든 이슈 조회 가능" ON issues
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "인증된 사용자는 모든 이슈 수정 가능" ON issues
  FOR ALL USING (auth.role() = 'authenticated');

-- Settings는 본인 것만 조회/수정 가능
CREATE POLICY "사용자는 본인 설정만 조회 가능" ON settings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "사용자는 본인 설정만 수정 가능" ON settings
  FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- 자동 updated_at 업데이트 함수 및 트리거
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 각 테이블에 updated_at 트리거 추가
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_activities_updated_at BEFORE UPDATE ON activities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sales_updated_at BEFORE UPDATE ON sales
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_issues_updated_at BEFORE UPDATE ON issues
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
