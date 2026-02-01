-- ============================================
-- Xavian CRM - 주소 필드 추가 마이그레이션
-- 거래처 위치 정보 및 지도 표시 기능 지원
-- ============================================
-- 이 파일의 SQL 쿼리를 Supabase Dashboard > SQL Editor에서 실행하세요.
-- ============================================

-- 1. Clients 테이블에 주소 관련 컬럼 추가
ALTER TABLE clients 
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS address_detail TEXT,
ADD COLUMN IF NOT EXISTS postal_code VARCHAR(10),
ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8),
ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8);

-- 2. 주소 검색을 위한 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_clients_address ON clients(address);
CREATE INDEX IF NOT EXISTS idx_clients_postal_code ON clients(postal_code);

-- 3. 지도 표시를 위한 공간 인덱스 추가 (위도/경도)
CREATE INDEX IF NOT EXISTS idx_clients_location ON clients(latitude, longitude);

-- ============================================
-- 컬럼 설명
-- ============================================
-- address: 기본 주소 (도로명 또는 지번 주소)
-- address_detail: 상세 주소 (건물명, 층, 호수 등)
-- postal_code: 우편번호
-- latitude: 위도 (지도 표시용)
-- longitude: 경도 (지도 표시용)
-- ============================================

COMMENT ON COLUMN clients.address IS '기본 주소 (도로명/지번)';
COMMENT ON COLUMN clients.address_detail IS '상세 주소 (건물명, 층, 호수)';
COMMENT ON COLUMN clients.postal_code IS '우편번호';
COMMENT ON COLUMN clients.latitude IS '위도 (지도 표시용)';
COMMENT ON COLUMN clients.longitude IS '경도 (지도 표시용)';
