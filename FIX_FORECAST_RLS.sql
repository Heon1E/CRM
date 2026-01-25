-- Enable RLS on the table if not already
ALTER TABLE public.revenue_forecasts ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to INSERT their own forecasts
CREATE POLICY "Enable insert for authenticated users only" ON public.revenue_forecasts
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Allow users to SELECT their own forecasts (if not exists)
CREATE POLICY "Enable select for users based on user_id" ON public.revenue_forecasts
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Allow users to UPDATE their own forecasts (optional but good)
CREATE POLICY "Enable update for users based on user_id" ON public.revenue_forecasts
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);
