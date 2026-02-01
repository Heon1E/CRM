-- RLS FIX: Robust Version
-- This script first DROPS existing policies to prevent "already exists" errors.
-- Then it creates the correct permissions.

ALTER TABLE public.revenue_forecasts ENABLE ROW LEVEL SECURITY;

-- 1. DROP Existing Policies (Clean Slate)
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.revenue_forecasts;
DROP POLICY IF EXISTS "Enable select for users based on user_id" ON public.revenue_forecasts;
DROP POLICY IF EXISTS "Enable update for users based on user_id" ON public.revenue_forecasts;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.revenue_forecasts;

-- 2. CREATE Policies
-- Allow Authenticated Users to INSERT their own forecasts
CREATE POLICY "Enable insert for authenticated users only" ON public.revenue_forecasts
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Allow Users to SELECT their own forecasts
CREATE POLICY "Enable select for users based on user_id" ON public.revenue_forecasts
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Allow Users to UPDATE their own forecasts
CREATE POLICY "Enable update for users based on user_id" ON public.revenue_forecasts
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);
