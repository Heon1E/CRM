-- Migration: Add client_contacts table for multiple contacts per client
-- Date: 2026-01-XX
-- Description: Create client_contacts table to support multiple contacts per client

-- 1. Create client_contacts table
CREATE TABLE IF NOT EXISTS client_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  department_role TEXT,
  phone TEXT,
  email TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  CONSTRAINT client_contacts_name_not_empty CHECK (LENGTH(TRIM(name)) > 0)
);

-- 2. Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_client_contacts_client_id ON client_contacts(client_id);
CREATE INDEX IF NOT EXISTS idx_client_contacts_created_by ON client_contacts(created_by);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE client_contacts ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS policies
-- Policy: Users can only see their own client_contacts
CREATE POLICY "Users can view own client_contacts"
  ON client_contacts
  FOR SELECT
  USING (auth.uid() = created_by);

-- Policy: Users can insert their own client_contacts
CREATE POLICY "Users can insert own client_contacts"
  ON client_contacts
  FOR INSERT
  WITH CHECK (auth.uid() = created_by);

-- Policy: Users can update their own client_contacts
CREATE POLICY "Users can update own client_contacts"
  ON client_contacts
  FOR UPDATE
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

-- Policy: Users can delete their own client_contacts
CREATE POLICY "Users can delete own client_contacts"
  ON client_contacts
  FOR DELETE
  USING (auth.uid() = created_by);

-- 5. Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_client_contacts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Create trigger for updated_at
CREATE TRIGGER set_client_contacts_updated_at
  BEFORE UPDATE ON client_contacts
  FOR EACH ROW
  EXECUTE FUNCTION update_client_contacts_updated_at();

-- Note: The existing clients.contact_person column remains for backward compatibility
-- You can migrate existing data later if needed
