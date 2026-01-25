-- =================================================================
-- [FIX] Ensure Issues Table Exists & Has 'created_by'
-- =================================================================
-- The error "Could not find the 'created_by' column" means the column is missing.
-- This script ensures the table and column exist.

CREATE TABLE IF NOT EXISTS public.issues (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT,
  status TEXT DEFAULT '등록',
  target_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Add created_by column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='issues' AND column_name='created_by') THEN
        ALTER TABLE public.issues ADD COLUMN created_by UUID;
    END IF;
END $$;

-- Drop foreign key constraint on created_by (to allow anonymous/system users)
ALTER TABLE public.issues 
DROP CONSTRAINT IF EXISTS issues_created_by_fkey;
