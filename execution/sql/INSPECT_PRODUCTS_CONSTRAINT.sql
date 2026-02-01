-- 1. Check exact definition of the constraint
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'products_name_key';

-- 2. Check for potential blocking duplicates (just in case)
SELECT name, count(*)
FROM products
GROUP BY name
HAVING count(*) > 1;

-- 3. Check columns of products table
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'products';
