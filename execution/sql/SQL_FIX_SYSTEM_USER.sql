-- =================================================================
-- [CRITICAL FIX] System User Registration (Foreign Key Error Fix)
-- =================================================================
-- This script inserts a 'System Admin' user into public.users.
-- This ID (00000000-0000-0000-0000-000000000000) is used by the App
-- as a fallback when the actual user is not found or during initial setup.
--
-- Running this script will immediately solve the error:
-- "Key (created_by)=(00000000-...) is not present in table users"

INSERT INTO public.users (id, email, name, created_at)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'system@crm.com',
  'System Admin',
  NOW()
)
ON CONFLICT (id) DO UPDATE 
SET name = 'System Admin';

-- Verify the insertion
SELECT * FROM public.users WHERE id = '00000000-0000-0000-0000-000000000000';
