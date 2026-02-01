-- Find a valid user ID to use as fallback
SELECT id, email FROM auth.users LIMIT 1;

-- If auth.users is not accessible (though it should be in SQL Editor), try sales
SELECT DISTINCT created_by FROM sales WHERE created_by != '00000000-0000-0000-0000-000000000000' LIMIT 1;
