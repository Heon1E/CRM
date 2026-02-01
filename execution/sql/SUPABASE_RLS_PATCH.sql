-- ============================================
-- Supabase RLS 정책 해결을 위한 SQL 패치
-- ============================================
-- 현상: 제품(Products)과 매출(Sales)은 데이터가 나오지만 거래처(Clients)와 활동(Activities)은 0건이 나옴.
-- 원인: Clients와 Activities 테이블에 RLS가 설정되어 전용 인증이 필요함.
-- 해결: 현재 Mock Auth(익명) 환경에서 접근할 수 있도록 RLS를 비활성화하거나 공개 정책을 추가합니다.
-- ============================================

-- 방법 1: RLS 자체를 비활성화 (가장 간편한 방법, 다른 테이블과 동일한 설정)
ALTER TABLE IF EXISTS clients DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS activities DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS client_contacts DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS products DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS sales DISABLE ROW LEVEL SECURITY;

-- 방법 2: (선택사항) 모든 사용자에게 조회/수정 권한을 명시적으로 부여 (RLS를 유지하고 싶은 경우)
-- DROP POLICY IF EXISTS "모든 사용자 조회 허용" ON clients;
-- CREATE POLICY "모든 사용자 조회 허용" ON clients FOR SELECT USING (true);

-- DROP POLICY IF EXISTS "모든 사용자 수정 허용" ON clients;
-- CREATE POLICY "모든 사용자 수정 허용" ON clients FOR ALL USING (true);

-- DROP POLICY IF EXISTS "모든 사용자 조회 허용" ON activities;
-- CREATE POLICY "모든 사용자 조회 허용" ON activities FOR SELECT USING (true);

-- DROP POLICY IF EXISTS "모든 사용자 수정 허용" ON activities;
-- CREATE POLICY "모든 사용자 수정 허용" ON activities FOR ALL USING (true);

-- DROP POLICY IF EXISTS "모든 사용자 조회 허용" ON client_contacts;
-- CREATE POLICY "모든 사용자 조회 허용" ON client_contacts FOR SELECT USING (true);

-- DROP POLICY IF EXISTS "모든 사용자 수정 허용" ON client_contacts;
-- CREATE POLICY "모든 사용자 수정 허용" ON client_contacts FOR ALL USING (true);
