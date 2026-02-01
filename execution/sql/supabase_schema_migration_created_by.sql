-- ============================================
-- Xavian CRM - created_by 컬럼 추가 마이그레이션
-- 팀 공유 데이터 구조로 전환
-- ============================================
-- 이 파일의 SQL 쿼리를 Supabase Dashboard > SQL Editor에서 실행하세요.
-- 기존 스키마에 created_by 컬럼을 추가합니다.
-- ============================================

-- 1. Products 테이블에 created_by 컬럼 추가
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS created_by TEXT;

-- 2. Clients 테이블에 created_by 컬럼 추가
ALTER TABLE clients 
ADD COLUMN IF NOT EXISTS created_by TEXT;

-- 3. Activities 테이블에 created_by 컬럼 추가
ALTER TABLE activities 
ADD COLUMN IF NOT EXISTS created_by TEXT;

-- 4. Sales 테이블에 created_by 컬럼 추가
ALTER TABLE sales 
ADD COLUMN IF NOT EXISTS created_by TEXT;

-- 5. Issues 테이블에 created_by 컬럼 추가
ALTER TABLE issues 
ADD COLUMN IF NOT EXISTS created_by TEXT;

-- ============================================
-- 인덱스 추가 (created_by 검색 최적화)
-- ============================================

CREATE INDEX IF NOT EXISTS idx_products_created_by ON products(created_by);
CREATE INDEX IF NOT EXISTS idx_clients_created_by ON clients(created_by);
CREATE INDEX IF NOT EXISTS idx_activities_created_by ON activities(created_by);
CREATE INDEX IF NOT EXISTS idx_sales_created_by ON sales(created_by);
CREATE INDEX IF NOT EXISTS idx_issues_created_by ON issues(created_by);

-- ============================================
-- 기존 데이터 마이그레이션 (선택사항)
-- 기존 데이터가 있다면 created_by를 NULL로 유지하거나 기본값 설정
-- ============================================

-- 기존 데이터는 NULL로 유지 (팀 공유 전 데이터이므로)
-- 필요시 기본값을 설정할 수 있습니다:
-- UPDATE products SET created_by = '시스템' WHERE created_by IS NULL;
-- UPDATE clients SET created_by = '시스템' WHERE created_by IS NULL;
-- UPDATE activities SET created_by = '시스템' WHERE created_by IS NULL;
-- UPDATE sales SET created_by = '시스템' WHERE created_by IS NULL;
-- UPDATE issues SET created_by = '시스템' WHERE created_by IS NULL;
