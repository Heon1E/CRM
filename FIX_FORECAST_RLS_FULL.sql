-- RLS FIX V2: Drop existing policies first to avoid "already exists" errors
ALTER TABLE public.revenue_forecasts ENABLE ROW LEVEL SECURITY;

-- 1. Drop old policies if they exist (Clean slate)
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.revenue_forecasts;
DROP POLICY IF EXISTS "Enable select for users based on user_id" ON public.revenue_forecasts;
DROP POLICY IF EXISTS "Enable update for users based on user_id" ON public.revenue_forecasts;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.revenue_forecasts;

-- 2. Re-create correct policies
-- Allow INSERT
CREATE POLICY "Enable insert for authenticated users only" ON public.revenue_forecasts
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Allow SELECT
CREATE POLICY "Enable select for users based on user_id" ON public.revenue_forecasts
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Allow UPDATE
CREATE POLICY "Enable update for users based on user_id" ON public.revenue_forecasts
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);
