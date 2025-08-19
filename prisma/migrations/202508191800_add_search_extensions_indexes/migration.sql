-- S4: Add trigram and unaccent extensions, search indexes, and product_search_rank function
-- Safe to run multiple times with IF NOT EXISTS checks

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Trigram indexes for better fuzzy search
CREATE INDEX IF NOT EXISTS product_title_trgm_idx ON "Product" USING GIN (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS product_desc_trgm_idx ON "Product" USING GIN (description gin_trgm_ops);
CREATE INDEX IF NOT EXISTS product_search_compound_idx ON "Product" USING GIN ((title || ' ' || description) gin_trgm_ops);

-- Helpful related indexes
CREATE INDEX IF NOT EXISTS category_name_trgm_idx ON "Category" USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS seller_shop_trgm_idx ON "SellerProfile" USING GIN ("shopName" gin_trgm_ops);

-- Function used by lib/search.ts ranking
CREATE OR REPLACE FUNCTION product_search_rank(
    search_term TEXT,
    title TEXT,
    description TEXT
) RETURNS REAL AS $$
BEGIN
    RETURN (
        CASE WHEN LOWER(title) = LOWER(search_term) THEN 1.0
             WHEN LOWER(title) LIKE LOWER(search_term || '%') THEN 0.9
             WHEN LOWER(title) LIKE '%' || LOWER(search_term) || '%' THEN 0.8
             ELSE GREATEST(0.3, SIMILARITY(title, search_term))
        END * 2.0
        + GREATEST(0.1, SIMILARITY(description, search_term))
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;
