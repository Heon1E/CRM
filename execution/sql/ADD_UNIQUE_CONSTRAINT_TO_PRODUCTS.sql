-- Make product name unique to verify upsert functionality
ALTER TABLE products
ADD CONSTRAINT products_name_key UNIQUE (name);

-- Comment
COMMENT ON CONSTRAINT products_name_key ON products IS 'Ensure unique product names to allowed bulk upsert';
