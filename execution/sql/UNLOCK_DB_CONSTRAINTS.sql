-- =================================================================
-- [CORRECTED FIX] Unlock Database Constraints (No Login Required)
-- =================================================================
-- I apologize. The previous file contained the wrong code by mistake.
-- THIS is the correct script to remove the "User Check" entirely.
--
-- Running this will allow you to save data without 'public.users'.

-- 1. Drop User Check from Activities
ALTER TABLE public.activities 
DROP CONSTRAINT IF EXISTS activities_created_by_fkey;

-- 2. Drop User Check from Clients
ALTER TABLE public.clients 
DROP CONSTRAINT IF EXISTS clients_created_by_fkey;

-- 3. Drop User Check from Products
ALTER TABLE public.products 
DROP CONSTRAINT IF EXISTS products_created_by_fkey;

-- 4. Drop User Check from Revenue Forecasts
ALTER TABLE public.revenue_forecasts 
DROP CONSTRAINT IF EXISTS revenue_forecasts_created_by_fkey;

-- 5. Drop User Check from Issues
ALTER TABLE public.issues 
DROP CONSTRAINT IF EXISTS issues_created_by_fkey;

-- Result: Foreign Key errors will disappear immediately.
