-- Enable PostgreSQL extensions for advanced search
-- pg_trgm: Trigram matching for fuzzy search
-- unaccent: Remove accents for better text matching (useful for Persian/English)

-- Enable pg_trgm extension for trigram similarity search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Enable unaccent extension for accent-insensitive search
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Create trigram indexes for product search (without CONCURRENTLY for migration)
CREATE INDEX IF NOT EXISTS product_title_trgm_idx 
ON "Product" USING GIN (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS product_description_trgm_idx 
ON "Product" USING GIN (description gin_trgm_ops);

-- Create combined text index for full-text search
CREATE INDEX IF NOT EXISTS product_search_idx 
ON "Product" USING GIN (to_tsvector('english', title || ' ' || description));

-- Create index for category-based filtering
CREATE INDEX IF NOT EXISTS product_category_active_idx 
ON "Product" ("categoryId", active) WHERE active = true;

-- Create index for price range filtering
CREATE INDEX IF NOT EXISTS product_price_active_idx 
ON "Product" ("priceToman", active) WHERE active = true;

-- Create index for seller-based filtering with verification
CREATE INDEX IF NOT EXISTS product_seller_verified_idx 
ON "Product" ("sellerId", active);

-- Add index for combined search with filters
CREATE INDEX IF NOT EXISTS product_search_filter_idx 
ON "Product" (active, "eligibilityStatus", "categoryId", "priceToman", "createdAt") 
WHERE active = true AND "eligibilityStatus" = 'APPROVED';