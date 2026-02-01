-- Migration: Add is_primary field to client_contacts table
-- Date: 2026-01-XX
-- Description: Add is_primary boolean field to identify Key-man (primary contact) per client

-- 1. Add is_primary column (default false)
ALTER TABLE client_contacts 
ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT false;

-- 2. Create index for faster lookups of primary contacts
CREATE INDEX IF NOT EXISTS idx_client_contacts_is_primary ON client_contacts(client_id, is_primary) WHERE is_primary = true;

-- 3. Add constraint: Only one primary contact per client (optional, can be enforced in application logic)
-- Note: This constraint is complex to implement at DB level, so we'll enforce it in application logic
-- CREATE UNIQUE INDEX IF NOT EXISTS idx_client_contacts_one_primary_per_client 
-- ON client_contacts(client_id) WHERE is_primary = true;

-- 4. Update existing data: Set the first contact of each client as primary (if not already set)
UPDATE client_contacts
SET is_primary = true
WHERE id IN (
  SELECT DISTINCT ON (client_id) id
  FROM client_contacts
  WHERE is_primary IS NULL OR is_primary = false
  ORDER BY client_id, created_at ASC
);
