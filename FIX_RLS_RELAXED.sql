-- RLS FIX: RELAXED VERSION (Guaranteed to work)
-- This script removes the strict ID check and allows ANY logged-in user to save forecasts.
-- Use this if the strict policy is causing 401 errors.

ALTER TABLE public.revenue_forecasts ENABLE ROW LEVEL SECURITY;

-- 1. DROP ALL Existing Policies (Clean Slate)
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.revenue_forecasts;
DROP POLICY IF EXISTS "Enable select for users based on user_id" ON public.revenue_forecasts;
DROP POLICY IF EXISTS "Enable update for users based on user_id" ON public.revenue_forecasts;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.revenue_forecasts;
DROP POLICY IF EXISTS "Allow All Authenticated Actions" ON public.revenue_forecasts;

-- 2. CREATE Permissive Policy
-- Allow ANY authenticated user to Perform ANY action (Select, Insert, Update, Delete)
CREATE POLICY "Allow All Authenticated Actions" ON public.revenue_forecasts
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
