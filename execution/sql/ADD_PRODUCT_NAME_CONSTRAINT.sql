-- products 테이블의 name 컬럼에 UNIQUE 제약조건 추가
-- 이것이 있어야 upsert(onConflict: 'name')가 작동합니다.

ALTER TABLE products 
ADD CONSTRAINT products_name_key UNIQUE (name);

-- 확인용 주석
COMMENT ON CONSTRAINT products_name_key ON products IS 'Unique constraint on product name to allow upserts';
