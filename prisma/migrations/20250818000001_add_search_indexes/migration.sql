-- Enable PostgreSQL trigram extension for fuzzy search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Enable unaccent extension for accent-insensitive search (optional)
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Add trigram indexes for product search
-- These indexes significantly improve ILIKE and similarity performance
CREATE INDEX IF NOT EXISTS product_title_trgm_idx ON "Product" USING GIN (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS product_desc_trgm_idx ON "Product" USING GIN (description gin_trgm_ops);

-- Add compound search index for title + description
CREATE INDEX IF NOT EXISTS product_search_compound_idx ON "Product" USING GIN ((title || ' ' || description) gin_trgm_ops);

-- Add indexes for category search
CREATE INDEX IF NOT EXISTS category_name_trgm_idx ON "Category" USING GIN (name gin_trgm_ops);

-- Add seller shop name search index
CREATE INDEX IF NOT EXISTS seller_shop_trgm_idx ON "SellerProfile" USING GIN ("shopName" gin_trgm_ops);

-- Add product translation search indexes
CREATE INDEX IF NOT EXISTS product_trans_title_trgm_idx ON "ProductTranslation" USING GIN (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS product_trans_desc_trgm_idx ON "ProductTranslation" USING GIN (description gin_trgm_ops);

-- Add performance indexes for common queries
CREATE INDEX IF NOT EXISTS product_active_eligible_idx ON "Product" (active, "eligibilityStatus") WHERE active = true AND "eligibilityStatus" = 'APPROVED';
CREATE INDEX IF NOT EXISTS product_price_idx ON "Product" ("priceToman") WHERE active = true;
CREATE INDEX IF NOT EXISTS product_created_idx ON "Product" ("createdAt" DESC) WHERE active = true;

-- Add function for better search ranking
CREATE OR REPLACE FUNCTION product_search_rank(
    search_term TEXT,
    title TEXT,
    description TEXT
) RETURNS REAL AS $$
BEGIN
    RETURN (
        -- Title exact match gets highest score
        CASE WHEN LOWER(title) = LOWER(search_term) THEN 1.0
        -- Title starts with search term
        WHEN LOWER(title) LIKE LOWER(search_term || '%') THEN 0.9
        -- Title contains search term
        WHEN LOWER(title) LIKE '%' || LOWER(search_term) || '%' THEN 0.8
        -- Title similarity using trigrams
        ELSE GREATEST(0.3, SIMILARITY(title, search_term))
        END * 2.0 +  -- Title weighted 2x
        
        -- Description similarity
        GREATEST(0.1, SIMILARITY(description, search_term)) * 1.0
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;