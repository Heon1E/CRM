-- =================================================================
-- [CRITICAL] FORCE REFRESH SCHEMA CACHE
-- =================================================================
-- If you added columns (like 'created_by') but the API still says 
-- "Could not find column", you MUST run this to tell the API to refresh.

NOTIFY pgrst, 'reload config';

-- Also, just to be absolutely sure, let's re-run the column addition safely
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='issues' AND column_name='created_by') THEN
        ALTER TABLE public.issues ADD COLUMN created_by UUID;
    END IF;
END $$;
