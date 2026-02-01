-- 1. 중복 데이터 정리 (가장 최신 데이터만 남기고 삭제)
-- 이름이 같은 제품 중 created_at이 오래된 것들을 삭제합니다.
DELETE FROM products
WHERE id IN (
    SELECT id
    FROM (
        SELECT id,
        ROW_NUMBER() OVER (partition BY name ORDER BY created_at DESC) as r_num
        FROM products
    ) t
    WHERE t.r_num > 1
);

-- 2. 기존 제약조건 삭제 (설정이 꼬였을 수 있으므로 제거)
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_name_key;

-- 3. 올바른 제약조건 다시 생성
ALTER TABLE products ADD CONSTRAINT products_name_key UNIQUE (name);

-- 4. 확인
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'products_name_key';
